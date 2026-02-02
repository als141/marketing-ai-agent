import asyncio
import json
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import AsyncGenerator, Callable, Awaitable

from agents import Agent, Runner, ModelSettings, function_tool
from agents.tool_context import ToolContext
from agents.items import ReasoningItem
from openai import AsyncOpenAI
from openai.types.shared import Reasoning

from app.config import get_settings
from app.services.mcp_manager import MCPSessionManager
from app.services.ask_user_store import AskUserStore, ask_user_store

logger = logging.getLogger(__name__)
settings = get_settings()

# Sentinel to signal end-of-stream from the SDK background task
_SENTINEL = object()


def _serialize_input_list(items: list) -> list[dict]:
    """Convert to_input_list() output into JSON-serializable dicts."""
    result = []
    for item in items:
        if isinstance(item, dict):
            result.append(item)
        elif hasattr(item, "model_dump"):
            result.append(item.model_dump(exclude_none=True))
        elif hasattr(item, "__dict__"):
            result.append({k: v for k, v in item.__dict__.items() if v is not None})
        else:
            # Fallback — try json round-trip
            result.append(json.loads(json.dumps(item, default=str)))
    return result


@dataclass
class ChatContext:
    """Custom context passed to tool functions via ToolContext[ChatContext]."""

    emit_event: Callable[[dict], Awaitable[None]]
    ask_user_store: AskUserStore
    conversation_id: str


@function_tool
async def ask_user(
    ctx: ToolContext[ChatContext],
    questions: str,
) -> str:
    """ユーザーに構造化された質問を表示し、全回答をまとめて受け取る。

    Args:
        questions: 質問のJSON配列文字列。各要素は以下の形式:
            {"id": "一意ID", "question": "質問文（短文）", "type": "choice|text|confirm", "options": ["選択肢1", "選択肢2", ...]}
            - type="choice": optionsから1つ選択。必ずoptionsを指定すること
            - type="text": 自由テキスト入力
            - type="confirm": はい/いいえの確認
            例: [{"id":"kpi","question":"最重要KPIは？","type":"choice","options":["問い合わせ","資料請求","購入","その他"]},{"id":"concern","question":"SEOで困っていることは？","type":"text"}]
    """
    try:
        parsed = json.loads(questions)
        if not isinstance(parsed, list) or len(parsed) == 0:
            return "（質問の形式が不正です）"
    except json.JSONDecodeError:
        return "（質問のJSON解析に失敗しました）"

    store = ctx.context.ask_user_store
    group = store.create_question_group(parsed)

    # Build the SSE event with structured questions
    questions_data = [
        {
            "id": q.id,
            "question": q.question,
            "type": q.question_type,
            "options": q.options,
        }
        for q in group.questions
    ]

    await ctx.context.emit_event(
        {
            "type": "ask_user",
            "group_id": group.group_id,
            "questions": questions_data,
        }
    )

    try:
        await asyncio.wait_for(group.event.wait(), timeout=300)
    except asyncio.TimeoutError:
        store.cleanup(group.group_id)
        return "（ユーザーからの応答がタイムアウトしました）"

    responses = group.responses or {}
    store.cleanup(group.group_id)

    # Emit internal event so chat.py can persist responses in activity_items
    await ctx.context.emit_event(
        {
            "type": "_ask_user_responses",
            "group_id": group.group_id,
            "responses": responses,
        }
    )

    # Return as readable text for the agent
    parts = []
    for q in group.questions:
        answer = responses.get(q.id, "").strip()
        if answer:
            parts.append(f"- {q.question}: {answer}")
        else:
            parts.append(f"- {q.question}: （スキップ — お任せ）")
    return "\n".join(parts)


