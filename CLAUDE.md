# CLAUDE.md - Project Rules & Memory

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

## Important Notes
- Always update this CLAUDE.md when project rules or architecture decisions change
- The OpenAI Agents SDK reads OPENAI_API_KEY from os.environ (set in main.py)
- MCP servers use stdio transport (MCPServerStdio / MCPServerStdioParams)
- Supabase uses service_role key (bypasses RLS) on backend
