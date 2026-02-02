-- Add activity_items JSONB column to messages table
-- Stores the full activity timeline (reasoning, tool calls, charts, text segments, ask_user)
-- for restoring the rich chat UI on page reload.
--
-- Run in Supabase SQL Editor:
ALTER TABLE messages ADD COLUMN IF NOT EXISTS activity_items JSONB;