@function_tool
async def render_chart(
    ctx: ToolContext[ChatContext],
    chart_spec: str,
) -> str:
    """チャットUIにインタラクティブなチャートを描画する。

    Args:
        chart_spec: チャート仕様のJSON文字列。以下のフォーマット:
            {
                "type": "line|bar|area|pie|donut|scatter|radar|funnel|table",
                "title": "チャートタイトル",
                "description": "補足説明（任意）",
                "data": [{"label": "値1", "metric": 100}, ...],
                "xKey": "X軸のキー名（line/bar/area/scatter用）",
                "yKeys": [{"key": "metric", "label": "表示名", "color": "#3b82f6"}],
                "nameKey": "名前キー（pie/donut用）",
                "valueKey": "値キー（pie/donut用）",
                "columns": [{"key": "col", "label": "列名", "align": "left|right|center"}],
                "categories": ["カテゴリ1", ...],
                "nameField": "名前フィールド（funnel用）",
                "valueField": "値フィールド（funnel用）"
            }
            - type="line": 時系列トレンド。xKey + yKeys 必須
            - type="bar": カテゴリ比較。xKey + yKeys 必須
            - type="area": 累積/スタックエリア。xKey + yKeys 必須
            - type="pie"/"donut": 構成比。nameKey + valueKey 必須
            - type="scatter": 散布図。xKey + yKeys 必須（yKeys[0]がY軸）
            - type="radar": レーダーチャート。xKey + yKeys 必須
            - type="funnel": ファネル。nameField + valueField 必須
            - type="table": テーブル表示。columns 必須
            - data配列の数値は文字列ではなく数値型で入れること
    """
    try:
        spec = json.loads(chart_spec)
    except json.JSONDecodeError:
        return "（チャート仕様のJSON解析に失敗しました）"

    if not isinstance(spec, dict) or "type" not in spec or "data" not in spec:
        return "（チャート仕様に type と data が必要です）"

    await ctx.context.emit_event({"type": "chart", "spec": spec})
    return f"チャート「{spec.get('title', '')}」を描画しました。"


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

## 中間報告ルール（重要）
- ツール実行の前後に、**今何をしているか・次に何をするかを短いテキストで報告**せよ。テキストとツール呼び出しを同じレスポンスで返してよい。
- ユーザーはリアルタイムであなたの行動を見ている。無言でツールを連続実行するのではなく、進捗を伝えながら進めろ。
- 例:
  - 「まず過去28日間のセッションデータを取得します。」→ run_report 呼び出し
  - 「セッションデータが取れました。次にチャネル別の内訳を確認します。」→ run_report 呼び出し
  - 「両方のデータが揃いました。結果をまとめます。」→ テキストで最終分析
- ただし中間報告は1〜2文の短文にせよ。冗長な説明は不要。

## ユーザーへの質問・確認（ask_user ツール）
- 分析に必要な情報が本当に不足していて、推測では進められない場合のみ `ask_user` ツールを使ってユーザーに確認せよ。
- **ただし、安易にユーザーに質問するな**。プロとして自分で判断できることは質問せずに実行せよ。
- ユーザーが「質問して」「確認して」と明示的に依頼した場合は、積極的に構造化質問を活用せよ。
- **構造化質問形式**: `questions` パラメータにJSON配列を渡す。各質問は独立した短文で、回答しやすい形式にすること。
- 質問のルール:
  - 1つの質問は**わかりやすい短文**にせよ。専門用語は避け、誰でも理解できる表現を使え。
  - 選択肢で回答できるものは必ず `type: "choice"` + `options` を使え（ユーザーの負担が最も少ない）
  - 自由入力が必要な場合のみ `type: "text"` を使え
  - はい/いいえで回答できる場合は `type: "confirm"` を使え
  - 1回のask_userで**2〜5個**の質問を送れ。多すぎず少なすぎず。
  - 選択肢に「その他」を含めると、ユーザーが想定外の回答もしやすい
  - **全ての回答は任意**。ユーザーが一部だけ回答しても問題ない。未回答の項目はプロとして最適な判断で進めよ。
- 例:
  ```json
  [{{"id":"kpi","question":"一番伸ばしたい成果は？","type":"choice","options":["問い合わせ数","売上","アクセス数","その他"]}},{{"id":"target","question":"主なお客さんは？","type":"choice","options":["企業向け(B2B)","個人向け(B2C)","両方"]}},{{"id":"concern","question":"SEOで気になることがあれば教えてください","type":"text"}}]
  ```

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

