-- ── RSI Account Linking ──────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor.

ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_handle          text UNIQUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_verified        boolean NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_verify_token    text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_verify_expires  timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_citizen_number  text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_avatar_url      text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_enlisted        text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_org_rank        text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS rsi_last_synced     timestamptz;

-- Fast lookup by handle (e.g. /rsi whois, duplicate check)
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_rsi_handle
  ON members (lower(rsi_handle))
  WHERE rsi_handle IS NOT NULL;
