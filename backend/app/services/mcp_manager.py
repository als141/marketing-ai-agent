import asyncio
import os
import sys
import time
from dataclasses import dataclass, field
from agents.mcp import MCPServerStdio
from agents.mcp.server import MCPServerStdioParams

from app.config import get_settings
from app.services.credentials_manager import CredentialsManager
from app.services.compact_mcp import CompactMCPServer

SESSION_TIMEOUT_SECONDS = 600  # 10 minutes

# Path to GSC MCP server script
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GSC_SERVER_SCRIPT = os.path.join(_BACKEND_DIR, "scripts", "gsc_server.py")


@dataclass
class MCPSession:
    server: MCPServerStdio
    creds_path: str
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)

    def is_expired(self) -> bool:
        return (time.time() - self.last_used) > SESSION_TIMEOUT_SECONDS

    def touch(self):
        self.last_used = time.time()


@dataclass
class MCPServerPair:
    """A pair of GA4 + GSC MCP servers with their credential paths for cleanup."""
    ga4_server: MCPServerStdio
    gsc_server: MCPServerStdio
    ga4_creds_path: str
    gsc_creds_path: str


class MCPSessionManager:
    def __init__(self, credentials_manager: CredentialsManager):
        self.credentials_manager = credentials_manager
        self._sessions: dict[str, MCPSession] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, user_id: str) -> asyncio.Lock:
        if user_id not in self._locks:
            self._locks[user_id] = asyncio.Lock()
        return self._locks[user_id]

    def _create_creds(self, user_id: str, refresh_token: str, purpose: str) -> str:
        settings = get_settings()
        return self.credentials_manager.create_credentials_file(
            user_id=user_id,
            refresh_token=refresh_token,
            client_id=settings.google_oauth_client_id,
            client_secret=settings.google_oauth_client_secret,
            quota_project_id=settings.google_project_id,
            purpose=purpose,
        )

    def create_ga4_server(self, user_id: str, refresh_token: str) -> tuple[CompactMCPServer, str]:
        """Create GA4 MCP server wrapped with CompactMCPServer for token optimization.
        Returns (server, creds_path) for cleanup."""
        settings = get_settings()
        creds_path = self._create_creds(user_id, refresh_token, purpose="ga4")
        raw_server = MCPServerStdio(
            params=MCPServerStdioParams(
                command="analytics-mcp",
                args=[],
                env={
                    "GOOGLE_APPLICATION_CREDENTIALS": creds_path,
                    "GOOGLE_CLOUD_PROJECT": settings.google_project_id,
                    "GCLOUD_PROJECT": settings.google_project_id,
                    "GOOGLE_CLOUD_QUOTA_PROJECT": settings.google_project_id,
                },
            ),
            cache_tools_list=True,
            client_session_timeout_seconds=120,
        )
        return CompactMCPServer(raw_server, max_output_chars=settings.max_tool_output_chars), creds_path

    def create_gsc_server(self, user_id: str, refresh_token: str) -> tuple[MCPServerStdio, str]:
        """Create GSC MCP server. Returns (server, creds_path) for cleanup."""
        creds_path = self._create_creds(user_id, refresh_token, purpose="gsc")
        server = MCPServerStdio(
            params=MCPServerStdioParams(
                command=sys.executable,
                args=[GSC_SERVER_SCRIPT],
                env={
                    "GSC_TOKEN_FILE": creds_path,
                },
            ),
            cache_tools_list=True,
            client_session_timeout_seconds=120,
        )
        return server, creds_path

    def create_server_pair(self, user_id: str, refresh_token: str) -> MCPServerPair:
        """Create both GA4 and GSC servers with separate credential files."""
        ga4_server, ga4_creds = self.create_ga4_server(user_id, refresh_token)
        gsc_server, gsc_creds = self.create_gsc_server(user_id, refresh_token)
        return MCPServerPair(
            ga4_server=ga4_server,
            gsc_server=gsc_server,
            ga4_creds_path=ga4_creds,
            gsc_creds_path=gsc_creds,
        )

    def cleanup_server_pair(self, pair: MCPServerPair):
        """Clean up credential files for a server pair."""
        self.credentials_manager.cleanup_path(pair.ga4_creds_path)
        self.credentials_manager.cleanup_path(pair.gsc_creds_path)

    # Backward compat alias
    def create_mcp_server(self, user_id: str, refresh_token: str) -> tuple[MCPServerStdio, str]:
        return self.create_ga4_server(user_id, refresh_token)

    async def cleanup_expired(self):
        expired_users = [
            uid for uid, session in self._sessions.items() if session.is_expired()
        ]
        for uid in expired_users:
            session = self._sessions.pop(uid, None)
            if session:
                self.credentials_manager.cleanup_user(uid)
            self._locks.pop(uid, None)
