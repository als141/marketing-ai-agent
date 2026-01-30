export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  type: string;
  name: string;
  arguments?: string;
  output?: string;
}

export interface Conversation {
  id: string;
  title: string;
  property_id: string | null;
  created_at: string;
  updated_at: string;
  messages?: MessageRecord[];
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: unknown | null;
  created_at: string;
}

export interface PropertySummary {
  property_id: string;
  property_name: string;
  account_name: string;
}

export interface GoogleAuthStatus {
  connected: boolean;
  email?: string;
}

export interface StreamEvent {
  type:
    | "text_delta"
    | "tool_call"
    | "tool_result"
    | "done"
    | "error"
    | "response_created";
  content?: string;
  name?: string;
  arguments?: string;
  output?: string;
  message?: string;
  conversation_id?: string;
}
