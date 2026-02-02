-- Add context_items JSONB column to conversations table
-- Stores full Responses API input format (to_input_list() output) for proper
-- conversation history including tool calls, tool results, and reasoning items.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS context_items JSONB;
