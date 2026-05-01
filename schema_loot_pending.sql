-- ============================================================
-- PULSAR ORG TOOLS — Loot Pending Transactions
-- Run AFTER schema_loot.sql.
-- Holds buy/bid submissions awaiting officer approval.
-- Officers approve (collect DKP, mark sold) or deny (revert listing).
-- ============================================================

CREATE TABLE IF NOT EXISTS loot_pending (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id       uuid        NOT NULL,
  member_id     text        NOT NULL,
  member_name   text        NOT NULL,
  type          text        NOT NULL, -- 'purchase' | 'bid'
  amount        int         NOT NULL,
  item_name     text        NOT NULL,
  submitted_at  timestamptz DEFAULT now()
);

ALTER TABLE loot_pending ENABLE ROW LEVEL SECURITY;

-- Anyone can read pending records (officers need to see all)
DROP POLICY IF EXISTS "public read"    ON loot_pending;
CREATE POLICY "public read"    ON loot_pending FOR SELECT USING (true);

-- Authenticated members can submit their own pending records
DROP POLICY IF EXISTS "member insert"  ON loot_pending;
CREATE POLICY "member insert"  ON loot_pending FOR INSERT
  WITH CHECK (member_id = get_discord_id());

-- Officers can delete (approve or deny clears the row)
DROP POLICY IF EXISTS "officer delete" ON loot_pending;
CREATE POLICY "officer delete" ON loot_pending FOR DELETE
  USING (is_officer());
