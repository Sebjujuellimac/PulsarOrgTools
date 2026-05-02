-- ============================================================
-- PULSAR ORG TOOLS — Training Event Automation
-- Run AFTER schema_bot.sql and schema_events_update.sql.
-- Adds voice channel tracking and course linkage so the bot
-- can auto-check-in attendees from voice presence and prompt
-- officers to award certifications on event close.
-- ============================================================

-- The voice channel members must join to be auto-marked attended.
-- NULL = manual /event attend only (current behaviour).
ALTER TABLE events ADD COLUMN IF NOT EXISTS voice_channel_id text;

-- If set, this event teaches a specific course. On close, the bot
-- posts a confirmation prompt in officer_channel_id asking whether
-- to award the cert to all attendees (subject to prereq checks).
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_code text;

-- Where the bot posts the cert confirmation prompt (and any other
-- post-event messages). Captured at event creation time from the
-- channel where /event create was invoked.
ALTER TABLE events ADD COLUMN IF NOT EXISTS officer_channel_id text;
