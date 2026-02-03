# CLAUDE.md - 永続メモリ & 自己改善ログ

> **このファイルはClaude Codeの永続メモリであり、自己改善の記録である。**
> セッションをまたいで知識を保持し、過去の失敗・学び・判断を蓄積して次のセッションの自分をより賢くするためのファイルである。
>
> ## 運用ルール
> 1. **毎回の作業開始時**にこのファイルを読み込み、内容に従って行動する
> 2. **作業中に新しい知見・決定・変更が生じたら**、即座にこのファイルを更新する（追記・修正・削除）
> 3. **更新対象**: アーキテクチャ変更、新しい依存関係、デプロイ設定、踏んだ罠・解決策、環境差異、運用ルールなど
> 4. このファイルの情報が古くなった場合は削除・修正し、常に最新状態を維持する
> 5. **あとで思い出せるように書く**: 技術的な知見を記録する際は、調査元の公式ドキュメントURL・GitHubリポジトリ・SDKソースファイルパスなどの**情報ソース**も一緒に記録する。次のセッションで「なぜこうなっているか」「どこで確認したか」を即座に辿れるようにする
> 6. **セクションは自由に増減してよい**: 新しいテーマが出てきたらセクションを追加し、不要になったら統合・削除する。このファイルの構造自体を改善し続けること
> 7. **自己改善**: ユーザーに指摘された間違い・非効率・判断ミスは「自己改善ログ」セクションに記録する。同じ失敗を繰り返さないために、具体的に何が悪かったか・次はどうするかを書く
> 8. **常時更新の義務**: 新情報の発見、コードリーディング中の新発見、設計変更、UIの変更、技術的知見の獲得、バグの発見と修正など — あらゆる新たな情報や更新が発生した場合は**必ずその場でこのファイルを更新する**。作業の最後にまとめて書くのではなく、発見・変更のたびにリアルタイムで追記・修正すること。これを怠ると次のセッションで同じ調査を繰り返すことになり、非効率である

## Package Management (STRICT)
- **Backend (Python)**: `uv add <package>` for dependencies. Never use `pip install`.
- **Frontend (JS/TS)**: `bun add <package>` for dependencies. Never use `npm install` or `yarn add`.
- Backend lock: `uv sync` to sync after changes
- Frontend lock: `bun install` to sync after changes

## Project Structure
```
backend/   - FastAPI + Python 3.12 + uv
frontend/  - Next.js 16 + React 19 + bun
```

## Tech Stack
- **Backend**: FastAPI, uvicorn, OpenAI Agents SDK (v0.7.0+), Supabase, httpx, pydantic-settings
- **Frontend**: Next.js 16, React 19, TailwindCSS v4, shadcn/ui, Clerk (@clerk/nextjs)
- **Auth**: Clerk (user auth) + Independent Google OAuth (GA4/GSC access)
- **DB**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-5.2 via Agents SDK with MCP servers
- **MCP Servers**: analytics-mcp (GA4基本), scripts/ga4_extended_server.py (GA4拡張), scripts/gsc_server.py (GSC), meta-ads-mcp (Meta広告、オプション)
- **情報ソース**:
  - OpenAI Agents SDK: https://github.com/openai/openai-agents-python
  - analytics-mcp (GA4): https://github.com/nicosalm/analytics-mcp（`pip install analytics-mcp` / MCP stdio）
  - GSC MCP 参考元: https://github.com/AminForou/mcp-gsc（これをベースにOAuth対応wrapper作成）
  - meta-ads-mcp: https://github.com/pipeboard-co/meta-ads-mcp（`uv add meta-ads-mcp` / MCP stdio）
  - Clerk Next.js: https://clerk.com/docs/references/nextjs/overview
  - Next.js 16 App Router: https://nextjs.org/docs
  - TailwindCSS v4: https://tailwindcss.com/docs
  - shadcn/ui: https://ui.shadcn.com/

