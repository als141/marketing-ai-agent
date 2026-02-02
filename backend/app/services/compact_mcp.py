"""
Compact MCP Server Wrapper
===========================
MCPServerStdio をラップし、GA4 の verbose な proto_to_dict JSON 出力を
compact TSV 形式に変換してトークン消費を ~76% 削減する。

変換対象ツール:
  - run_report / run_realtime_report: dimension_headers/metric_headers/rows → TSV
  - batch_run_reports: 複数レポートをそれぞれTSV化
  - run_pivot_report: ピボットヘッダーを展開してTSV化
  - run_funnel_report: ファネルテーブルをTSV化

非対象ツール（そのまま通す）:
  - get_account_summaries, get_property_details 等（出力が小さい）
  - check_compatibility, get_all_metadata 等（既にコンパクト形式）
  - GSC ツール（既にマークダウンテーブル形式で効率的）
"""

from __future__ import annotations

import json
import logging
from typing import Any, TYPE_CHECKING

from mcp import Tool as MCPTool
from mcp.types import (
    CallToolResult,
    GetPromptResult,
    ListPromptsResult,
    TextContent,
)

if TYPE_CHECKING:
    from agents.mcp.server import MCPServer
    from agents.run_context import RunContextWrapper
    from agents.agent import AgentBase

logger = logging.getLogger(__name__)


def _compact_ga4_report(raw_json: str) -> str:
    """Convert verbose GA4 proto_to_dict JSON into compact TSV.

    Input format (proto_to_dict):
        {
          "dimension_headers": [{"name": "date"}, ...],
          "metric_headers": [{"name": "sessions", "type_": "TYPE_INTEGER"}, ...],
          "rows": [
            {
              "dimension_values": [{"value": "20260127"}, ...],
              "metric_values": [{"value": "153"}, ...]
            }, ...
          ],
          "row_count": 140,
          "totals": [], "maximums": [], "minimums": [], "kind": ""
        }

    Output format (compact TSV):
        date\tchannel\tsessions\tactiveUsers
        20260127\tOrganic Search\t153\t130
        ...
        ---
        rows: 140
    """
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return raw_json  # Not JSON, return as-is

    if not isinstance(data, dict):
        return raw_json

    dim_headers = data.get("dimension_headers") or data.get("dimensionHeaders")
    metric_headers = data.get("metric_headers") or data.get("metricHeaders")
    rows = data.get("rows")

    if not dim_headers or not metric_headers or not rows:
        return raw_json  # Not a report response, return as-is

    # Build header row
    dim_names = [h.get("name", "") for h in dim_headers]
    metric_names = [h.get("name", "") for h in metric_headers]
    header = "\t".join(dim_names + metric_names)

    # Build data rows
    lines = [header]
    for row in rows:
        dim_vals = row.get("dimension_values") or row.get("dimensionValues") or []
        met_vals = row.get("metric_values") or row.get("metricValues") or []

        dim_strs = [v.get("value", "") for v in dim_vals]
        met_strs = [v.get("value", "") for v in met_vals]
        lines.append("\t".join(dim_strs + met_strs))

    # Add metadata footer
    row_count = data.get("row_count") or data.get("rowCount") or len(rows)
    lines.append("---")
    lines.append(f"rows: {row_count}")

    result = "\n".join(lines)
    logger.info(
        f"[CompactMCP] Compressed GA4 report: {len(raw_json)} → {len(result)} chars "
        f"({100 - len(result) * 100 // max(len(raw_json), 1)}% reduction)"
    )
    return result


