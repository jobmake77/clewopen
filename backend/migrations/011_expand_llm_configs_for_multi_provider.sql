-- Migration 011: Expand llm_configs for production-ready multi-provider routing

ALTER TABLE llm_configs
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '["chat","trial"]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_health_status VARCHAR(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_checked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_health_error TEXT,
  ADD COLUMN IF NOT EXISTS auth_type VARCHAR(30) NOT NULL DEFAULT 'bearer',
  ADD COLUMN IF NOT EXISTS enable_stream BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reasoning_effort VARCHAR(30),
  ADD COLUMN IF NOT EXISTS include_max_completion_tokens BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_max_output_tokens BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_openai_format BOOLEAN NOT NULL DEFAULT true;

UPDATE llm_configs
SET
  role = COALESCE(role, 'trial'),
  priority = COALESCE(priority, 100),
  is_enabled = COALESCE(is_enabled, true),
  capabilities = COALESCE(capabilities, '["chat","trial"]'::jsonb),
  metadata = COALESCE(metadata, '{}'::jsonb),
  last_health_status = COALESCE(last_health_status, 'unknown'),
  auth_type = COALESCE(auth_type, CASE
    WHEN provider_name ILIKE 'anthropic' THEN 'x-api-key'
    ELSE 'bearer'
  END),
  enable_stream = COALESCE(enable_stream, false),
  include_max_completion_tokens = COALESCE(include_max_completion_tokens, false),
  include_max_output_tokens = COALESCE(include_max_output_tokens, false),
  legacy_openai_format = COALESCE(legacy_openai_format, true);

CREATE INDEX IF NOT EXISTS idx_llm_configs_role_enabled_priority
  ON llm_configs(role, is_enabled, is_active DESC, priority ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_configs_health_status
  ON llm_configs(last_health_status, last_health_checked_at DESC);
