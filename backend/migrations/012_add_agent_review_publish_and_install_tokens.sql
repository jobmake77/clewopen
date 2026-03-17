-- Migration 012: Agent review workflow + publish metadata + controlled install tokens

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS review_stage VARCHAR(30) NOT NULL DEFAULT 'pending_auto'
    CHECK (review_stage IN ('draft', 'pending_auto', 'pending_manual', 'approved', 'rejected', 'published')),
  ADD COLUMN IF NOT EXISTS auto_review_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publish_mode VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (publish_mode IN ('open', 'commercial')),
  ADD COLUMN IF NOT EXISTS publish_status VARCHAR(30) NOT NULL DEFAULT 'not_published'
    CHECK (publish_status IN ('not_published', 'queued', 'published', 'failed')),
  ADD COLUMN IF NOT EXISTS package_registry VARCHAR(30) NOT NULL DEFAULT 'none'
    CHECK (package_registry IN ('none', 'npm-public', 'npm-private', 'github-packages', 'custom')),
  ADD COLUMN IF NOT EXISTS package_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS repository_url TEXT,
  ADD COLUMN IF NOT EXISTS install_hint TEXT,
  ADD COLUMN IF NOT EXISTS last_published_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_agents_review_stage ON agents(review_stage);
CREATE INDEX IF NOT EXISTS idx_agents_publish_status ON agents(publish_status);
CREATE INDEX IF NOT EXISTS idx_agents_publish_mode ON agents(publish_mode);

CREATE TABLE IF NOT EXISTS agent_install_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  issued_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  publish_mode VARCHAR(20) NOT NULL CHECK (publish_mode IN ('open', 'commercial')),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_install_tokens_agent
  ON agent_install_tokens(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_install_tokens_user
  ON agent_install_tokens(issued_to_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_install_tokens_expires
  ON agent_install_tokens(expires_at);
