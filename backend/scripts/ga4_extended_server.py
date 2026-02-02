#!/usr/bin/env python3
"""
GA4 Extended MCP Server
========================
analytics-mcp (外部パッケージ) に含まれない GA4 Data API + Admin API
エンドポイントを補完する FastMCP サーバー。

提供ツール:
  Data API v1beta:
    - check_compatibility: ディメンション/メトリクス互換性検証
    - get_all_metadata: 全ディメンション・メトリクス一覧
    - batch_run_reports: 最大5レポート一括実行
    - run_pivot_report: クロス集計/ピボット分析
  Data API v1alpha:
    - run_funnel_report: ファネル分析（実験的）
  Admin API v1beta:
    - list_key_events: コンバージョン/キーイベント一覧
    - list_data_streams: データストリーム一覧
    - list_custom_dimensions: カスタムディメンション設定
    - list_custom_metrics: カスタムメトリクス設定

認証: GOOGLE_APPLICATION_CREDENTIALS 環境変数（analytics-mcp と同一）
"""

import json
import logging
import os
from typing import Any, Dict, List

import google.auth
import proto
from google.analytics import admin_v1beta, data_v1beta
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("ga4-extended-server")

mcp = FastMCP("ga4-extended-server")

_SCOPE = ("https://www.googleapis.com/auth/analytics.readonly",)


# ── Helpers ──


def _creds() -> google.auth.credentials.Credentials:
    c, _ = google.auth.default(scopes=_SCOPE)
    return c


def _data_client() -> data_v1beta.BetaAnalyticsDataAsyncClient:
    return data_v1beta.BetaAnalyticsDataAsyncClient(credentials=_creds())


def _admin_client() -> admin_v1beta.AnalyticsAdminServiceAsyncClient:
    return admin_v1beta.AnalyticsAdminServiceAsyncClient(credentials=_creds())


def _property_rn(pid: str | int) -> str:
    """Normalize property ID to 'properties/NNN' format."""
    s = str(pid).strip()
    if s.startswith("properties/"):
        return s
    return f"properties/{s}"


def _proto_to_dict(obj: proto.Message) -> Dict[str, Any]:
    return type(obj).to_dict(
        obj, use_integers_for_enums=False, preserving_proto_field_name=True
    )


# ── Data API v1beta Tools ──


@mcp.tool()
async def check_compatibility(
    property_id: str,
    dimensions: str = "",
    metrics: str = "",
) -> str:
    """Check if dimensions and metrics can be used together in a report.

    Use this BEFORE running a report when unsure if a combination is valid.
    Returns which dimensions/metrics are compatible and which are not.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
        dimensions: Comma-separated dimension names (e.g. 'date,sessionDefaultChannelGroup')
        metrics: Comma-separated metric names (e.g. 'sessions,activeUsers')
    """
    request = data_v1beta.CheckCompatibilityRequest(
        property=_property_rn(property_id),
    )
    if dimensions:
        request.dimensions = [
            data_v1beta.Dimension(name=d.strip())
            for d in dimensions.split(",")
            if d.strip()
        ]
    if metrics:
        request.metrics = [
            data_v1beta.Metric(name=m.strip())
            for m in metrics.split(",")
            if m.strip()
        ]

    response = await _data_client().check_compatibility(request)

    lines = ["## Compatibility Check Results\n"]

    if response.dimension_compatibilities:
        lines.append("### Dimensions")
        for dc in response.dimension_compatibilities:
            dim = dc.dimension_metadata
            compat = dc.compatibility.name if dc.compatibility else "UNKNOWN"
            name = dim.api_name if dim else "?"
            lines.append(f"- **{name}**: {compat}")

    if response.metric_compatibilities:
        lines.append("\n### Metrics")
        for mc in response.metric_compatibilities:
            met = mc.metric_metadata
            compat = mc.compatibility.name if mc.compatibility else "UNKNOWN"
            name = met.api_name if met else "?"
            lines.append(f"- **{name}**: {compat}")

    return "\n".join(lines)


