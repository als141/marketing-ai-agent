import json
import logging
from contextlib import AsyncExitStack
from typing import AsyncGenerator
from agents import Agent, Runner, ModelSettings
from agents.items import ReasoningItem
from openai import AsyncOpenAI
from openai.types.shared import Reasoning

from app.config import get_settings
from app.services.mcp_manager import MCPSessionManager

logger = logging.getLogger(__name__)
settings = get_settings()


class AgentService:
    def __init__(self, mcp_manager: MCPSessionManager):
        self.mcp_manager = mcp_manager

    @staticmethod
    def _build_system_prompt(property_id: str) -> str:
        return f"""あなたはGA4とGoogle Search Console（GSC）の両方を使いこなすウェブ分析のプロフェッショナルです。
ユーザーの質問に対して、まず行動（ツール実行）してからデータに基づいて回答します。

## 対象プロパティ
GA4 property_id: {property_id}

## 行動原則（最重要）
1. **質問する前にツールを使え**: ユーザーに「どの観点ですか？」「どの粒度ですか？」と聞き返すな。プロとして最適な分析を自分で判断し、即座にツールを実行せよ。
2. **まずデータを取れ**: 「GA4ではこれができます／できません」のような説明は不要。ツールを呼んで実データを取得し、結果を見せろ。
3. **失敗したらリトライせよ**: ツール呼び出しがエラーになったら、パラメータを修正して再実行せよ。ユーザーにエラーを見せるな。
4. **簡潔に答えよ**: 冗長な前置き・注釈・免責は不要。データとインサイトだけを伝えろ。
5. **GA4とGSCを組み合わせろ**: SEOの質問にはGSCで検索クエリ・順位・CTRを取得し、GA4でサイト内行動・CVを取得して、両面から分析せよ。

## GA4ツール使用ルール

### run_report（通常レポート）
- **date_rangesは必須**: 必ず指定すること。省略するとエラーになる。
- デフォルト期間: 指定がなければ `{{"start_date": "28daysAgo", "end_date": "yesterday"}}` を使え。
- 比較する場合は date_ranges に2つの期間を入れろ: `[{{"start_date": "28daysAgo", "end_date": "yesterday", "name": "current"}}, {{"start_date": "56daysAgo", "end_date": "29daysAgo", "name": "previous"}}]`
- よく使うdimensions: `date`, `sessionDefaultChannelGroup`, `sourceMedium`, `landingPagePlusQueryString`, `pagePathPlusQueryString`, `deviceCategory`, `country`, `eventName`
- よく使うmetrics: `activeUsers`, `sessions`, `screenPageViews`, `eventCount`, `engagementRate`, `averageSessionDuration`, `conversions`, `totalRevenue`

### run_realtime_report（リアルタイム）
- date_rangesは不要（直近30分の自動集計）。
- dimensionsに `sessionDefaultChannelGroup`, `sourceMedium` 等の流入元は使用できない。使えるのは `unifiedScreenName`, `deviceCategory`, `country`, `city`, `eventName` 等。
- リアルタイムで流入元が必要な場合は run_report で `date_ranges: [{{"start_date": "today", "end_date": "today"}}]` を使え。

### get_property_details / get_custom_dimensions_and_metrics / list_google_ads_links / get_account_summaries
- 情報取得系。エラーは起きにくい。必要に応じて呼べ。

## GSC（Google Search Console）ツール使用ルール

### list_properties
- GSCに登録されているサイトURLの一覧を取得。最初にこれを呼んで対象サイトのURLを特定せよ。
- site_urlの形式: `sc-domain:example.com` または `https://example.com/`

### get_search_analytics(site_url, days, dimensions)
- 検索パフォーマンスデータ取得。dimensions: "query", "page", "country", "device", "date"
- デフォルト28日。クリック、表示回数、CTR、平均掲載順位を返す。

### get_performance_overview(site_url, days)
- サマリー指標＋日別トレンド。SEO概況の把握に最適。

### get_advanced_search_analytics(site_url, start_date, end_date, dimensions, ...)
- フィルタリング・ソート対応の高度な検索分析。特定ページやクエリの深掘りに。
- filter_dimension / filter_expression でページやクエリの絞り込み可能。

### compare_search_periods(site_url, period1_start/end, period2_start/end, dimensions)
- 2期間比較。SEOの成長・下落を定量化。

### get_search_by_page_query(site_url, page_url, days)
- 特定ページの検索クエリ一覧。LPのSEO診断に。

### inspect_url_enhanced(site_url, page_url) / batch_url_inspection / check_indexing_issues
- URL検査。インデックス状態、クロール状況、リッチリザルト、モバイルユーザビリティ。

### get_sitemaps / submit_sitemap / delete_sitemap
- サイトマップ管理。

## 使い分けガイド
| 質問のタイプ | 使うツール |
|---|---|
| SEO状況・検索順位・クエリ分析 | GSC: get_search_analytics, get_performance_overview |
| サイト流入・行動・CV分析 | GA4: run_report |
| SEO + サイト内行動の総合分析 | GSC + GA4 両方 |
| インデックス状態・技術的SEO | GSC: inspect_url_enhanced, check_indexing_issues |
| リアルタイム状況 | GA4: run_realtime_report |
| サイトマップ確認 | GSC: get_sitemaps |

## 回答フォーマット
- 数値データは**マークダウンテーブル**で表示。
- 数値は3桁カンマ区切り、パーセントは小数点1桁。
- テーブルの後に**2〜3行のインサイト**（増減の要因推定、改善示唆など）を簡潔に付けろ。
- ユーザーと同じ言語で応答（主に日本語）。

## やってはいけないこと
- 「GA4ではSEOの順位は見えません」→ GSCツールを使って検索順位を取れ。GA4とGSCの両方が使える。
- 「どちらの粒度がいいですか？」とユーザーに選択を委ねること → プロとして最適な粒度を自分で選べ。
- ツールエラーをそのままユーザーに見せること → パラメータを直して再実行せよ。
- 「API制約により取得できません」と言い訳すること → 別のパラメータやツールで代替取得を試みろ。
"""

    async def stream_chat(
        self,
        user_id: str,
        refresh_token: str,
        message: str,
        property_id: str,
        conversation_history: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        ga4_server = self.mcp_manager.create_ga4_server(user_id, refresh_token)
        gsc_server = self.mcp_manager.create_gsc_server(user_id, refresh_token)

        async with AsyncExitStack() as stack:
            await stack.enter_async_context(ga4_server)
            await stack.enter_async_context(gsc_server)

            agent = Agent(
                name="GA4 & GSC Analytics Agent",
                instructions=self._build_system_prompt(property_id),
                model="gpt-5.2",
                mcp_servers=[ga4_server, gsc_server],
                model_settings=ModelSettings(
                    reasoning=Reasoning(effort="medium", summary="detailed"),
                    verbosity="low",
                ),
            )

            input_messages = []
            if conversation_history:
                input_messages.extend(conversation_history)
            input_messages.append({"role": "user", "content": message})

            result = Runner.run_streamed(agent, input=input_messages)

            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    data = event.data
                    event_type = getattr(data, "type", "")
                    if event_type == "response.output_text.delta":
                        delta = getattr(data, "delta", "")
                        if delta:
                            yield {"type": "text_delta", "content": delta}
                    elif event_type == "response.created":
                        yield {"type": "response_created"}
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
                    # ReasoningItem handling (isinstance check, not type string)
                    if isinstance(item, ReasoningItem):
                        summary_text = None
                        if hasattr(item.raw_item, "summary") and item.raw_item.summary:
                            texts = [
                                s.text
                                for s in item.raw_item.summary
                                if hasattr(s, "text") and s.text
                            ]
                            if texts:
                                summary_text = " ".join(texts)

                        if summary_text:
                            summary_text = await self._translate_to_japanese(summary_text)

                        yield {
                            "type": "reasoning",
                            "content": summary_text or "分析中...",
                            "has_summary": summary_text is not None,
                        }

            yield {"type": "done"}

    async def _translate_to_japanese(self, text: str) -> str:
        """英語の reasoning summary を Responses API で日本語に翻訳"""
        try:
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.responses.create(
                model=settings.reasoning_translate_model,
                instructions="Translate the following text to Japanese. Output ONLY the translated text, nothing else. Keep any markdown formatting intact.",
                input=text,
                reasoning={"effort": "minimal", "summary": None},
                text={"verbosity": "low"},
                store=False,
            )
            return response.output_text or text
        except Exception as e:
            logger.warning(f"Reasoning summary 翻訳失敗、原文を使用: {e}")
            return text

    async def list_properties(
        self,
        user_id: str,
        refresh_token: str,
    ) -> list[dict]:
        mcp_server = self.mcp_manager.create_ga4_server(user_id, refresh_token)

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

            for content_item in result.content:
                if not hasattr(content_item, "text"):
                    continue

                data = json.loads(content_item.text)

                accounts = []
                if isinstance(data, dict):
                    if "property_summaries" in data or "propertySummaries" in data:
                        accounts = [data]
                    elif "account_summaries" in data or "accountSummaries" in data:
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
