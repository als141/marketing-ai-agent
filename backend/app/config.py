import os
from dataclasses import dataclass

from pydantic_settings import BaseSettings
from functools import lru_cache


@dataclass(frozen=True)
class WordPressSite:
    """A WordPress MCP site parsed from environment variables."""
    label: str
    server_url: str
    authorization: str


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000

    clerk_secret_key: str = ""
    clerk_publishable_key: str = ""
    clerk_jwks_url: str = ""

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_project_id: str = ""

    openai_api_key: str = ""
    chat_model: str = "gpt-5.2"
    reasoning_translate_model: str = "gpt-5-nano"
    max_tool_output_chars: int = 16000

    # Meta Ads MCP
    meta_ads_enabled: bool = False
    meta_access_token: str = ""

    # WordPress MCP
    wordpress_enabled: bool = False

    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def get_wordpress_sites(self) -> list[WordPressSite]:
        """Parse WORDPRESS_*_MCP_SERVER_URL / WORDPRESS_*_MCP_AUTHORIZATION pairs from env.

        Requires WORDPRESS_ENABLED=true to return any sites.

        Naming convention:
          WORDPRESS_MCP_SERVER_URL + WORDPRESS_MCP_AUTHORIZATION          → label "wordpress"
          WORDPRESS_ACHIEVE_MCP_SERVER_URL + WORDPRESS_ACHIEVE_MCP_AUTHORIZATION → label "wordpress_achieve"
          WORDPRESS_FOO_MCP_SERVER_URL + WORDPRESS_FOO_MCP_AUTHORIZATION  → label "wordpress_foo"
        """
        if not self.wordpress_enabled:
            return []

        sites: list[WordPressSite] = []
        suffix = "_MCP_SERVER_URL"

        for key, url in os.environ.items():
            if not key.startswith("WORDPRESS_") or not key.endswith(suffix):
                continue
            if not url:
                continue

            # Extract middle part: WORDPRESS_{middle}_MCP_SERVER_URL
            prefix_part = key[: -len(suffix)]  # e.g. "WORDPRESS" or "WORDPRESS_ACHIEVE"
            auth_key = prefix_part + "_MCP_AUTHORIZATION"
            authorization = os.environ.get(auth_key, "")
            if not authorization:
                continue

            # Build label from middle part
            label = prefix_part.lower()  # "wordpress" or "wordpress_achieve"

            sites.append(WordPressSite(
                label=label,
                server_url=url,
                authorization=authorization,
            ))

        return sites


@lru_cache
def get_settings() -> Settings:
    return Settings()