@mcp.tool()
async def get_all_metadata(property_id: str) -> str:
    """List ALL available dimensions and metrics (standard + custom) for a property.

    Returns a compact TSV of every dimension and metric that can be used
    in run_report for this property, including api_name, category, and description.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
    """
    request = data_v1beta.GetMetadataRequest(
        name=f"{_property_rn(property_id)}/metadata",
    )
    response = await _data_client().get_metadata(request)

    lines = []

    # Dimensions
    lines.append("## Dimensions")
    lines.append("api_name\tcategory\tdescription\tcustom")
    for dim in response.dimensions:
        custom = "yes" if dim.custom_definition else "no"
        desc = (dim.description or "")[:80]
        lines.append(f"{dim.api_name}\t{dim.category}\t{desc}\t{custom}")

    lines.append("")

    # Metrics
    lines.append("## Metrics")
    lines.append("api_name\tcategory\tdescription\ttype\tcustom")
    for met in response.metrics:
        custom = "yes" if met.custom_definition else "no"
        desc = (met.description or "")[:80]
        met_type = met.type_.name if met.type_ else ""
        lines.append(
            f"{met.api_name}\t{met.category}\t{desc}\t{met_type}\t{custom}"
        )

    return "\n".join(lines)


@mcp.tool()
async def batch_run_reports(
    property_id: str,
    requests_json: str,
) -> str:
    """Run up to 5 reports in a single API call for efficiency.

    Each report in the array follows the same format as run_report parameters.
    This is more efficient than calling run_report multiple times sequentially.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
        requests_json: JSON array of report configs. Each config:
            {
                "date_ranges": [{"start_date": "28daysAgo", "end_date": "yesterday"}],
                "dimensions": ["date"],
                "metrics": ["sessions", "activeUsers"],
                "dimension_filter": {...},  (optional)
                "metric_filter": {...},     (optional)
                "order_bys": [...],         (optional)
                "limit": 1000,              (optional)
                "offset": 0                 (optional)
            }
    """
    try:
        configs = json.loads(requests_json)
    except json.JSONDecodeError:
        return "Error: requests_json is not valid JSON"

    if not isinstance(configs, list) or len(configs) == 0:
        return "Error: requests_json must be a non-empty JSON array"
    if len(configs) > 5:
        return "Error: Maximum 5 reports per batch"

    prop = _property_rn(property_id)
    sub_requests = []

    for cfg in configs:
        req = data_v1beta.RunReportRequest(
            property=prop,
            dimensions=[
                data_v1beta.Dimension(name=d) for d in cfg.get("dimensions", [])
            ],
            metrics=[
                data_v1beta.Metric(name=m) for m in cfg.get("metrics", [])
            ],
            date_ranges=[
                data_v1beta.DateRange(dr) for dr in cfg.get("date_ranges", [])
            ],
        )
        if cfg.get("dimension_filter"):
            req.dimension_filter = data_v1beta.FilterExpression(
                cfg["dimension_filter"]
            )
        if cfg.get("metric_filter"):
            req.metric_filter = data_v1beta.FilterExpression(
                cfg["metric_filter"]
            )
        if cfg.get("order_bys"):
            req.order_bys = [
                data_v1beta.OrderBy(ob) for ob in cfg["order_bys"]
            ]
        if cfg.get("limit"):
            req.limit = cfg["limit"]
        if cfg.get("offset"):
            req.offset = cfg["offset"]
        sub_requests.append(req)

    batch_request = data_v1beta.BatchRunReportsRequest(
        property=prop,
        requests=sub_requests,
    )
    response = await _data_client().batch_run_reports(batch_request)

    # Return as JSON with reports array
    reports = []
    for report in response.reports:
        reports.append(_proto_to_dict(report))

    return json.dumps({"reports": reports}, ensure_ascii=False)


