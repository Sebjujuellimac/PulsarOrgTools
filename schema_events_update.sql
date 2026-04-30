-- ============================================================
-- PULSAR ORG TOOLS — Events table update
-- Run in Supabase SQL Editor to add time/location columns
-- ============================================================

alter table events
  add column if not exists scheduled_start_time  timestamptz,
  add column if not exists scheduled_end_time    timestamptz,
  add column if not exists location              text;
