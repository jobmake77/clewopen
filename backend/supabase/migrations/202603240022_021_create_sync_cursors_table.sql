-- Migration: 021_create_sync_cursors_table
-- Description: Persist Openclaw sync cursor for incremental backfill progress

CREATE TABLE IF NOT EXISTS sync_cursors (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
