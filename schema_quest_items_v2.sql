-- ============================================================
-- PULSAR ORG TOOLS — Quest Item Categories (v2)
-- Run AFTER schema_quest_types.sql.
-- Extends item quests to support component and material deposits
-- in addition to loot items. Adds item_cat and category-specific
-- criteria columns.
-- ============================================================

-- Which inventory category the deposit targets
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_cat text DEFAULT 'wikelo';

-- ── Component deposit criteria ───────────────────────────────
-- All optional — leave blank to accept any value in that field
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_comp_function text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_comp_class    text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_comp_grade    text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_comp_size     text;
-- item_qty from schema_quest_types.sql covers quantity for all cats

-- ── Material deposit criteria ────────────────────────────────
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_mat_type        text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS item_mat_min_quality int DEFAULT 1;
-- item_qty covers cSCU quantity
