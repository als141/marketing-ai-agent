import json
from typing import AsyncGenerator
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

from app.services.mcp_manager import MCPSessionManager


class AgentService:
    def __init__(self, mcp_manager: MCPSessionManager):
        self.mcp_manager = mcp_manager

    async def stream_chat(
        self,
        user_id: str,
        refresh_token: str,
        message: str,
        property_id: str,
        conversation_history: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        mcp_server = self.mcp_manager.create_mcp_server(user_id, refresh_token)

        async with mcp_server:
            agent = Agent(
                name="GA4 Analytics Agent",
                instructions=(
                    f"あなたはGoogle Analytics 4のデータ分析エキスパートです。\n"
                    f"ユーザーが分析しているプロパティ: {property_id}\n"
                    f"データをクエリする際は必ずproperty_id: {property_id} を使用してください。\n"
                    f"レポート結果はマークダウンテーブル形式で分かりやすく表示してください。\n"
                    f"ユーザーと同じ言語（主に日本語）で応答してください。\n"
                    f"数値データは適切にフォーマットし、前期比較や傾向分析も可能な場合は補足してください。"
                ),
                model="gpt-5.2",
                mcp_servers=[mcp_server],
            )

            input_messages = []
            if conversation_history:
                input_messages.extend(conversation_history)
            input_messages.append({"role": "user", "content": message})

            result = Runner.run_streamed(agent, input=input_messages)

            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    data = event.data
                    if hasattr(data, "delta") and data.delta:
                        yield {"type": "text_delta", "content": data.delta}
                    elif hasattr(data, "type"):
                        if data.type == "response.created":
                            yield {"type": "response_created"}
                        elif data.type == "response.completed":
                            pass
                elif event.type == "run_item_stream_event":
                    item = event.item
                    if hasattr(item, "type"):
                        if item.type == "tool_call_item":
                            raw = item.raw_item
                            yield {
                                "type": "tool_call",
                                "name": getattr(raw, "name", "unknown"),
                                "arguments": getattr(raw, "arguments", ""),
                            }
                        elif item.type == "tool_call_output_item":
                            yield {
                                "type": "tool_result",
                                "output": str(item.output)[:2000],
                            }
                        elif item.type == "message_output_item":
                            pass

            yield {"type": "done"}

    async def list_properties(
        self,
        user_id: str,
        refresh_token: str,
    ) -> list[dict]:
        mcp_server = self.mcp_manager.create_mcp_server(user_id, refresh_token)

        async with mcp_server:
            tools = await mcp_server.list_tools()
            get_summaries_tool = None
            for tool in tools:
                if tool.name == "get_account_summaries":
                    get_summaries_tool = tool
                    break

            if not get_summaries_tool:
                return []

            result = await mcp_server.call_tool("get_account_summaries", {})
            if result and hasattr(result, "content"):
                for content_item in result.content:
                    if hasattr(content_item, "text"):
                        data = json.loads(content_item.text)
                        properties = []
                        if isinstance(data, list):
                            for account in data:
                                account_name = account.get("displayName", account.get("account", ""))
                                for prop_summary in account.get("propertySummaries", []):
                                    properties.append({
                                        "property_id": prop_summary.get("property", ""),
                                        "property_name": prop_summary.get("displayName", ""),
                                        "account_name": account_name,
                                    })
                        return properties
            return []
