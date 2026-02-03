"""
Prefixed MCP Server Wrapper
============================
MCPServer をラップし、ツール名にプレフィックスを付与する。
同一ツール名を持つ複数のMCPサーバー（例: 複数WordPressサイト）を
1つのエージェントで使う場合のツール名重複を回避する。

例: label="wordpress_achieve" の場合
  "wp-mcp-get-posts-by-category" → "achieve__wp-mcp-get-posts-by-category"
"""

from __future__ import annotations

from typing import Any

from mcp import Tool as MCPTool
from mcp.types import CallToolResult


class PrefixedMCPServer:
    """Proxy that prefixes tool names to avoid duplicates across MCP servers."""

    def __init__(self, inner: Any, prefix: str):
        self._inner = inner
        self._prefix = prefix

    @property
    def name(self) -> str:
        return f"{self._prefix}_{self._inner.name}"

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    async def __aenter__(self):
        await self._inner.__aenter__()
        return self

    async def __aexit__(self, *args):
        return await self._inner.__aexit__(*args)

    async def connect(self):
        return await self._inner.connect()

    async def cleanup(self):
        return await self._inner.cleanup()

    async def list_tools(
        self,
        run_context: Any = None,
        agent: Any = None,
    ) -> list[MCPTool]:
        tools = await self._inner.list_tools(run_context, agent)
        prefixed = []
        for tool in tools:
            prefixed.append(MCPTool(
                name=f"{self._prefix}__{tool.name}",
                description=tool.description or "",
                inputSchema=tool.inputSchema,
            ))
        return prefixed

    async def call_tool(
        self, tool_name: str, arguments: dict[str, Any] | None
    ) -> CallToolResult:
        # Strip prefix before calling the real server
        real_name = tool_name
        prefix_str = f"{self._prefix}__"
        if tool_name.startswith(prefix_str):
            real_name = tool_name[len(prefix_str):]
        return await self._inner.call_tool(real_name, arguments)

    async def list_prompts(self):
        return await self._inner.list_prompts()

    async def get_prompt(self, name: str, arguments: dict[str, Any] | None = None):
        return await self._inner.get_prompt(name, arguments)
