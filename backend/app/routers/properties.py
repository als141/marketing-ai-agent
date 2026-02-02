from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user
from app.deps import get_supabase, get_agent_service
from app.services.supabase_service import get_or_create_user, get_user_google_token
from app.models.schemas import PropertySelectRequest, PropertySummary, GscPropertySummary

router = APIRouter(prefix="/api/properties", tags=["properties"])


@router.get("", response_model=list[PropertySummary])
async def list_properties(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    refresh_token = await get_user_google_token(supabase, user["clerk_id"])
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Google account not connected")

    agent_service = get_agent_service()
    try:
        properties = await agent_service.list_properties(user["clerk_id"], refresh_token)
        return [PropertySummary(**p) for p in properties]
    except Exception as e:
        print(f"[Properties] Error listing properties: {e}")
        raise HTTPException(status_code=502, detail=f"MCP server error: {e}")


@router.get("/gsc", response_model=list[GscPropertySummary])
async def list_gsc_properties(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    refresh_token = await get_user_google_token(supabase, user["clerk_id"])
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Google account not connected")

    agent_service = get_agent_service()
    try:
        sites = await agent_service.list_gsc_properties(user["clerk_id"], refresh_token)
        return [GscPropertySummary(**s) for s in sites]
    except Exception as e:
        print(f"[GSC Properties] Error listing properties: {e}")
        raise HTTPException(status_code=502, detail=f"GSC MCP server error: {e}")


@router.post("/select")
async def select_property(
    body: PropertySelectRequest,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])

    # Reset all defaults
    supabase.table("user_properties").update({"is_default": False}).eq(
        "user_id", db_user["id"]
    ).execute()

    # Upsert the selected property
    supabase.table("user_properties").upsert(
        {
            "user_id": db_user["id"],
            "property_id": body.property_id,
            "property_name": body.property_name,
            "account_name": body.account_name,
            "is_default": True,
        },
        on_conflict="user_id,property_id",
    ).execute()

    return {"status": "ok"}


@router.get("/selected")
async def get_selected_property(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])

    result = (
        supabase.table("user_properties")
        .select("*")
        .eq("user_id", db_user["id"])
        .eq("is_default", True)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None
