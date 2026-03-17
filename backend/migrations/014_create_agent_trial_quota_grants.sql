-- Migration: 014_create_agent_trial_quota_grants
-- Description: Add admin grants for per-day agent trial quota

CREATE TABLE IF NOT EXISTS agent_trial_quota_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_count INTEGER NOT NULL DEFAULT 3 CHECK (granted_count > 0),
  grant_date DATE NOT NULL DEFAULT (timezone('Asia/Shanghai', now())::date),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_trial_quota_grants_user_agent_date
  ON agent_trial_quota_grants(user_id, agent_id, grant_date);

CREATE INDEX IF NOT EXISTS idx_agent_trial_quota_grants_created_at
  ON agent_trial_quota_grants(created_at DESC);