def _compact_batch_reports(raw_json: str) -> str:
    """Compact a BatchRunReports response by applying _compact_ga4_report to each sub-report."""
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return raw_json

    if not isinstance(data, dict):
        return raw_json

    reports = data.get("reports")
    if not reports or not isinstance(reports, list):
        return raw_json

    parts = []
    for i, report in enumerate(reports, 1):
        report_json = json.dumps(report, ensure_ascii=False)
        compacted = _compact_ga4_report(report_json)
        parts.append(f"=== Report {i} ===\n{compacted}")

    result = "\n".join(parts)
    logger.info(
        f"[CompactMCP] Compressed batch reports ({len(reports)} reports): "
        f"{len(raw_json)} → {len(result)} chars"
    )
    return result


def _compact_pivot_report(raw_json: str) -> str:
    """Compact a RunPivotReport response into a readable TSV.

    Pivot reports have pivot_headers instead of simple dimension_headers.
    Each row's metric_values are indexed by flattened pivot header combinations.
    """
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return raw_json

    if not isinstance(data, dict):
        return raw_json

    dim_headers = data.get("dimension_headers") or data.get("dimensionHeaders") or []
    metric_headers = data.get("metric_headers") or data.get("metricHeaders") or []
    pivot_headers = data.get("pivot_headers") or data.get("pivotHeaders") or []
    rows = data.get("rows")

    if not rows:
        return raw_json

    # Build dimension column names
    dim_names = [h.get("name", "") for h in dim_headers]
    metric_names = [h.get("name", "") for h in metric_headers]

    # Build pivot column labels from pivot_headers
    # pivot_headers is a list of PivotHeader groups; each group has pivot_dimension_headers
    pivot_col_labels = []
    for ph_group in pivot_headers:
        pdh_list = (
            ph_group.get("pivot_dimension_headers")
            or ph_group.get("pivotDimensionHeaders")
            or []
        )
        for pdh in pdh_list:
            dim_values = (
                pdh.get("dimension_values")
                or pdh.get("dimensionValues")
                or []
            )
            label_parts = [v.get("value", "?") for v in dim_values]
            pivot_col_labels.append("_".join(label_parts) if label_parts else "?")

    # If we have pivot columns, expand metric names with pivot labels
    if pivot_col_labels and metric_names:
        expanded_cols = []
        for plabel in pivot_col_labels:
            for mname in metric_names:
                expanded_cols.append(f"{mname}_{plabel}")
        header = "\t".join(dim_names + expanded_cols)
    else:
        header = "\t".join(dim_names + metric_names)

    lines = [header]
    for row in rows:
        dim_vals = row.get("dimension_values") or row.get("dimensionValues") or []
        met_vals = row.get("metric_values") or row.get("metricValues") or []

        dim_strs = [v.get("value", "") for v in dim_vals]
        met_strs = [v.get("value", "") for v in met_vals]
        lines.append("\t".join(dim_strs + met_strs))

    row_count = data.get("row_count") or data.get("rowCount") or len(rows)
    lines.append("---")
    lines.append(f"rows: {row_count}")

    result = "\n".join(lines)
    logger.info(
        f"[CompactMCP] Compressed pivot report: {len(raw_json)} → {len(result)} chars"
    )
    return result


def _compact_funnel_report(raw_json: str) -> str:
    """Compact a RunFunnelReport response into readable TSV.

    Response has funnel_table and optionally funnel_visualization,
    each being a FunnelSubReport with dimension_headers, metric_headers, rows.
    """
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return raw_json

    if not isinstance(data, dict):
        return raw_json

    parts = []

    for section_key, section_label in [
        ("funnel_table", "Funnel Table"),
        ("funnelTable", "Funnel Table"),
        ("funnel_visualization", "Funnel Visualization"),
        ("funnelVisualization", "Funnel Visualization"),
    ]:
        section = data.get(section_key)
        if not section or not isinstance(section, dict):
            continue

        sub_json = json.dumps(section, ensure_ascii=False)
        compacted = _compact_ga4_report(sub_json)
        # Only add if compaction actually produced something useful
        if compacted != sub_json:
            parts.append(f"=== {section_label} ===\n{compacted}")
        else:
            # Try direct extraction from sub-report structure
            dim_h = section.get("dimension_headers") or section.get("dimensionHeaders") or []
            met_h = section.get("metric_headers") or section.get("metricHeaders") or []
            rows = section.get("rows") or []
            if dim_h and met_h and rows:
                parts.append(f"=== {section_label} ===\n{compacted}")

    if not parts:
        # Fallback: try treating the whole response as a report
        return _compact_ga4_report(raw_json)

    result = "\n".join(parts)
    logger.info(
        f"[CompactMCP] Compressed funnel report: {len(raw_json)} → {len(result)} chars"
    )
    return result


