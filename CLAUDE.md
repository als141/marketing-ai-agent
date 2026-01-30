# CLAUDE.md - Project Rules & Memory

> **このファイルはClaude Codeの永続メモリである。**
> セッションをまたいで知識を保持するための唯一の手段がこのファイルである。
> Claude Codeは以下を厳守すること:
> 1. **毎回の作業開始時**にこのファイルを読み込み、内容に従って行動する
> 2. **作業中に新しい知見・決定・変更が生じたら**、即座にこのファイルを更新する（追記・修正・削除）
> 3. **更新対象**: アーキテクチャ変更、新しい依存関係、デプロイ設定、踏んだ罠・解決策、環境差異、運用ルールなど
> 4. このファイルの情報が古くなった場合は削除・修正し、常に最新状態を維持する
> 5. **あとで思い出せるように書く**: 技術的な知見を記録する際は、調査元の公式ドキュメントURL・GitHubリポジトリ・SDKソースファイルパスなどの**情報ソース**も一緒に記録すること。次のセッションで「なぜこうなっているか」「どこで確認したか」を即座に辿れるようにする

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
- Colors: Navy (#1a1a2e) text, white/gray background, accent (#e94560)
- Component library: shadcn/ui
- Chat UI: Flat card style (not round bubbles)

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

## Important Notes
- The OpenAI Agents SDK reads OPENAI_API_KEY from os.environ (set in main.py)
- MCP servers use stdio transport (MCPServerStdio / MCPServerStdioParams)
- Supabase uses service_role key (bypasses RLS) on backend
