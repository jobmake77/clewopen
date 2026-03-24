-- Migration: 022_add_email_and_github_auth
-- Description: Add email code login and GitHub OAuth account binding support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) NOT NULL DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS github_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_auth_provider_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_provider_check
      CHECK (auth_provider IN ('password', 'email_code', 'github'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id_unique
  ON users(github_id)
  WHERE github_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_email_login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_ip INET,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_email_codes_lookup
  ON auth_email_login_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_email_codes_cleanup
  ON auth_email_login_codes(expires_at, consumed_at);