# Mapping of tool names to their compaction functions
_COMPACTORS: dict[str, callable] = {
    "run_report": _compact_ga4_report,
    "run_realtime_report": _compact_ga4_report,
    "batch_run_reports": _compact_batch_reports,
    "run_pivot_report": _compact_pivot_report,
    "run_funnel_report": _compact_funnel_report,
}


class CompactMCPServer:
    """Proxy that wraps an MCPServer and compresses verbose tool outputs.

    Implements the same interface as MCPServer so the Agents SDK treats it
    as a regular MCP server. Delegates all calls to the inner server,
    but transforms call_tool outputs for specific tools.

    Also enforces a max character limit on ALL tool outputs to prevent
    context window overflow.
    """

    def __init__(self, inner: Any, max_output_chars: int = 16000):
        self._inner = inner
        self._max_output_chars = max_output_chars

    # --- Proxied properties ---

    @property
    def name(self) -> str:
        return self._inner.name

    # Forward any attribute access to inner server (cache_tools_list, etc.)
    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    # --- Context manager ---

    async def __aenter__(self):
        await self._inner.__aenter__()
        return self

    async def __aexit__(self, *args):
        return await self._inner.__aexit__(*args)

    # --- MCPServer interface ---

    async def connect(self):
        return await self._inner.connect()

    async def cleanup(self):
        return await self._inner.cleanup()

    async def list_tools(
        self,
        run_context: Any = None,
        agent: Any = None,
    ) -> list[MCPTool]:
        return await self._inner.list_tools(run_context, agent)

    async def call_tool(
        self, tool_name: str, arguments: dict[str, Any] | None
    ) -> CallToolResult:
        result = await self._inner.call_tool(tool_name, arguments)

        if not result or not hasattr(result, "content") or not result.content:
            return result

        new_content = []
        for item in result.content:
            if not hasattr(item, "text") or not item.text:
                new_content.append(item)
                continue

            text = item.text

            # Apply compaction for specific tools
            compactor = _COMPACTORS.get(tool_name)
            if compactor:
                text = compactor(text)

            # Enforce max output character limit
            if len(text) > self._max_output_chars:
                # For TSV: truncate by lines to keep data coherent
                lines = text.split("\n")
                truncated_lines = []
                char_count = 0
                for line in lines:
                    if char_count + len(line) + 1 > self._max_output_chars - 80:
                        break
                    truncated_lines.append(line)
                    char_count += len(line) + 1
                total_lines = len(lines)
                kept_lines = len(truncated_lines)
                truncated_lines.append("---")
                truncated_lines.append(
                    f"[truncated: showing {kept_lines}/{total_lines} lines, "
                    f"{self._max_output_chars} char limit]"
                )
                text = "\n".join(truncated_lines)
                logger.info(
                    f"[CompactMCP] Truncated {tool_name} output: "
                    f"{kept_lines}/{total_lines} lines kept"
                )

            new_content.append(TextContent(type="text", text=text))

        return CallToolResult(content=new_content, isError=result.isError)

    async def list_prompts(self) -> ListPromptsResult:
        return await self._inner.list_prompts()

    async def get_prompt(
        self, name: str, arguments: dict[str, Any] | None = None
    ) -> GetPromptResult:
        return await self._inner.get_prompt(name, arguments)