## Key Architecture Decisions
- Google OAuth is independent from Clerk (not using Clerk's OAuth)
- OAuth scopes: `analytics.readonly` + `webmasters`
- Per-user MCP subprocess with ADC credentials file (authorized_user format)
- SSE streaming from FastAPI to frontend via useChat hook
- Clerk JWT verification via JWKS endpoint

## Credentials管理アーキテクチャ（重要）
- **永続ストレージ**: Supabase `users.google_refresh_token` にrefresh_tokenを保存（source of truth）
- **一時ファイル**: MCP子プロセス用にリクエストごとにUUID付きディレクトリを作成し、セッション終了後にクリーンアップ
  - パス: `/tmp/ga4-agent-credentials/{user_id}_{session_uuid}/`
  - GA4用: `ga4_credentials.json`（`google.auth.default()` 経由で読まれる）
  - GSC用: `gsc_credentials.json`（`GSC_TOKEN_FILE` 経由で読まれる）
- **GA4とGSCは必ず別ファイル**: GSCサーバーがcredentialsリフレッシュ時にファイルを上書きするが、`Credentials.to_json()`は`type`フィールドを出力しない。GA4の`google.auth.default()`は`type`が必須なので、同じファイルを共有すると壊れる
- **Cloud Run対応**: `/tmp`はCloud Runではインメモリファイルシステム。credentials は毎回Supabaseから取得→一時ファイル作成→リクエスト完了後削除。エフェメラルなコンテナでも問題なし
- **セキュリティ**: 一時ファイルは`0o600`パーミッション。リクエスト完了時にfinally句で確実に削除
- **同時リクエスト対応**: UUID付きディレクトリにより、同一ユーザーの並行リクエストでもファイル競合しない

## Environment Variables
- Backend: `.env` in `backend/`
- Frontend: `.env.local` in `frontend/`

## Meta Ads MCP（オプション機能）
- **有効化**: 環境変数 `META_ADS_ENABLED=true` + `META_ACCESS_TOKEN=<token>` を設定
- **無効時**: デフォルトは無効。MCPサーバーは起動されず、システムプロンプトにもMeta広告セクションは含まれない
- **認証方式**: `META_ACCESS_TOKEN` 環境変数で直接Meta APIトークンを指定（Pipeboard不要、OAuthコールバック無効化済み）
- **接続方式**: stdio子プロセス（GA4/GSCと同じ`MCPServerStdio`パターン）
- **UIへの表示**: なし（バックエンド設定のみで制御）
- **パッケージ**: `meta-ads-mcp>=1.0.20`（`mcp[cli]==1.12.2` に依存、agents SDKとの互換性確認済み）
- **注意**: meta-ads-mcpが`mcp==1.12.2`をピン留めしているため、mcpパッケージが1.26.0→1.12.2にダウングレードされる。現行のagents SDK v0.7.0+では問題なく動作することを確認済み
- **実装ファイル**:
  - `backend/app/config.py` — `meta_ads_enabled: bool`, `meta_access_token: str`
  - `backend/app/services/mcp_manager.py` — `create_meta_ads_server()`, `MCPServerPair.meta_ads_server`
  - `backend/app/services/agent_service.py` — Meta Ads MCPの接続 + システムプロンプト動的拡張

## Design Rules
- Light mode only
- Font: Noto Sans JP (Gothic, weights: 300/400/500/700)
- Colors: Navy (#1a1a2e) text, white/gray background (#f8f9fb), accent (#e94560)
- Component library: shadcn/ui
- Chat UI: ChatGPT風デザイン
  - **入力欄**: カプセル型（rounded-2xl ボーダー内にtextarea+送信ボタンが内包、border-t区切り線なし）
  - **ユーザーメッセージ**: ライトグレー (#f0f1f5) 背景バブル、右寄せ、アバターなし
  - **アシスタントメッセージ**: 左寄せフラット表示、ツールバッジ付き
  - **メッセージ幅**: max-w-3xl (旧: max-w-4xl)
- Viewport: `viewportFit: "cover"` でノッチ端末対応 (`layout.tsx`で設定済み)
- **レイアウト構成** (2025/02更新):
  - **左サイドバー** (`AppSidebar.tsx`): ナビゲーション（チャット/設定）+ ブランド + ユーザー。デスクトップ開閉可能（220px⇔60px）。モバイルはSheet drawer
  - **右パネル** (`HistoryPanel.tsx`): 会話履歴。Sheet drawerで表示。日付グループ分け（今日/昨日/過去7日/それ以前）
  - **設定画面** (`SettingsView.tsx`): Google連携状態、GA4/GSC利用可能状態、プロパティ一覧、再連携ボタン
  - **トップバー**: PropertySelector（チャット時）or 設定タイトル + 履歴ボタン
  - 旧 `Sidebar.tsx` は未使用（会話リストは `HistoryPanel` に移行）

## Development Commands
- Backend start: `cd backend && uv run uvicorn main:app --reload`
- Frontend start: `cd frontend && bun dev`

## Deployment
- **Backend**: Cloud Run (asia-northeast1), サービス名: `marketing-ai-agent`
  - URL: `https://marketing-ai-agent-553346151229.asia-northeast1.run.app`
  - Dockerfile: `backend/Dockerfile` (Python 3.12-slim + uv)
  - ポート: 8080 (Cloud Runデフォルト)
  - 環境変数は Cloud Run 側で個別設定が必要（.envファイルは読まれない）
- **Frontend**: Vercel
  - URL: `https://marketing-ai-agent-hazel.vercel.app`
- **必須環境変数 (Cloud Run)**: FRONTEND_URL, BACKEND_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_PROJECT_ID, OPENAI_API_KEY

## Google OAuth 本番化ステータス
- 現在: **テストモード**（テストユーザー最大100人のみ利用可）
- スコープ `analytics.readonly` は **Sensitive**（~~Restricted~~ではない → CASAセキュリティ監査は不要）
- スコープ `webmasters` は **Sensitive** → 審査は必要だがCASAは不要
- 両スコープとも Sensitive scope verification のみで本番化可能（通常3-7営業日）
- **情報ソース**: [Sensitive Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)、[Restricted Scopes一覧](https://support.google.com/cloud/answer/13464325)（analytics.readonlyは含まれていない）
- 本番公開に必要:
  - [x] プライバシーポリシーページ (`/privacy-policy`)
  - [x] 利用規約ページ (`/terms`)
  - [ ] ドメイン所有権確認（Google Search Console + DNS TXTレコード）
  - [ ] OAuth同意画面にポリシーURL設定
  - [ ] デモ動画（YouTube限定公開）
  - [ ] スコープ正当性説明文
  - [ ] 審査リクエスト送信
- Google Cloud Console > OAuth同意画面でリダイレクトURI・JS生成元に本番URLを追加済み

## Troubleshooting Log
- **CORS 400 on OPTIONS**: Cloud RunにFRONTEND_URL環境変数が未設定だった → 設定で解決
- **401 CLERK_JWKS_URL must be set**: Cloud RunにClerk環境変数が未設定だった → 設定で解決
- **[Errno 2] No such file or directory (analytics-mcp)**: pyproject.tomlにanalytics-mcpが依存関係として未記載だった → `analytics-mcp>=0.1.1` を追加して解決
- **ツールバッジが完了にならない問題**: `tool_result`のマッチングが「配列の最後の要素」固定だったため、複数ツール呼び出し時に先行ツールが永久にローディング状態になった。原因: バックエンドが`call_id`を送信しておらず、フロントが結果をどのツールに紐付けるか判別不能だった。修正: (1) バックエンドで`ToolCallItem.raw_item.call_id`と`ToolCallOutputItem.raw_item["call_id"]`を送信、(2) フロントで`call_id`ベースのマッチング、(3) `done`イベント時に未完了ツールを全て完了扱い
- **GA4 run_report「Type is None」エラー**: GSCサーバーがcredentialsリフレッシュ時に同一ファイルを`Credentials.to_json()`で上書き → `type`フィールドが消失 → GA4の`google.auth.default()`が「Type is None」で失敗。修正: (1) GA4とGSCで別ファイルに分離、(2) GSCの書き戻しで`type`フィールドを保持、(3) UUID付きセッションディレクトリで競合回避、(4) finally句でクリーンアップ
- **ask_user回答がDB保存されない問題**: バックエンドの`event_generator`内の`activity_items`にユーザー回答(responses)が含まれないままDB保存されていた。原因: ask_userイベント時点では未回答、フロントの`respondToQuestions()`はReact stateのみ更新しバックエンドのactivity_itemsには反映されない。修正: `agent_service.py`のask_userツール関数で回答取得後に`_ask_user_responses`内部イベントをemit → `chat.py`でインターセプトしactivity_itemsに書き戻し。同時に`ActivityItemRecord`型に`responses`フィールドを追加

## GPT-5.2 Reasoning Configuration
- GPT-5.2はreasoning effortパラメータをサポート: `none`, `low`, `medium`, `high`, `xhigh`
- **デフォルト**: GPT-5.2のデフォルトは `effort="none"`（推論なし、低レイテンシ）
- GPT-5のデフォルトは `medium`、GPT-5.1/5.2は `none`
- 設定方法:
  ```python
  from agents import Agent, ModelSettings
  from openai.types.shared import Reasoning

  agent = Agent(
      model="gpt-5.2",
      model_settings=ModelSettings(
          reasoning=Reasoning(effort="medium"),
          verbosity="low",
      ),
  )
  ```
- `Reasoning` オブジェクトのフィールド:
  - `effort`: "none" | "low" | "medium" | "high" | "xhigh"
  - `generate_summary`: "auto" | "concise" | "detailed"
  - `summary`: "auto" | "concise" | "detailed"
- `ModelSettings` の主要フィールド: temperature, top_p, max_tokens, reasoning, verbosity, parallel_tool_calls, truncation
- 価格: 入力$1.75/1M tokens, 出力$14/1M tokens (キャッシュ入力90%割引)
- **現在の設定**: `effort="medium"`, `summary="detailed"`, `verbosity="low"`

## Reasoning Summary（思考過程サマリ）表示
- GPT-5.2の`summary="detailed"`設定で、推論過程のサマリテキストが`ReasoningItem`として返される
- バックエンドで`ReasoningItem`を検出し、`item.raw_item.summary`からテキストを抽出
- 英語のサマリは`gpt-5-nano`（`REASONING_TRANSLATE_MODEL`環境変数で変更可）+ `effort="minimal"` で日本語に翻訳（~111トークン/回、推論トークン0）
- SSEで`{"type": "reasoning", "content": "日本語サマリ", "has_summary": true}`として送信
- フロントエンドでは **インターリーブActivityTimeline** で表示:
  - `activityItems: ActivityItem[]` — reasoning, tool call, **テキストセグメント**, chart, ask_user を到着順に単一配列で保持
  - `ActivityItem` = `ReasoningActivityItem | ToolActivityItem | TextActivityItem | ChartActivityItem | AskUserActivityItem`（`kind` で判別）
  - **テキストセグメント**: `TextActivityItem` — 各ターンのテキスト出力をセグメント化。`response_created`, `tool_call`, `reasoning` イベントでセグメント境界をリセット
  - ストリーミング中: reasoning→text→tool→text→chart→textの流れをそのまま時系列表示
  - 完了後: テキスト・チャート・ask_userは常時表示、reasoning+toolは「▸ 思考 N · ツール M」の折りたたみトグル（セクション間にインライン表示）
  - `TextActivityItem` があるメッセージ → 新インターリーブモード、ないメッセージ → レガシーモード（後方互換）
  - reasoningはReactMarkdown + remarkGfmでレンダリング（11px灰色テキスト）
  - ツールバッジは既存スタイル維持（緑完了/灰色実行中）
  - `toolCalls[]` と `reasoningMessages[]` は後方互換のため並行して保持
- **実装ファイル**:
  - バックエンド: `backend/app/services/agent_service.py`（`ReasoningItem`処理 + `_translate_to_japanese()` + `call_id`送信）
  - フロントエンド: `frontend/app/dashboard/components/ChatMessage.tsx`（`ActivityTimeline`コンポーネント）
  - 型定義: `frontend/lib/types.ts`（`ActivityItem`, `ReasoningActivityItem`, `ToolActivityItem`, `Message.activityItems`）
  - Hook: `frontend/lib/hooks/useChat.ts`（統合`activityItems`イベントハンドリング + `call_id`マッチング）
- **情報ソース**:
  - OpenAI Agents SDK ドキュメント: https://openai.github.io/openai-agents-python/models/
  - GPT-5.2 モデルページ: https://platform.openai.com/docs/models/gpt-5.2
  - GPT-5.2 プロンプトガイド: https://cookbook.openai.com/examples/gpt-5/gpt-5-2_prompting_guide
  - Agents SDK GitHub: https://github.com/openai/openai-agents-python
  - SDK内ソース（デフォルト設定）: `backend/.venv/lib/python3.12/site-packages/agents/models/default_models.py`
  - SDK内ソース（ModelSettings定義）: `backend/.venv/lib/python3.12/site-packages/agents/model_settings.py`

## チャート・ビジュアライゼーション機能（render_chart ツール）
- AIエージェントがGA4/GSCデータ取得後、自動的にチャートを生成してチャットUI内にインラインで表示する機能
- **アーキテクチャ**: `@function_tool` + `ToolContext[ChatContext].emit_event()` + SSE `chart` イベント + Recharts
  - `render_chart` ツール: `chart_spec` パラメータ（JSON文字列）でチャート仕様を受け取る
  - `emit_event({"type": "chart", "spec": {...}})` でフロントに送信（ask_userと同パターン）
  - フロントエンドでRechartsを使ってレンダリング
- **チャートタイプ**: line（折れ線）、bar（棒）、area（エリア）、pie（円）、donut（ドーナツ）、scatter（散布図）、radar（レーダー）、funnel（ファネル）、table（テーブル）
- **チャートSpec型**: `ChartSpec` — type, title, description, data, xKey, yKeys, nameKey, valueKey, columns, categories, nameField, valueField
- **表示ルール**:
  - ストリーミング中: ActivityTimeline内にインライン表示（到着次第即座に描画）
  - 完了後: チャートは折りたたみ外に常時表示、思考・ツールバッジのみ折りたたみ内
- **技術スタック**: Recharts + shadcn/ui Chart (`ChartContainer`, `ChartConfig`)
  - `bunx shadcn@latest add chart` でインストール済み
- **カラーパレット**: #3b82f6, #10b981, #f59e0b, #ef4444, #8b5cf6, #ec4899, #06b6d4, #f97316, #14b8a6, #a855f7
- **実装ファイル**:
  - バックエンド: `backend/app/services/agent_service.py` — `render_chart` function_tool + システムプロンプトにチャートルール追加
  - フロントエンド型: `frontend/lib/types.ts` — `ChartSpec`, `ChartActivityItem`
  - SSEハンドリング: `frontend/lib/hooks/useChat.ts` — `chart` イベント → `ChartActivityItem` を activityItems に追加
  - チャートコンポーネント: `frontend/app/dashboard/components/charts/`
    - `ChartRenderer.tsx` — ディスパッチャ（type→コンポーネント）
    - `LineChartView.tsx`, `BarChartView.tsx`, `AreaChartView.tsx`, `PieChartView.tsx`, `ScatterChartView.tsx`, `RadarChartView.tsx`, `FunnelChartView.tsx`, `TableChartView.tsx`
    - `chart-colors.ts` — カラーパレット + formatNumber ヘルパー
  - 統合: `frontend/app/dashboard/components/ChatMessage.tsx` — ActivityTimeline内でkind==="chart"時にChartRenderer表示

## マルチレスポンス（インターリーブテキスト+ツール）機能
- **概要**: エージェントが1つのユーザークエリに対して複数回テキストを出力し、ツール実行と交互に中間報告を行う機能
- **SDKの仕組み**: Responses APIは1レスポンスで`ResponseOutputMessage`（テキスト）と`ResponseFunctionToolCall`（ツール）を同時に返せる。テキストのdeltaが先にストリーミングされ、その後ツールコール引数がストリーミングされる。SDKの`NextStepRunAgain`でループ継続時、中間テキストは`MessageOutputItem`として保持される
- **バックエンドの対応**: 変更不要。既存の`text_delta`（`response.output_text.delta`）と`response_created`イベントで中間テキストもターン境界も送信済み
- **フロントエンドの変更**:
  - `TextActivityItem` 型追加（`kind: "text"`, `content: string`）
  - `useChat.ts`: `currentTextItemIdRef` でテキストセグメントを管理。`text_delta` → 現在のセグメントに追記。`response_created` / `tool_call` / `reasoning` / `chart` / `ask_user` → セグメントリセット（次の`text_delta`で新セグメント開始）
  - `ChatMessage.tsx`: `TextActivityItem` があるメッセージはインターリーブモードで全activityItemsを時系列表示。ないメッセージはレガシーモード（後方互換）
  - 完了後の表示: テキスト・チャート・ask_userは常時表示。reasoning+toolは`ActivityGroupInline`コンポーネントで折りたたみバッジとしてインライン表示
- **システムプロンプト**: 「中間報告ルール」セクション追加。ツール実行前に1-2文で進捗報告するよう指示
- **後方互換**: DBに保存済みの古いメッセージは`TextActivityItem`を持たないため、レガシーモード（`message.content`を下部に表示）で表示
- **情報ソース**:
  - Responses API mixed output: https://community.openai.com/t/responses-api-returns-message-function-call/1293055
  - SDK `_run_impl.py:423` — `has_tools_or_approvals_to_run()` がtrueかつテキストありの場合 `NextStepRunAgain` でループ継続
  - SDK `run.py:1554` — `ResponseOutputItemDoneEvent` 処理でストリーミング中にイベント送信

## Ask-User ツール（エージェントからユーザーへの構造化質問・確認機能）
- AIエージェントがチャット中にユーザーへ**構造化された複数の質問**を一括送信し、全回答をまとめて受け取ってから処理を続行する機能
- **アーキテクチャ**: `@function_tool` + `ToolContext[ChatContext]` + `asyncio.Event` + `asyncio.Queue`
  - `ask_user` ツール: `questions` パラメータ（JSON配列文字列）で構造化質問を受け取る
  - `PendingQuestionGroup` で複数質問をグループ管理、`asyncio.Event.wait()` で回答待機
  - `asyncio.Queue` でSDKストリームイベントとask_userイベントを多重化
  - `POST /api/chat/respond` エンドポイントで `{group_id, responses: {q_id: answer}}` を受信 → `Event.set()` でツール関数を再開
- **質問フォーマット**: JSON配列 `[{"id":"kpi","question":"最重要KPIは？","type":"choice","options":["問い合わせ","資料請求","購入"]}, ...]`
- **質問タイプ**: `choice`（選択肢ボタン）、`text`（自由入力）、`confirm`（はい/いいえ）
- **タイムアウト**: 300秒（超過時はタイムアウトメッセージをツール戻り値として返す）
- **UI**: 番号付きカード形式で複数質問を表示、マークダウンレンダリング対応、全回答後に一括送信ボタン
- **MCPタイムアウト**: GA4/GSC共に `client_session_timeout_seconds=120`（30sから引き上げ）
- **実装ファイル**:
  - バックエンド: `backend/app/services/ask_user_store.py`（QuestionItem + PendingQuestionGroup + AskUserStore シングルトン）
  - バックエンド: `backend/app/services/agent_service.py`（ChatContext dataclass + `ask_user` function_tool(questions: str) + Queue-based stream_chat）
  - バックエンド: `backend/app/routers/chat.py`（`POST /api/chat/respond` {group_id, responses} + reasoning翻訳をevent_generator内で処理）
  - フロントエンド: `frontend/lib/types.ts`（AskUserQuestionItem, AskUserActivityItem, PendingQuestionGroup, StreamEvent拡張）
  - フロントエンド: `frontend/lib/hooks/useChat.ts`（pendingQuestionGroup state + respondToQuestions callback + ask_user SSEハンドリング）
  - フロントエンド: `frontend/app/dashboard/components/AskUserPrompt.tsx`（構造化複数質問UI: choice/text/confirm, マークダウン対応, 回答済み表示）
  - フロントエンド: `frontend/app/dashboard/components/ChatMessage.tsx`（ActivityTimeline内にask_user表示統合）
  - フロントエンド: `frontend/app/dashboard/components/ChatWindow.tsx`（pendingQuestionGroup + onRespondToQuestions props）
- **情報ソース**:
  - SDK `ToolContext`: `backend/.venv/lib/python3.12/site-packages/agents/tool_context.py`
  - SDK `RunContextWrapper`: `backend/.venv/lib/python3.12/site-packages/agents/run_context.py`
  - SDK `@function_tool`: `backend/.venv/lib/python3.12/site-packages/agents/tool.py`
- **注意**: Cloud Runでは`AskUserStore`はインメモリなのでインスタンス間で共有不可。単一インスタンス運用が前提。

## 会話履歴管理（A案: to_input_list + DB）
- **方式**: 各ターン完了後に `result.to_input_list()` で全会話コンテキスト（ツールコール、ツール結果、推論アイテム含む）をResponses API入力形式で取得し、`conversations.context_items` (JSONB) に保存
- **次ターンの入力**: `context_items` が存在すれば `context_items + [新ユーザーメッセージ]` を Runner の input に渡す。なければ従来の `role+content` historyにフォールバック
- **表示用メッセージ**: `messages` テーブルに `role+content+activity_items` で保存（UIの会話履歴表示用）
- **DB変更**:
  - `conversations` テーブルに `context_items JSONB` カラム追加
    - Supabase SQL Editor で手動実行: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_items JSONB;`
  - `messages` テーブルに `activity_items JSONB` カラム追加（リロード時のUI復元用）
    - マイグレーション: `supabase/migrations/20260202100000_add_activity_items.sql`
    - Supabase SQL Editor で手動実行: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS activity_items JSONB;`
- **activity_items保存**: `chat.py` の `event_generator` がストリーミング中にactivityItemsを収集（フロントエンドのuseChat.tsと同じセグメント分割ロジック）。`done`イベント時にメッセージと一緒にDB保存
- **activity_items復元**: `page.tsx` の `recordToMessage()` がDBから読んだ `activity_items` を `ActivityItem[]` に変換（IDはクライアント側で生成）。`TextActivityItem` があればインターリーブモードで表示
- **シリアライズ**: `_serialize_input_list()` ヘルパーで TypedDict/Pydantic を dict に変換
- **内部イベント**: `_context_items` タイプのイベントは `chat.py` でインターセプトしDB保存、クライアントには送信しない
- **コンテキスト圧縮**: 未実装。将来的に `openai_responses_compaction_session` または手動 compact API で対応予定
- **実装ファイル**:
  - `backend/app/services/agent_service.py` — `stream_chat()` に `context_items` パラメータ追加、ポンプ完了後に `to_input_list()` → `_context_items` イベント yield
  - `backend/app/routers/chat.py` — `context_items` のDB保存/読み込み、`_context_items` イベントのインターセプト
- **情報ソース**:
  - SDK `to_input_list()`: `backend/.venv/lib/python3.12/site-packages/agents/result.py:125`
  - SDK `ItemHelpers.input_to_new_input_list()`: `backend/.venv/lib/python3.12/site-packages/agents/items.py`
  - REPL参考実装: `backend/.venv/lib/python3.12/site-packages/agents/repl.py:66`

## MCP出力トークン最適化（CompactMCPServer）
- **問題**: GA4の`analytics-mcp`パッケージは`proto_to_dict()`で protobuf → verbose JSON 変換。各行の `dimension_values: [{value: "X"}]` / `metric_values: [{value: "Y"}]` 構造が **262%のオーバーヘッド**。28日×5チャネルの典型レポートで ~13,000トークン消費
- **解決**: `CompactMCPServer` プロキシクラスで `call_tool` 出力を TSV に変換。**~77%トークン削減**
- **変換対象**: `run_report`, `run_realtime_report` のみ（他のGA4ツールは出力が小さいためそのまま）
- **GSC**: 既にマークダウンテーブル形式で効率的（変更不要）
- **変換フォーマット**:
  ```
  date\tchannel\tsessions\tactiveUsers
  20260127\tOrganic Search\t153\t130
  ---
  rows: 140
  ```
- **SSE truncation**: `str(item.output)[:4000]` に引き上げ（圧縮後は余裕がある）
- **実装ファイル**:
  - `backend/app/services/compact_mcp.py` — `CompactMCPServer` プロキシ + `_compact_ga4_report()` 変換関数
  - `backend/app/services/mcp_manager.py` — `create_ga4_server()` で `CompactMCPServer(raw_server)` にラップ

## ThinkingIndicator（考え中インジケーター）
- **問題**: メッセージ送信後、最初のSSEイベント到着まで3-9秒間、点滅する赤い縦棒しか表示されず「壊れている」ように見える
- **解決**: Phase 1（待機中）専用の`ThinkingIndicator`コンポーネントを表示
- **デザイン**: 3つのドット（5px、`#c0c4cc`）がopacityパルス（0.2sスタガー）+ 日本語ラベルが3秒ごとにローテーション（「考えています」→「データを確認しています」→「分析しています」）
- **表示条件**: `message.isStreaming && items.length === 0 && !message.content` — 最初のSSEイベント到着で自然にアンマウント
- **退場アニメーションなし**: コンテンツ表示を遅延させないため即座にアンマウント
- **アクセシビリティ**: `role="status"` + `aria-label`、`prefers-reduced-motion`でアニメーション無効化
- **実装ファイル**:
  - `frontend/app/dashboard/components/ThinkingIndicator.tsx` — コンポーネント（新規）
  - `frontend/app/globals.css` — `thinking-pulse`, `thinking-enter`, `thinking-label-in` キーフレーム
  - `frontend/app/dashboard/components/ChatMessage.tsx` — `showThinking` 条件分岐をレガシーモードに追加

## チャットレイテンシの内訳（調査結果）
- **最初のテキスト到達まで推定3.5-9.5秒**
- 内訳:
  1. OpenAI Reasoning (`effort="medium"`): 2-5秒 — `agent_service.py:392`
  2. MCPサーバー3つの逐次起動: 1-3秒 — `agent_service.py:368-370`（`await stack.enter_async_context()`で順番に起動）
  3. Supabase同期DBクエリ6-8回: 0.5-1.5秒 — `chat.py:40-90`
  4. Reasoning翻訳 (gpt-5-nano): 0.5-1.5秒 — `chat.py:136-142`
- **MCPサーバーはキャッシュなし**: `create_server_triple()`は毎リクエストで新規サブプロセスを起動
- **改善候補（未実施）**: effort変更、MCP並列起動、MCPプーリング、DBクエリ非同期化

## ask_user回答のDB永続化（内部イベントパターン）
- **問題**: バックエンドの`activity_items`にユーザー回答(responses)が含まれないままDB保存されていた
- **原因**: ask_userイベント発行時点では未回答。フロントのrespondToQuestionsはReact stateのみ更新。バックエンドのactivity_itemsには反映されない
- **修正パターン**: `_ask_user_responses` 内部イベント（`_context_items`と同パターン）
  1. `agent_service.py`: ask_userツール関数が回答取得後に `emit_event({"type": "_ask_user_responses", "group_id": ..., "responses": ...})` を送信
  2. `chat.py`: `_ask_user_responses` イベントをインターセプト → activity_items内の該当ask_userアイテムに`responses`を書き戻し → `continue`でクライアントには送信しない
  3. `types.ts`: `ActivityItemRecord`に`responses?: Record<string, string>`を追加
- **DB復元時**: `page.tsx`の`restoreActivityItems()`がスプレッド演算子で全フィールド保持 → `responses`が含まれていれば`ChatMessage.tsx`で`isAnswered=true`判定 → `AnsweredView`表示
- **実装ファイル**:
  - `backend/app/services/agent_service.py` — `_ask_user_responses`イベントemit（行100-108）
  - `backend/app/routers/chat.py` — `_ask_user_responses`インターセプト（行209-217）
  - `frontend/lib/types.ts` — `ActivityItemRecord.responses`フィールド追加（行152）

## Important Notes
- The OpenAI Agents SDK reads OPENAI_API_KEY from os.environ (set in main.py)
- MCP servers use stdio transport (MCPServerStdio / MCPServerStdioParams)
- Supabase uses service_role key (bypasses RLS) on backend

## レスポンシブ対応の知見（重要）

### flexレイアウトのoverflow制御チェーン
モバイルでテーブルやコードブロックが画面幅を超えてはみ出す問題の根本原因と対策:

**根本原因**: `flex-1`の子要素に`min-w-0`がないと、テーブルの`whitespace-nowrap`セルがコンテナを無限に押し広げる。

**必須の制約チェーン**（どこか1つでも欠けると崩壊する）:
```
Dashboard (flex)
  └─ Main area: flex-1 + min-w-0           ← 幅制約の起点
      └─ ChatWindow scroll: overflow-x-hidden  ← 横はみ出し遮断
          └─ Messages div: min-w-0             ← flex子の幅制約
              └─ .assistant-response: overflow-hidden + min-w-0
                  └─ .report-content: overflow-hidden + min-w-0
                      └─ Table wrapper: overflow-x-auto（横スクロール可）
                          └─ table: min-w-full（w-fullだとダメ）
```

### テーブルのCSS知見
- `w-full` → テーブルが親幅に合わせようとして`overflow-x-auto`が無効化される
- `min-w-full` → テーブルは内容幅まで広がり、親からはスクロールで制御される
- モバイルでは `word-break: keep-all`（日付 `2026-01-03` が途中で改行されない）
- `.report-content`の`padding-left`はモバイル(640px以下)で0にして表示領域を最大化

### safe-area対応
- `layout.tsx`で`viewportFit: "cover"`を設定
- `globals.css`で`.safe-bottom`クラスを定義（`padding-bottom: env(safe-area-inset-bottom)`）
- ChatInputの外側divに`.safe-bottom`を適用してノッチ端末でも入力欄が隠れない

### モバイルブラウザの高さ制御（最重要）
- **CSSのviewport単位（`dvh`, `svh`, `lvh`）はブラウザのボトムバー（タブバー等）を考慮しない**
- `env(safe-area-inset-bottom)` はデバイスのハードウェア（ノッチ、ホームインジケーター）のみ対応し、ブラウザUIバーには効かない
- **解決策**: `visualViewport` APIをレイアウトレベルで使用し、実際の可視領域の高さをCSS変数に設定する
- Dashboard layoutの`useEffect`で `window.visualViewport.height` を `--app-height` CSS変数に反映
- コンテナのスタイルは `style={{ height: "var(--app-height, 100dvh)" }}` でフォールバック付き
- `resize`と`scroll`両方のイベントをリッスン（iOS: scroll時にviewportが変化、Android: resize時に変化）
- これにより、キーボード表示時・ブラウザUIバー表示時の両方で正しい高さが自動的に計算される
- ChatInput側で個別にviewport監視する必要はない（レイアウトレベルで一元管理）

### ハンバーガーメニューの配置
- `fixed`で浮遊させるのはNG（トップバーの要素と重なる）
- トップバー内に`md:hidden`で内包し、PropertySelectorの左に配置する
- Sidebarコンポーネントは`mobileOpen`/`onMobileOpenChange`をpropsで受け取り、DashboardPageが状態管理する

## 自己改善ログ

> ユーザーから指摘された失敗・判断ミス・非効率を記録し、同じ過ちを繰り返さないための学習記録。

### パッケージ管理を間違えた
- **何をやった**: バックエンドで `pip install` を使おうとした
- **何が悪かった**: プロジェクトのパッケージ管理ルールを無視した（backend=`uv add`, frontend=`bun add`）
- **ユーザーの指摘**: 「おい、ちなみにバックエンドはuv add, フロントエンドはbun addっていう制約覚えてる？？」
- **次からどうする**: 依存追加の前に必ずCLAUDE.mdのPackage Managementセクションを確認する

### ビルドコマンドを間違えた
- **何をやった**: `npx next build` を実行しようとした
- **何が悪かった**: フロントエンドは `bun` を使うプロジェクトなのに `npx` を使った
- **ユーザーの指摘**: 「bun run buildでお願い」
- **次からどうする**: フロントエンドのコマンド実行は常に `bun run` を使う

### MCP応答パースの浅い調査
- **何をやった**: MCP `get_account_summaries` の応答を1つの TextContent だけ処理し、残りを無視した
- **何が悪かった**: MCPは各アカウントを個別のTextContentとして返す。最初のアイテムだけ見て `return` していたため0件になった
- **次からどうする**: MCP応答は全TextContentを反復処理する。構造が不明な場合はまずデバッグログで全体を確認してから実装する

### ツール引数のJSONがチャットに漏れた
- **何をやった**: SSEストリーミングで `raw_response_event` の全deltaをテキストとして送信した
- **何が悪かった**: `response.function_call_arguments.delta` もテキストとして送られ、JSON引数がチャット画面に表示された
- **次からどうする**: SSEイベントは `data.type` を厳密にチェックし、`response.output_text.delta` のみをテキストとして送信する

### Google再連携UIの不備
- **何をやった**: Google OAuth scope変更（GSC追加）後、再連携の手段をユーザーに説明だけした
- **何が悪かった**: フロントエンドに再連携UIがなく、ユーザーは実際に操作できなかった
- **次からどうする**: 機能追加は「ユーザーが実際に操作できる状態」まで完成させる。説明だけで終わらない

### CLAUDE.mdを更新しなかった
- **何をやった**: レスポンシブ対応で大量のUI変更・技術的発見をしたのにCLAUDE.mdを一切更新しなかった
- **何が悪かった**: flexのoverflow制御チェーン、ChatGPT風UI変更、safe-area対応など重要な知見が記録されず、次のセッションで同じ調査を繰り返すところだった
- **ユーザーの指摘**: 「ちなみにあなたの記憶は更新されてますか？？」
- **次からどうする**: コード変更・新発見・設計変更が発生したら**その場で即座に**CLAUDE.mdを更新する。作業の最後にまとめて書くのではなく、リアルタイムで追記する。運用ルール8番を遵守する

### レスポンシブ対応が浅かった
- **何をやった**: 最初のレスポンシブ修正でフォントサイズとパディングの調整だけ行った
- **何が悪かった**: 根本原因（flexの`min-w-0`欠如、`w-full`テーブル問題）を見逃し、表面的なサイズ調整だけした。結果、テーブルが画面外にはみ出したまま
- **次からどうする**: レスポンシブ対応では「コンテンツが画面幅を超えないこと」を最優先で確認する。まずoverflowの制約チェーン（min-w-0, overflow-hidden）を確保してから、サイズ調整に入る

### CLAUDE.mdの更新をまた忘れた（3回目）
- **何をやった**: レイテンシ調査、ThinkingIndicator設計・実装、ask_user不具合調査と大量の作業をしたのにCLAUDE.mdを一切更新しなかった
- **何が悪かった**: 運用ルール8番を再び違反。ユーザーに「記憶更新してる？忘れてるよね？」と指摘された
- **次からどうする**: **コード変更・新発見のたびにリアルタイムで更新する**。1つの機能実装が終わるたびに即座にCLAUDE.mdに追記。セッション最後にまとめて書くのは禁止

### マイグレーションファイルの配置を間違えた
- **何をやった**: `backend/migrations/add_activity_items.sql` にマイグレーションを作成した
- **何が悪かった**: このプロジェクトのマイグレーションは `supabase/migrations/` に配置するルール。既存の `20260131000000_initial.sql` や `20260202000000_add_context_items.sql` が全てそこにある
- **ユーザーの指摘**: 「だからマイグレーションはsupabaseディレクトリに配置しろって毎回言ってるよね？？」
- **次からどうする**: マイグレーションSQLは**必ず `supabase/migrations/` に配置**する。ファイル名は `YYYYMMDDHHMMSS_description.sql` 形式。`backend/migrations/` は使わない
