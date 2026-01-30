import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.deps import get_mcp_manager
from app.routers import auth, chat, properties, conversations

# Ensure OPENAI_API_KEY is in os.environ for the OpenAI Agents SDK
_settings = get_settings()
if _settings.openai_api_key and not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = _settings.openai_api_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    mcp_manager = get_mcp_manager()

    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            await mcp_manager.cleanup_expired()

    task = asyncio.create_task(cleanup_loop())
    yield
    # Shutdown
    task.cancel()
    mcp_manager.credentials_manager.cleanup_all()


app = FastAPI(
    title="GA4 AI Agent API",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(properties.router)
app.include_router(conversations.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
