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
            properties = []

            if not result or not hasattr(result, "content"):
                print("[Properties] No result or no content from MCP")
                return []

            # Each TextContent in result.content is a separate account summary JSON
            for content_item in result.content:
                if not hasattr(content_item, "text"):
                    continue

                data = json.loads(content_item.text)

                # Collect account summaries from this content item
                accounts = []
                if isinstance(data, dict):
                    if "property_summaries" in data or "propertySummaries" in data:
                        # Direct account summary object
                        accounts = [data]
                    elif "account_summaries" in data or "accountSummaries" in data:
                        # Page response wrapping multiple accounts
                        accounts = (
                            data.get("account_summaries")
                            or data.get("accountSummaries")
                            or []
                        )
                elif isinstance(data, list):
                    accounts = data

                for account in accounts:
                    account_name = (
                        account.get("display_name")
                        or account.get("displayName")
                        or account.get("account", "")
                    )
                    prop_summaries = (
                        account.get("property_summaries")
                        or account.get("propertySummaries")
                        or []
                    )
                    for prop in prop_summaries:
                        properties.append({
                            "property_id": prop.get("property", ""),
                            "property_name": (
                                prop.get("display_name")
                                or prop.get("displayName")
                                or ""
                            ),
                            "account_name": account_name,
                        })

            print(f"[Properties] Extracted {len(properties)} properties")
            return properties
