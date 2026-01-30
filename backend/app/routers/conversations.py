from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth_middleware import get_current_user
from app.deps import get_supabase
from app.services.supabase_service import get_or_create_user
from app.models.schemas import ConversationCreate

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("")
async def list_conversations(
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])
    result = (
        supabase.table("conversations")
        .select("*")
        .eq("user_id", db_user["id"])
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("")
async def create_conversation(
    body: ConversationCreate,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])
    result = (
        supabase.table("conversations")
        .insert(
            {
                "user_id": db_user["id"],
                "property_id": body.property_id,
                "title": body.title or "新しい会話",
            }
        )
        .execute()
    )
    return result.data[0]


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])

    conv_result = (
        supabase.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", db_user["id"])
        .execute()
    )
    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = (
        supabase.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )

    conversation = conv_result.data[0]
    conversation["messages"] = msg_result.data
    return conversation


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])

    result = (
        supabase.table("conversations")
        .delete()
        .eq("id", conversation_id)
        .eq("user_id", db_user["id"])
        .execute()
    )
    return {"status": "ok"}
