import json
import logging
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

    # Load conversation context: prefer context_items (full Responses API format)
    # over plain role+content history
    conv_data = (
        supabase.table("conversations")
        .select("context_items")
        .eq("id", conversation_id)
        .single()
        .execute()
    )
    saved_context_items = conv_data.data.get("context_items") if conv_data.data else None

    # Fallback: plain history if no context_items saved yet
    history = None
    if not saved_context_items:
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
        # Collect activity items for persistence (mirrors frontend logic)
        activity_items: list[dict] = []
        current_text = ""
        seq = 0

        def _flush_text():
            """Flush accumulated text into a TextActivityItem."""
            nonlocal current_text, seq
            if current_text:
                seq += 1
                activity_items.append({
                    "kind": "text",
                    "sequence": seq,
                    "content": current_text,
                })
                current_text = ""

        try:
            async for event in agent_service.stream_chat(
                user_id=user["clerk_id"],
                refresh_token=refresh_token,
                message=body.message,
                property_id=body.property_id,
                conversation_history=history,
                context_items=saved_context_items,
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

                # Intercept internal _context_items — save to DB, don't send to client
                if event["type"] == "_context_items":
                    try:
                        supabase.table("conversations").update(
                            {"context_items": event["items"]}
                        ).eq("id", conversation_id).execute()
                    except Exception as e:
                        logging.getLogger(__name__).warning(
                            f"Failed to save context_items: {e}"
                        )
                    continue

                # --- Collect activity items (mirrors frontend useChat logic) ---
                if event["type"] == "text_delta":
                    full_response += event.get("content", "")
                    current_text += event.get("content", "")
                elif event["type"] == "response_created":
                    _flush_text()
                elif event["type"] == "tool_call":
                    _flush_text()
                    tool_calls_data.append(event)
                    seq += 1
                    activity_items.append({
                        "kind": "tool",
                        "sequence": seq,
                        "name": event.get("name", "unknown"),
                        "call_id": event.get("call_id"),
                        "arguments": event.get("arguments"),
                    })
                elif event["type"] == "tool_result":
                    # Update matching tool activity item
                    call_id = event.get("call_id")
                    for item in reversed(activity_items):
                        if (
                            item["kind"] == "tool"
                            and item.get("call_id") == call_id
                            and "output" not in item
                        ):
                            item["output"] = event.get("output", "(completed)")
                            break
                elif event["type"] == "reasoning":
                    _flush_text()
                    seq += 1
                    activity_items.append({
                        "kind": "reasoning",
                        "sequence": seq,
                        "content": event.get("content", ""),
                    })
                elif event["type"] == "chart":
                    _flush_text()
                    seq += 1
                    activity_items.append({
                        "kind": "chart",
                        "sequence": seq,
                        "spec": event.get("spec"),
                    })
                elif event["type"] == "ask_user":
                    _flush_text()
                    seq += 1
                    activity_items.append({
                        "kind": "ask_user",
                        "sequence": seq,
                        "groupId": event.get("group_id"),
                        "questions": event.get("questions"),
                    })
                elif event["type"] == "done":
                    _flush_text()

                    # Mark any unfinished tools as completed
                    for item in activity_items:
                        if item["kind"] == "tool" and "output" not in item:
                            item["output"] = "(completed)"

                    # Save assistant response with activity items
                    if full_response or activity_items:
                        msg_data = {
                            "conversation_id": conversation_id,
                            "role": "assistant",
                            "content": full_response or "",
                        }
                        if tool_calls_data:
                            msg_data["tool_calls"] = json.loads(
                                json.dumps(tool_calls_data)
                            )
                        if activity_items:
                            msg_data["activity_items"] = activity_items
                        supabase.table("messages").insert(msg_data).execute()

                    # Update conversation timestamp
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
