from functools import lru_cache
from app.services.credentials_manager import CredentialsManager
from app.services.mcp_manager import MCPSessionManager
from app.services.agent_service import AgentService
from app.services.supabase_service import get_supabase_client


@lru_cache(maxsize=1)
def get_credentials_manager() -> CredentialsManager:
    return CredentialsManager()


@lru_cache(maxsize=1)
def get_mcp_manager() -> MCPSessionManager:
    return MCPSessionManager(get_credentials_manager())


@lru_cache(maxsize=1)
def get_agent_service() -> AgentService:
    return AgentService(get_mcp_manager())


def get_supabase():
    return get_supabase_client()
