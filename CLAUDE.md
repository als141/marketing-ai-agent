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
- **MCP Servers**: analytics-mcp (GA4), scripts/gsc_server.py (Google Search Console wrapper)
- **情報ソース**:
  - OpenAI Agents SDK: https://github.com/openai/openai-agents-python
  - analytics-mcp (GA4): https://github.com/nicosalm/analytics-mcp（`pip install analytics-mcp` / MCP stdio）
  - GSC MCP 参考元: https://github.com/AminForou/mcp-gsc（これをベースにOAuth対応wrapper作成）
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

## Environment Variables
- Backend: `.env` in `backend/`
- Frontend: `.env.local` in `frontend/`

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
- スコープ `analytics.readonly` は **Restricted** → 本番公開にはCASAセキュリティ監査が必要
- スコープ `webmasters` は **Sensitive** → 審査は必要だがCASAは不要
- 本番公開に必要: プライバシーポリシー、利用規約、ドメイン所有権確認、スコープ正当性説明
- Google Cloud Console > OAuth同意画面でリダイレクトURI・JS生成元に本番URLを追加済み

## Troubleshooting Log
- **CORS 400 on OPTIONS**: Cloud RunにFRONTEND_URL環境変数が未設定だった → 設定で解決
- **401 CLERK_JWKS_URL must be set**: Cloud RunにClerk環境変数が未設定だった → 設定で解決
- **[Errno 2] No such file or directory (analytics-mcp)**: pyproject.tomlにanalytics-mcpが依存関係として未記載だった → `analytics-mcp>=0.1.1` を追加して解決

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
- **現在の設定**: `effort="medium"`, `verbosity="low"`
- **情報ソース**:
  - OpenAI Agents SDK ドキュメント: https://openai.github.io/openai-agents-python/models/
  - GPT-5.2 モデルページ: https://platform.openai.com/docs/models/gpt-5.2
  - GPT-5.2 プロンプトガイド: https://cookbook.openai.com/examples/gpt-5/gpt-5-2_prompting_guide
  - Agents SDK GitHub: https://github.com/openai/openai-agents-python
  - SDK内ソース（デフォルト設定）: `backend/.venv/lib/python3.12/site-packages/agents/models/default_models.py`
  - SDK内ソース（ModelSettings定義）: `backend/.venv/lib/python3.12/site-packages/agents/model_settings.py`

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
