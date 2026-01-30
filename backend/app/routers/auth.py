import os
import secrets
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.middleware.auth_middleware import get_current_user
from app.deps import get_supabase
from app.services.supabase_service import (
    get_or_create_user,
    update_user_google_token,
    disconnect_user_google,
)
from app.models.schemas import GoogleAuthStatus, GoogleConnectResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters",
]

# In-memory state store for CSRF protection
_oauth_states: dict[str, str] = {}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


@router.get("/google-status", response_model=GoogleAuthStatus)
async def google_status(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"], user.get("email"))
    return GoogleAuthStatus(
        connected=db_user.get("google_connected", False),
    )


@router.post("/google-disconnect")
async def google_disconnect(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    await disconnect_user_google(supabase, user["clerk_id"])
    return {"status": "disconnected"}


@router.post("/google-connect", response_model=GoogleConnectResponse)
async def google_connect(
    user: dict = Depends(get_current_user),
):
    settings = get_settings()

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = user["clerk_id"]

    redirect_uri = f"{settings.backend_url}/api/auth/google-callback"
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return GoogleConnectResponse(auth_url=auth_url)


@router.get("/google-callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    clerk_id = _oauth_states.pop(state, None)
    if not clerk_id:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    settings = get_settings()
    redirect_uri = f"{settings.backend_url}/api/auth/google-callback"

    # Exchange code for tokens using httpx (avoids oauthlib scope mismatch)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Token exchange failed: {resp.text}",
        )

    token_data = resp.json()
    refresh_token = token_data.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Failed to obtain refresh token. Please try again.",
        )

    supabase = get_supabase()
    await update_user_google_token(supabase, clerk_id, refresh_token)

    return RedirectResponse(
        url=f"{settings.frontend_url}/dashboard?google_connected=true"
    )