## チャート描画ルール（render_chart ツール）
- データ取得後、視覚化が有効と判断したら **必ず `render_chart` ツールを呼んでチャートを描画せよ**。
- テキスト分析も併記すること（チャートだけ投げるな）。
- チャートの `data` 配列の数値は **数値型**（文字列ではなく `100` や `3.5`）で入れること。
- ラベルは日本語を使用。
- 使い分け:
  | データの特性 | type |
  |---|---|
  | 日別・月別の推移 | line |
  | カテゴリ間の比較 | bar |
  | 累積推移・内訳推移 | area |
  | 構成比・シェア | pie または donut |
  | 2変数の相関 | scatter |
  | 多次元の比較 | radar |
  | ステップごとの変換率 | funnel |
  | 詳細データ一覧 | table |
- **1回の分析で複数チャートを出してよい**（例: 推移のlineと内訳のpieをセットで）。
- chart_spec例（折れ線）:
  ```json
  {{"type":"line","title":"日別セッション数","data":[{{"date":"1/1","sessions":150}},{{"date":"1/2","sessions":200}}],"xKey":"date","yKeys":[{{"key":"sessions","label":"セッション","color":"#3b82f6"}}]}}
  ```
- chart_spec例（円グラフ）:
  ```json
  {{"type":"pie","title":"デバイス構成比","data":[{{"device":"desktop","count":500}},{{"device":"mobile","count":300}},{{"device":"tablet","count":50}}],"nameKey":"device","valueKey":"count"}}
  ```

