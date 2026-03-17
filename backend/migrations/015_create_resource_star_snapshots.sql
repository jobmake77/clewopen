-- Migration: 015_create_resource_star_snapshots
-- Description: Track daily star snapshots for skill/mcp 7-day growth ranking

CREATE TABLE IF NOT EXISTS resource_star_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('skill', 'mcp')),
  resource_id UUID NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type, resource_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_resource_star_snapshots_type_date
  ON resource_star_snapshots(resource_type, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_resource_star_snapshots_resource
  ON resource_star_snapshots(resource_id, resource_type, snapshot_date DESC);
