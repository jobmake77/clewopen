-- Migration 013: Agent publish job queue

CREATE TABLE IF NOT EXISTS agent_publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  queued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_publish_jobs_agent
  ON agent_publish_jobs(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_publish_jobs_status
  ON agent_publish_jobs(status, queued_at ASC);

CREATE TRIGGER update_agent_publish_jobs_updated_at
BEFORE UPDATE ON agent_publish_jobs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