## 回答フォーマット
- 数値データは**チャート + 簡潔なインサイト**で表示。チャートがある場合はマークダウンテーブルは不要。
- チャートなしの場合はマークダウンテーブルを使え。
- 数値は3桁カンマ区切り、パーセントは小数点1桁。
- **2〜3行のインサイト**（増減の要因推定、改善示唆など）を簡潔に付けろ。
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
        context_items: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        pair = self.mcp_manager.create_server_pair(user_id, refresh_token)

        try:
            async with AsyncExitStack() as stack:
                await stack.enter_async_context(pair.ga4_server)
                await stack.enter_async_context(pair.gsc_server)

                # Queue for multiplexing SDK events and out-of-band events (ask_user)
                queue: asyncio.Queue[dict | object] = asyncio.Queue()

                async def emit_event(event: dict) -> None:
                    """Callback passed to ChatContext — puts events into the queue."""
                    await queue.put(event)

                chat_context = ChatContext(
                    emit_event=emit_event,
                    ask_user_store=ask_user_store,
                    conversation_id="",  # Will be set by the router
                )

                agent = Agent(
                    name="GA4 & GSC Analytics Agent",
                    instructions=self._build_system_prompt(property_id),
                    model=settings.chat_model,
                    mcp_servers=[pair.ga4_server, pair.gsc_server],
                    tools=[ask_user, render_chart],
                    model_settings=ModelSettings(
                        reasoning=Reasoning(effort="medium", summary="detailed"),
                        verbosity="low",
                    ),
                )

                # Build input: prefer context_items (full Responses API format)
                # over plain conversation_history (role+content only)
                if context_items:
                    input_messages = context_items + [
                        {"role": "user", "content": message}
                    ]
                else:
                    input_messages = []
                    if conversation_history:
                        input_messages.extend(conversation_history)
                    input_messages.append({"role": "user", "content": message})

                result = Runner.run_streamed(
                    agent, input=input_messages, context=chat_context,
                    max_turns=50,
                )

                async def _pump_sdk_events() -> None:
                    """Background task: read SDK stream events and put them into the queue."""
                    try:
                        async for event in result.stream_events():
                            sdk_event = self._process_sdk_event(event)
                            if sdk_event is not None:
                                await queue.put(sdk_event)
                    except Exception as e:
                        await queue.put(
                            {"type": "error", "message": str(e)}
                        )
                    finally:
                        await queue.put(_SENTINEL)

                pump_task = asyncio.create_task(_pump_sdk_events())

                try:
                    while True:
                        item = await queue.get()
                        if item is _SENTINEL:
                            break
                        yield item  # type: ignore[misc]
                finally:
                    if not pump_task.done():
                        pump_task.cancel()
                        try:
                            await pump_task
                        except (asyncio.CancelledError, Exception):
                            pass

                # Extract full conversation context for next turn
                try:
                    full_context = result.to_input_list()
                    # Serialize to JSON-safe dicts
                    serialized = _serialize_input_list(full_context)
                    yield {"type": "_context_items", "items": serialized}
                except Exception as e:
                    logger.warning(f"Failed to serialize context_items: {e}")

                yield {"type": "done"}
        finally:
            self.mcp_manager.cleanup_server_pair(pair)

    def _process_sdk_event(self, event) -> dict | None:
        """Convert a single SDK stream event into a dict for SSE, or None to skip."""
        if event.type == "raw_response_event":
            data = event.data
            event_type = getattr(data, "type", "")
            if event_type == "response.output_text.delta":
                delta = getattr(data, "delta", "")
                if delta:
                    return {"type": "text_delta", "content": delta}
            elif event_type == "response.created":
                return {"type": "response_created"}
        elif event.type == "run_item_stream_event":
            item = event.item
            if hasattr(item, "type"):
                if item.type == "tool_call_item":
                    raw = item.raw_item
                    return {
                        "type": "tool_call",
                        "call_id": getattr(raw, "call_id", None),
                        "name": getattr(raw, "name", "unknown"),
                        "arguments": getattr(raw, "arguments", ""),
                    }
                elif item.type == "tool_call_output_item":
                    raw = item.raw_item
                    call_id = (
                        raw["call_id"]
                        if isinstance(raw, dict)
                        else getattr(raw, "call_id", None)
                    )
                    return {
                        "type": "tool_result",
                        "call_id": call_id,
                        "output": str(item.output)[:4000],
                    }
            # ReasoningItem handling (isinstance check, not type string)
            if isinstance(item, ReasoningItem):
                return self._process_reasoning_item(item)
        return None

    def _process_reasoning_item(self, item: ReasoningItem) -> dict:
        """Extract reasoning summary from a ReasoningItem."""
        summary_text = None
        if hasattr(item.raw_item, "summary") and item.raw_item.summary:
            texts = [
                s.text
                for s in item.raw_item.summary
                if hasattr(s, "text") and s.text
            ]
            if texts:
                summary_text = " ".join(texts)

        # Note: translation is sync-unfriendly here in the pump task.
        # We'll handle translation in the queue consumer or skip for now.
        # For simplicity, mark for translation in the event dict.
        return {
            "type": "reasoning",
            "content": summary_text or "分析中...",
            "has_summary": summary_text is not None,
            "_needs_translation": summary_text is not None,
        }

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
        mcp_server, creds_path = self.mcp_manager.create_ga4_server(
            user_id, refresh_token
        )

        try:
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
                        if (
                            "property_summaries" in data
                            or "propertySummaries" in data
                        ):
                            accounts = [data]
                        elif (
                            "account_summaries" in data
                            or "accountSummaries" in data
                        ):
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
                            properties.append(
                                {
                                    "property_id": prop.get("property", ""),
                                    "property_name": (
                                        prop.get("display_name")
                                        or prop.get("displayName")
                                        or ""
                                    ),
                                    "account_name": account_name,
                                }
                            )

                print(f"[Properties] Extracted {len(properties)} properties")
                return properties
        finally:
            self.mcp_manager.credentials_manager.cleanup_path(creds_path)

    async def list_gsc_properties(
        self,
        user_id: str,
        refresh_token: str,
    ) -> list[dict]:
        mcp_server, creds_path = self.mcp_manager.create_gsc_server(
            user_id, refresh_token
        )

        try:
            async with mcp_server:
                tools = await mcp_server.list_tools()
                has_list_tool = any(t.name == "list_properties" for t in tools)
                if not has_list_tool:
                    return []

                result = await mcp_server.call_tool("list_properties", {})
                properties = []

                if not result or not hasattr(result, "content"):
                    return []

                import re

                for content_item in result.content:
                    if not hasattr(content_item, "text"):
                        continue
                    # Parse markdown: - **{siteUrl}** (Permission: {level})
                    for match in re.finditer(
                        r"\*\*(.+?)\*\*\s*\(Permission:\s*(\w+)\)",
                        content_item.text,
                    ):
                        properties.append(
                            {
                                "site_url": match.group(1),
                                "permission_level": match.group(2),
                            }
                        )

                print(f"[GSC Properties] Extracted {len(properties)} sites")
                return properties
        finally:
            self.mcp_manager.credentials_manager.cleanup_path(creds_path)
