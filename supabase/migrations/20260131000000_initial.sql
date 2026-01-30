-- GA4 OAuth AI Agent - Supabase Schema
-- Run this in Supabase SQL Editor

-- Users table (synced from Clerk)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT,
  google_connected BOOLEAN DEFAULT FALSE,
  google_refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User GA4 properties
CREATE TABLE IF NOT EXISTS user_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,
  property_name TEXT,
  account_name TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT,
  title TEXT DEFAULT '新しい会話',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_user_id ON user_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Backend uses service_role key which bypasses RLS
-- These policies are for direct Supabase client access from frontend (if needed)

-- Users: only access own record
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- User properties: only access own
CREATE POLICY "user_properties_select_own" ON user_properties
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  );

-- Conversations: only access own
CREATE POLICY "conversations_select_own" ON conversations
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  );

CREATE POLICY "conversations_insert_own" ON conversations
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  );

CREATE POLICY "conversations_delete_own" ON conversations
  FOR DELETE USING (
    user_id IN (SELECT id FROM users WHERE clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  );

-- Messages: only access via own conversations
CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN users u ON c.user_id = u.id
      WHERE u.clerk_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );
