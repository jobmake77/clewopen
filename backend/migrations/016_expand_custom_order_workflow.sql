-- Migration: 016_expand_custom_order_workflow
-- Description: Expand custom order lifecycle for collaboration, acceptance and dispute without payment.

-- Expand custom order status set
ALTER TABLE custom_orders
  DROP CONSTRAINT IF EXISTS custom_orders_status_check;

ALTER TABLE custom_orders
  ADD CONSTRAINT custom_orders_status_check
  CHECK (status IN (
    'open',
    'in_progress',
    'awaiting_acceptance',
    'accepted',
    'disputed',
    'completed',
    'cancelled',
    'closed'
  ));

ALTER TABLE custom_orders
  ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS custom_order_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  package_url TEXT,
  version_label VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'rejected', 'superseded')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_order_submissions_order
  ON custom_order_submissions(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_order_submissions_developer
  ON custom_order_submissions(developer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS custom_order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('buyer', 'developer', 'admin', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_order_messages_order
  ON custom_order_messages(order_id, created_at ASC);

CREATE TABLE IF NOT EXISTS custom_order_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'resolved_buyer', 'resolved_developer', 'rejected')),
  resolution TEXT,
  resolver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_order_disputes_order
  ON custom_order_disputes(order_id, created_at DESC);

CREATE TRIGGER update_custom_order_submissions_updated_at
BEFORE UPDATE ON custom_order_submissions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_order_disputes_updated_at
BEFORE UPDATE ON custom_order_disputes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
