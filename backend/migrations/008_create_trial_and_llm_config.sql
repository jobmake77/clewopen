-- Migration 008: Create agent_trials and llm_configs tables for Agent trial sandbox

CREATE TABLE IF NOT EXISTS agent_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  message_content TEXT NOT NULL,
  response_content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_trials_user_agent ON agent_trials(user_id, agent_id);

CREATE TABLE IF NOT EXISTS llm_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(100) NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  max_tokens INTEGER DEFAULT 1024,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