@mcp.tool()
async def run_pivot_report(
    property_id: str,
    date_ranges_json: str,
    dimensions: str,
    metrics: str,
    pivots_json: str,
    dimension_filter: str = "",
    limit: int = 0,
) -> str:
    """Run a pivot (cross-tab) report for multi-dimensional analysis.

    Creates a matrix/pivot table (e.g., sessions by channel AND device).
    Each pivot defines a set of dimensions to pivot on with their own row limits.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
        date_ranges_json: JSON array of date ranges, e.g. [{"start_date":"28daysAgo","end_date":"yesterday"}]
        dimensions: Comma-separated dimension names (all dimensions used in pivots + row keys)
        metrics: Comma-separated metric names
        pivots_json: JSON array of pivot definitions, e.g.:
            [
                {"field_names": ["sessionDefaultChannelGroup"], "limit": 5},
                {"field_names": ["deviceCategory"], "limit": 3}
            ]
            Each pivot: field_names (list of dimension names), limit (max values), offset (optional)
        dimension_filter: Optional JSON FilterExpression
        limit: Optional row limit
    """
    try:
        date_ranges = json.loads(date_ranges_json)
        pivots = json.loads(pivots_json)
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON - {e}"

    prop = _property_rn(property_id)
    request = data_v1beta.RunPivotReportRequest(
        property=prop,
        dimensions=[
            data_v1beta.Dimension(name=d.strip())
            for d in dimensions.split(",")
            if d.strip()
        ],
        metrics=[
            data_v1beta.Metric(name=m.strip())
            for m in metrics.split(",")
            if m.strip()
        ],
        date_ranges=[data_v1beta.DateRange(dr) for dr in date_ranges],
        pivots=[data_v1beta.Pivot(p) for p in pivots],
    )

    if dimension_filter:
        try:
            request.dimension_filter = data_v1beta.FilterExpression(
                json.loads(dimension_filter)
            )
        except json.JSONDecodeError:
            pass

    if limit > 0:
        request.limit = limit

    response = await _data_client().run_pivot_report(request)
    return json.dumps(_proto_to_dict(response), ensure_ascii=False)


# ── Admin API v1beta Tools ──


@mcp.tool()
async def list_key_events(property_id: str) -> str:
    """List all key events (conversions) configured for a GA4 property.

    Returns event names, counting method, and creation source.
    Use this to understand what conversions are being tracked before running conversion reports.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
    """
    request = admin_v1beta.ListKeyEventsRequest(
        parent=_property_rn(property_id),
    )
    pager = await _admin_client().list_key_events(request)

    lines = ["## Key Events (Conversions)\n"]
    lines.append("| Event Name | Counting Method | Custom | Created |")
    lines.append("|---|---|---|---|")

    count = 0
    async for page in pager.pages:
        for event in page.key_events:
            name = event.event_name or "?"
            method = (
                event.counting_method.name if event.counting_method else "N/A"
            )
            custom = "Yes" if event.custom else "No"
            created = str(event.create_time or "N/A")
            lines.append(f"| {name} | {method} | {custom} | {created} |")
            count += 1

    if count == 0:
        return "No key events configured for this property."

    lines.insert(1, f"**Total: {count} events**\n")
    return "\n".join(lines)


@mcp.tool()
async def list_data_streams(property_id: str) -> str:
    """List all data streams (web/app) for a GA4 property.

    Returns stream names, types, measurement IDs, and URLs.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
    """
    request = admin_v1beta.ListDataStreamsRequest(
        parent=_property_rn(property_id),
    )
    pager = await _admin_client().list_data_streams(request)

    lines = ["## Data Streams\n"]
    lines.append("| Name | Type | Measurement ID / App ID | URL |")
    lines.append("|---|---|---|---|")

    count = 0
    async for page in pager.pages:
        for stream in page.data_streams:
            name = stream.display_name or "?"
            stream_type = stream.type_.name if stream.type_ else "UNKNOWN"

            mid = ""
            url = ""
            if stream.web_stream_data:
                mid = stream.web_stream_data.measurement_id or ""
                url = stream.web_stream_data.default_uri or ""
            elif stream.android_app_stream_data:
                mid = stream.android_app_stream_data.package_name or ""
            elif stream.ios_app_stream_data:
                mid = stream.ios_app_stream_data.bundle_id or ""

            lines.append(f"| {name} | {stream_type} | {mid} | {url} |")
            count += 1

    if count == 0:
        return "No data streams found for this property."

    return "\n".join(lines)


@mcp.tool()
async def list_custom_dimensions(property_id: str) -> str:
    """List all custom dimensions with their configuration details.

    Returns parameter name, display name, scope, and description for each custom dimension.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
    """
    request = admin_v1beta.ListCustomDimensionsRequest(
        parent=_property_rn(property_id),
    )
    pager = await _admin_client().list_custom_dimensions(request)

    lines = ["## Custom Dimensions\n"]
    lines.append("| Parameter Name | Display Name | Scope | Description |")
    lines.append("|---|---|---|---|")

    count = 0
    async for page in pager.pages:
        for dim in page.custom_dimensions:
            param = dim.parameter_name or "?"
            display = dim.display_name or ""
            scope = dim.scope.name if dim.scope else "N/A"
            desc = (dim.description or "")[:60]
            lines.append(f"| {param} | {display} | {scope} | {desc} |")
            count += 1

    if count == 0:
        return "No custom dimensions found for this property."

    return "\n".join(lines)


