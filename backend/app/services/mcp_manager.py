import asyncio
import os
import sys
import time
from dataclasses import dataclass, field
from agents.mcp import MCPServerStdio, MCPServerStreamableHttp
from agents.mcp.server import MCPServerStdioParams, MCPServerStreamableHttpParams

from app.config import get_settings
from app.services.credentials_manager import CredentialsManager
from app.services.compact_mcp import CompactMCPServer
from app.services.prefixed_mcp import PrefixedMCPServer

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
    """GA4 + GSC + optional extra MCP servers with credential paths for cleanup."""
    ga4_server: MCPServerStdio
    gsc_server: MCPServerStdio
    ga4_creds_path: str
    gsc_creds_path: str
    meta_ads_server: MCPServerStdio | None = None
    wordpress_servers: list = field(default_factory=list)


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

    def create_meta_ads_server(self) -> MCPServerStdio | None:
        """Create Meta Ads MCP server if enabled. Returns server or None."""
        settings = get_settings()
        if not settings.meta_ads_enabled or not settings.meta_access_token:
            return None
        server = MCPServerStdio(
            params=MCPServerStdioParams(
                command="meta-ads-mcp",
                args=[],
                env={
                    "META_ACCESS_TOKEN": settings.meta_access_token,
                    "META_ADS_DISABLE_CALLBACK_SERVER": "1",
                },
            ),
            cache_tools_list=True,
            client_session_timeout_seconds=120,
        )
        return server

    def create_wordpress_servers(self) -> list:
        """Create WordPress MCP servers from environment variables.
        When multiple sites exist, wraps each with PrefixedMCPServer to avoid
        duplicate tool names (e.g. achieve__wp-mcp-get-posts-by-category)."""
        settings = get_settings()
        sites = settings.get_wordpress_sites()
        print(f"[WordPress MCP] wordpress_enabled={settings.wordpress_enabled}, sites found: {len(sites)}")
        servers = []
        need_prefix = len(sites) > 1
        for site in sites:
            print(f"[WordPress MCP] Creating server: {site.label} -> {site.server_url}")
            raw_server = MCPServerStreamableHttp(
                params=MCPServerStreamableHttpParams(
                    url=site.server_url,
                    headers={"Authorization": site.authorization},
                ),
                cache_tools_list=True,
                client_session_timeout_seconds=120,
            )
            if need_prefix:
                # Extract short prefix from label: "wordpress" -> "wp", "wordpress_achieve" -> "achieve"
                parts = site.label.split("_", 1)
                prefix = parts[1] if len(parts) > 1 else "wp"
                server = PrefixedMCPServer(raw_server, prefix=prefix)
                print(f"[WordPress MCP] Prefixed: {prefix}__<tool_name>")
            else:
                server = raw_server
            servers.append(server)
        return servers

    def create_server_pair(self, user_id: str, refresh_token: str) -> MCPServerPair:
        """Create GA4, GSC, and optionally Meta Ads / WordPress servers."""
        ga4_server, ga4_creds = self.create_ga4_server(user_id, refresh_token)
        gsc_server, gsc_creds = self.create_gsc_server(user_id, refresh_token)
        meta_ads_server = self.create_meta_ads_server()
        wordpress_servers = self.create_wordpress_servers()
        return MCPServerPair(
            ga4_server=ga4_server,
            gsc_server=gsc_server,
            ga4_creds_path=ga4_creds,
            gsc_creds_path=gsc_creds,
            meta_ads_server=meta_ads_server,
            wordpress_servers=wordpress_servers,
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
