-- ============================================================
-- PULSAR ORG TOOLS — Quest Types
-- Run AFTER schema_bot.sql.
-- Adds quest_type ('action' | 'item') plus per-type metadata.
-- Action quests carry faction/location/goal.
-- Item quests carry the item spec that gets created on approval.
-- ============================================================

-- Quest type — default existing quests to 'action'
ALTER TABLE quests ADD COLUMN IF NOT EXISTS quest_type text DEFAULT 'action';

-- ── Action quest fields ──────────────────────────────────────
ALTER TABLE quests ADD COLUMN IF NOT EXISTS faction  text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS goal     text;

-- ── Item quest fields ────────────────────────────────────────
-- When approved, an entry is inserted into wikelo_items
-- using these values. listing_price_dkp only used when
-- item_listing_type = 'sale'.
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_name         text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_wk_type      text DEFAULT 'favor';
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_qty          int  DEFAULT 1;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_dkp          int  DEFAULT 0;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_listing_type text DEFAULT 'none';
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_listing_price int;
