-- Migration: 019_create_agent_install_events
-- Description: Track user install feedback and history for agent install flow.

CREATE TABLE IF NOT EXISTS agent_install_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (mode IN ('full', 'enhance', 'custom')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  included_files TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'agent_detail_modal',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_install_events_user_agent_created
  ON agent_install_events(user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_install_events_agent_created
  ON agent_install_events(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_install_events_status
  ON agent_install_events(status, created_at DESC);
