-- Migration: 018_create_custom_order_artifact_install_tokens
-- Description: issue short-lived install tokens for custom order artifact downloads.

CREATE TABLE IF NOT EXISTS custom_order_artifact_install_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES custom_order_submissions(id) ON DELETE CASCADE,
  artifact_id UUID NOT NULL REFERENCES custom_order_artifacts(id) ON DELETE CASCADE,
  issued_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_order_artifact_install_tokens_submission
  ON custom_order_artifact_install_tokens(submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_order_artifact_install_tokens_expiry
  ON custom_order_artifact_install_tokens(expires_at);
