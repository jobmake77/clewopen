-- Migration: 009_refactor_skill_mcp_source_model
-- Description: Distinguish uploaded vs external Skill/MCP resources and add visit tracking

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'uploaded'
    CHECK (source_type IN ('uploaded', 'external')),
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30),
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

ALTER TABLE skills
  ALTER COLUMN package_url DROP NOT NULL;

ALTER TABLE mcps
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'uploaded'
    CHECK (source_type IN ('uploaded', 'external')),
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30),
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

ALTER TABLE mcps
  ALTER COLUMN package_url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_source_type ON skills(source_type);
CREATE INDEX IF NOT EXISTS idx_mcps_source_type ON mcps(source_type);
CREATE INDEX IF NOT EXISTS idx_skills_source_platform ON skills(source_platform);
CREATE INDEX IF NOT EXISTS idx_mcps_source_platform ON mcps(source_platform);
CREATE INDEX IF NOT EXISTS idx_skills_source_id ON skills(source_id);
CREATE INDEX IF NOT EXISTS idx_mcps_source_id ON mcps(source_id);

UPDATE skills
SET
  source_type = 'external',
  external_url = package_url,
  source_platform = CASE
    WHEN package_url ILIKE 'https://github.com/openclaw/skills%' THEN 'openclaw'
    WHEN package_url ILIKE 'https://github.com/%' THEN 'github'
    WHEN package_url ILIKE 'http%' THEN 'external'
    ELSE source_platform
  END,
  source_id = CASE
    WHEN source_id IS NOT NULL THEN source_id
    WHEN jsonb_extract_path_text(manifest, 'source') = 'openclaw' THEN
      'openclaw:' || COALESCE(jsonb_extract_path_text(manifest, 'owner'), '') || '/' || COALESCE(jsonb_extract_path_text(manifest, 'slug'), '')
    WHEN jsonb_extract_path_text(manifest, 'full_name') IS NOT NULL THEN
      'github:' || jsonb_extract_path_text(manifest, 'full_name')
    WHEN package_url ILIKE 'http%' THEN 'external:' || slug
    ELSE NULL
  END,
  last_synced_at = COALESCE(last_synced_at, updated_at, created_at),
  package_url = NULL
WHERE package_url ILIKE 'http%';

UPDATE skills
SET
  source_type = 'uploaded',
  source_platform = COALESCE(source_platform, 'manual'),
  source_id = COALESCE(source_id, 'uploaded:' || slug)
WHERE package_url IS NOT NULL
  AND package_url NOT ILIKE 'http%';

UPDATE mcps
SET
  source_type = 'external',
  external_url = package_url,
  source_platform = CASE
    WHEN package_url ILIKE 'https://github.com/%' THEN 'github'
    WHEN package_url ILIKE 'http%' THEN 'external'
    ELSE source_platform
  END,
  source_id = CASE
    WHEN source_id IS NOT NULL THEN source_id
    WHEN jsonb_extract_path_text(manifest, 'full_name') IS NOT NULL THEN
      'github:' || jsonb_extract_path_text(manifest, 'full_name')
    WHEN package_url ILIKE 'http%' THEN 'external:' || slug
    ELSE NULL
  END,
  last_synced_at = COALESCE(last_synced_at, updated_at, created_at),
  package_url = NULL
WHERE package_url ILIKE 'http%';

UPDATE mcps
SET
  source_type = 'uploaded',
  source_platform = COALESCE(source_platform, 'manual'),
  source_id = COALESCE(source_id, 'uploaded:' || slug)
WHERE package_url IS NOT NULL
  AND package_url NOT ILIKE 'http%';

CREATE TABLE IF NOT EXISTS resource_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL,
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('skill', 'mcp')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('uploaded', 'external')),
  ip_address INET,
  user_agent TEXT,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_visits_resource
  ON resource_visits(resource_type, resource_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_resource_visits_user
  ON resource_visits(user_id, visited_at DESC);
