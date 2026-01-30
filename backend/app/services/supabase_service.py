from supabase import create_client, Client
from app.config import get_settings


def get_supabase_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def get_or_create_user(supabase: Client, clerk_id: str, email: str | None = None, display_name: str | None = None) -> dict:
    result = supabase.table("users").select("*").eq("clerk_id", clerk_id).execute()
    if result.data:
        return result.data[0]
    new_user = {
        "clerk_id": clerk_id,
        "email": email,
        "display_name": display_name,
        "google_connected": False,
    }
    result = supabase.table("users").insert(new_user).execute()
    return result.data[0]


async def update_user_google_token(supabase: Client, clerk_id: str, refresh_token: str) -> dict:
    result = (
        supabase.table("users")
        .update({"google_refresh_token": refresh_token, "google_connected": True})
        .eq("clerk_id", clerk_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def get_user_google_token(supabase: Client, clerk_id: str) -> str | None:
    result = supabase.table("users").select("google_refresh_token").eq("clerk_id", clerk_id).execute()
    if result.data and result.data[0].get("google_refresh_token"):
        return result.data[0]["google_refresh_token"]
    return None
