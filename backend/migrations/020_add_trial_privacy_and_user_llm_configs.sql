-- Migration: 020_add_trial_privacy_and_user_llm_configs
-- Description: Add user-level BYOK configs and trial access audit records

CREATE TABLE IF NOT EXISTS user_llm_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name VARCHAR(80) NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  auth_type VARCHAR(50) NOT NULL DEFAULT 'bearer',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_llm_configs_user
  ON user_llm_configs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_llm_configs_user_enabled
  ON user_llm_configs(user_id, is_enabled, is_default);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_llm_configs_default_per_user
  ON user_llm_configs(user_id)
  WHERE is_default = true AND is_enabled = true;

CREATE TABLE IF NOT EXISTS trial_data_access_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES trial_sessions(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  viewer_role VARCHAR(30),
  access_type VARCHAR(60) NOT NULL,
  resource_type VARCHAR(60) NOT NULL DEFAULT 'trial_session',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trial_data_access_audits_session
  ON trial_data_access_audits(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trial_data_access_audits_viewer
  ON trial_data_access_audits(viewer_user_id, created_at DESC);

CREATE TRIGGER update_user_llm_configs_updated_at
BEFORE UPDATE ON user_llm_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
