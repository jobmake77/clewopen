-- Migration: 017_custom_order_artifacts_github_repo
-- Description: Store custom order submission artifacts in managed GitHub repo, disable external delivery links.

CREATE TABLE IF NOT EXISTS custom_order_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'github' CHECK (storage_provider IN ('github')),
  repository VARCHAR(255) NOT NULL,
  git_path TEXT NOT NULL,
  git_sha VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  manifest JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_order_artifacts_order
  ON custom_order_artifacts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_order_artifacts_dev
  ON custom_order_artifacts(developer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_order_artifacts_sha
  ON custom_order_artifacts(order_id, sha256);

ALTER TABLE custom_order_submissions
  ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES custom_order_artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) NOT NULL DEFAULT 'repo_artifact'
    CHECK (delivery_mode IN ('repo_artifact')),
  ADD COLUMN IF NOT EXISTS parsed_manifest JSONB;

CREATE INDEX IF NOT EXISTS idx_custom_order_submissions_artifact
  ON custom_order_submissions(artifact_id);

CREATE TRIGGER update_custom_order_artifacts_updated_at
BEFORE UPDATE ON custom_order_artifacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
