import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.middleware.auth_middleware import get_current_user
from app.deps import get_supabase, get_agent_service
from app.services.supabase_service import get_or_create_user, get_user_google_token
from app.services.ask_user_store import ask_user_store
from app.models.schemas import ChatRequest

router = APIRouter(prefix="/api/chat", tags=["chat"])


class RespondRequest(BaseModel):
    group_id: str
    responses: dict[str, str]  # {question_id: answer}


@router.post("/respond")
async def respond_to_question(
    body: RespondRequest,
    user: dict = Depends(get_current_user),
):
    """Receive user's answers to an ask_user question group."""
    ok = ask_user_store.submit_responses(body.group_id, body.responses)
    if not ok:
        raise HTTPException(status_code=404, detail="Question group not found or already answered")
    return {"status": "ok"}


@router.post("/stream")
async def stream_chat(
    request: Request,
    body: ChatRequest,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    db_user = await get_or_create_user(supabase, user["clerk_id"])

    refresh_token = await get_user_google_token(supabase, user["clerk_id"])
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Google account not connected")

    # Get or create conversation
    conversation_id = body.conversation_id
    if not conversation_id:
        conv_result = (
            supabase.table("conversations")
            .insert(
                {
                    "user_id": db_user["id"],
                    "property_id": body.property_id,
                    "title": body.message[:50],
                }
            )
            .execute()
        )
        conversation_id = conv_result.data[0]["id"]

    # Save user message
    supabase.table("messages").insert(
        {
            "conversation_id": conversation_id,
            "role": "user",
            "content": body.message,
        }
    ).execute()

    # Load conversation history
    msg_result = (
        supabase.table("messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in msg_result.data
        if m["role"] in ("user", "assistant")
    ]
    # Remove the last user message since agent_service adds it
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    agent_service = get_agent_service()

    async def event_generator():
        full_response = ""
        tool_calls_data = []
        try:
            async for event in agent_service.stream_chat(
                user_id=user["clerk_id"],
                refresh_token=refresh_token,
                message=body.message,
                property_id=body.property_id,
                conversation_history=history,
            ):
                if await request.is_disconnected():
                    break

                # Handle reasoning translation inline
                if event.get("_needs_translation") and event.get("content"):
                    translated = await agent_service._translate_to_japanese(
                        event["content"]
                    )
                    event["content"] = translated
                # Remove internal flag before sending
                event.pop("_needs_translation", None)

                if event["type"] == "text_delta":
                    full_response += event.get("content", "")
                elif event["type"] == "tool_call":
                    tool_calls_data.append(event)
                elif event["type"] == "done":
                    # Save assistant response
                    if full_response:
                        msg_data = {
                            "conversation_id": conversation_id,
                            "role": "assistant",
                            "content": full_response,
                        }
                        if tool_calls_data:
                            msg_data["tool_calls"] = json.loads(
                                json.dumps(tool_calls_data)
                            )
                        supabase.table("messages").insert(msg_data).execute()

                    # Update conversation title if first message
                    supabase.table("conversations").update(
                        {"updated_at": "now()"}
                    ).eq("id", conversation_id).execute()

                    event["conversation_id"] = conversation_id

                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
