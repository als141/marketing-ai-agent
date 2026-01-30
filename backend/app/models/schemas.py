from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    property_id: str


class PropertySelectRequest(BaseModel):
    property_id: str
    property_name: str
    account_name: str


class ConversationCreate(BaseModel):
    property_id: Optional[str] = None
    title: Optional[str] = "新しい会話"


class UserInfo(BaseModel):
    clerk_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None


class GoogleAuthStatus(BaseModel):
    connected: bool
    email: Optional[str] = None


class GoogleConnectResponse(BaseModel):
    auth_url: str


class PropertySummary(BaseModel):
    property_id: str
    property_name: str
    account_name: str


class ConversationSummary(BaseModel):
    id: str
    title: str
    property_id: Optional[str] = None
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    tool_calls: Optional[dict] = None
    created_at: str