@mcp.tool()
async def list_custom_metrics(property_id: str) -> str:
    """List all custom metrics with their configuration details.

    Returns parameter name, display name, scope, measurement unit, and description.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
    """
    request = admin_v1beta.ListCustomMetricsRequest(
        parent=_property_rn(property_id),
    )
    pager = await _admin_client().list_custom_metrics(request)

    lines = ["## Custom Metrics\n"]
    lines.append("| Parameter Name | Display Name | Scope | Unit | Description |")
    lines.append("|---|---|---|---|---|")

    count = 0
    async for page in pager.pages:
        for met in page.custom_metrics:
            param = met.parameter_name or "?"
            display = met.display_name or ""
            scope = met.scope.name if met.scope else "N/A"
            unit = met.measurement_unit.name if met.measurement_unit else "N/A"
            desc = (met.description or "")[:60]
            lines.append(f"| {param} | {display} | {scope} | {unit} | {desc} |")
            count += 1

    if count == 0:
        return "No custom metrics found for this property."

    return "\n".join(lines)


# ── Data API v1alpha Tools ──


@mcp.tool()
async def run_funnel_report(
    property_id: str,
    funnel_json: str,
    date_ranges_json: str,
    funnel_breakdown_json: str = "",
) -> str:
    """Run a funnel analysis report showing step-by-step completion and drop-off rates.

    NOTE: This uses the v1alpha API which is experimental and may change.

    Args:
        property_id: GA4 property ID (number or 'properties/NNN')
        funnel_json: JSON object defining funnel steps:
            {
                "steps": [
                    {
                        "name": "Page View",
                        "filter_expression": {
                            "event_filter": {"event_name": "page_view"}
                        }
                    },
                    {
                        "name": "Add to Cart",
                        "filter_expression": {
                            "event_filter": {"event_name": "add_to_cart"}
                        }
                    },
                    {
                        "name": "Purchase",
                        "filter_expression": {
                            "event_filter": {"event_name": "purchase"}
                        }
                    }
                ],
                "is_open_funnel": false
            }
            Each step needs 'name' and 'filter_expression' with 'event_filter'.
            is_open_funnel: if true, users can enter funnel at any step (default: false = closed)
        date_ranges_json: JSON array, e.g. [{"start_date":"28daysAgo","end_date":"yesterday"}]
        funnel_breakdown_json: Optional JSON for breakdown dimension, e.g.:
            {"breakdown_dimension": {"name": "deviceCategory"}, "limit": 5}
    """
    try:
        from google.analytics import data_v1alpha

        funnel_def = json.loads(funnel_json)
        date_ranges = json.loads(date_ranges_json)
    except ImportError:
        return "Error: google-analytics-data v1alpha module not available"
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON - {e}"

    prop = _property_rn(property_id)

    # Build funnel steps
    steps = []
    for step_def in funnel_def.get("steps", []):
        step = data_v1alpha.FunnelStep(step_def)
        steps.append(step)

    if not steps:
        return "Error: At least one funnel step is required"

    funnel = data_v1alpha.Funnel(
        steps=steps,
        is_open_funnel=funnel_def.get("is_open_funnel", False),
    )

    request = data_v1alpha.RunFunnelReportRequest(
        property=prop,
        funnel=funnel,
        date_ranges=[data_v1alpha.DateRange(dr) for dr in date_ranges],
    )

    if funnel_breakdown_json:
        try:
            breakdown = json.loads(funnel_breakdown_json)
            request.funnel_breakdown = data_v1alpha.FunnelBreakdown(breakdown)
        except (json.JSONDecodeError, Exception):
            pass  # Ignore invalid breakdown

    client = data_v1alpha.AlphaAnalyticsDataAsyncClient(credentials=_creds())
    response = await client.run_funnel_report(request)

    return json.dumps(_proto_to_dict(response), ensure_ascii=False)


if __name__ == "__main__":
    mcp.run(transport="stdio")
