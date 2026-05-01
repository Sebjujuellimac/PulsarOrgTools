-- ============================================================
-- PULSAR ORG TOOLS — Loot Marketplace Schema
-- Run AFTER schema_inventory.sql and schema_rls.sql.
-- Adds listing/auction columns to wikelo_items and a policy
-- that lets authenticated members record their own DKP spends.
-- ============================================================

-- ── Add listing columns to wikelo_items ──────────────────────────────────────
-- listing_type: 'none' | 'sale' | 'auction' | 'sold'
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS listing_type      text    DEFAULT 'none';
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS listing_price_dkp int;
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS auction_min_bid   int;
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS auction_current_bid int   DEFAULT 0;
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS auction_bidder_name text;
ALTER TABLE wikelo_items ADD COLUMN IF NOT EXISTS auction_end       timestamptz;

-- ── Allow members to record their own DKP expenditures ───────────────────────
-- Negative amounts only — members can't award themselves DKP this way.
-- Positive awards go through the bot (service role) or officer approval flow.
DROP POLICY IF EXISTS "member spend" ON dkp_transactions;
CREATE POLICY "member spend" ON dkp_transactions
  FOR INSERT
  WITH CHECK (
    member_id = get_discord_id()
    AND amount < 0
  );
