-- Migration: 010_create_trial_sessions
-- Description: Add session-based agent trial runtime tables

CREATE TABLE IF NOT EXISTS trial_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'completed', 'failed', 'expired', 'cleaning')),
  runtime_type VARCHAR(20) NOT NULL DEFAULT 'prompt'
    CHECK (runtime_type IN ('prompt', 'container', 'vm')),

  sandbox_ref TEXT,
  workspace_path TEXT,
  expires_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trial_sessions_user ON trial_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_sessions_agent ON trial_sessions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_sessions_status ON trial_sessions(status, expires_at);

CREATE TABLE IF NOT EXISTS trial_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trial_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  usage_prompt_tokens INTEGER,
  usage_completion_tokens INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trial_session_messages_session
  ON trial_session_messages(session_id, created_at ASC);

CREATE TRIGGER update_trial_sessions_updated_at
BEFORE UPDATE ON trial_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
