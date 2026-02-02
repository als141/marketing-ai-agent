// --- Activity Timeline (unified reasoning + tool call ordering) ---

export interface ReasoningActivityItem {
  id: string;
  kind: "reasoning";
  sequence: number;
  content: string;
}

export interface ToolActivityItem {
  id: string;
  kind: "tool";
  sequence: number;
  name: string;
  call_id?: string;
  arguments?: string;
  output?: string; // undefined=実行中, string=完了
}

export interface AskUserQuestionItem {
  id: string;
  question: string;
  type: "choice" | "text" | "confirm";
  options: string[];
}

export interface AskUserActivityItem {
  id: string;
  kind: "ask_user";
  sequence: number;
  groupId: string;
  questions: AskUserQuestionItem[];
  responses?: Record<string, string>; // {question_id: answer}, undefined=待機中
}

export type ActivityItem =
  | ReasoningActivityItem
  | ToolActivityItem
  | AskUserActivityItem;

// --- Message ---

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  activityItems?: ActivityItem[];
  // backward compat (DB保存用)
  toolCalls?: ToolCall[];
  reasoningMessages?: string[];
  isStreaming?: boolean;
}

export interface ToolCall {
  type: string;
  name: string;
  call_id?: string;
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
    | "reasoning"
    | "ask_user"
    | "done"
    | "error"
    | "response_created";
  content?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
  message?: string;
  conversation_id?: string;
  has_summary?: boolean;
  // ask_user fields (structured multi-question)
  group_id?: string;
  questions?: AskUserQuestionItem[];
}

export interface PendingQuestionGroup {
  groupId: string;
  questions: AskUserQuestionItem[];
}
