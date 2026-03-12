-- Migration 007: Remove pricing and orders system
-- The platform is open-source; only CustomOrder involves money.

DROP TABLE IF EXISTS orders;

ALTER TABLE agents DROP COLUMN IF EXISTS price_type,
  DROP COLUMN IF EXISTS price_amount,
  DROP COLUMN IF EXISTS price_currency,
  DROP COLUMN IF EXISTS billing_period;

ALTER TABLE skills DROP COLUMN IF EXISTS price_type,
  DROP COLUMN IF EXISTS price_amount,
  DROP COLUMN IF EXISTS price_currency,
  DROP COLUMN IF EXISTS billing_period;

ALTER TABLE mcps DROP COLUMN IF EXISTS price_type,
  DROP COLUMN IF EXISTS price_amount,
  DROP COLUMN IF EXISTS price_currency,
  DROP COLUMN IF EXISTS billing_period;
