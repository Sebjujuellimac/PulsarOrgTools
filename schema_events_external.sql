-- ============================================================
-- PULSAR ORG TOOLS — External Event Sources
-- Run AFTER schema_bot.sql and schema_events_update.sql.
-- Adds source tracking to events for auto-synced entries
-- from YouTube and Twitch. Org events remain source = 'org'.
-- ============================================================

-- Which system created this event: 'org', 'youtube', 'twitch'
ALTER TABLE events ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'org';

-- External unique ID for deduplication (e.g. 'yt:dQw4w9WgXcQ', 'twitch:seg-abc123')
-- NULL for org-created events. Unique constraint prevents duplicate syncs.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_id  text UNIQUE;

-- Link to the original content (YouTube video URL, Twitch channel URL)
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;

-- Index for fast source filtering in the calendar
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
