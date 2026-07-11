-- ============================================================
-- PULSAR ORG TOOLS — Make event deletion safe
-- Run in Supabase SQL Editor (after schema_events_rls_officer.sql).
--
-- Deleting an event must not be blocked by, or silently corrupt,
-- rows that reference it:
--   • attendance          → already ON DELETE CASCADE (schema_bot.sql)
--   • dkp_transactions     → preserve the ledger, just null the event link
--   • attendance_log       → cascade delete the raw join/leave rows
-- ============================================================

-- ── dkp_transactions: keep the payout record, drop the event link ────────────
-- The ledger is immutable history; we don't want to delete award rows when an
-- event is removed, but we do need the FK to stop blocking the delete.
alter table dkp_transactions
  drop constraint if exists dkp_transactions_event_id_fkey;

alter table dkp_transactions
  add constraint dkp_transactions_event_id_fkey
  foreign key (event_id) references events(id) on delete set null;

-- ── attendance_log: cascade delete raw timeline rows with the event ──────────
-- Table is created outside the tracked schema files (used by voiceTracker.js).
-- Only touch it if it exists; add or fix the FK to cascade.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'attendance_log') then

    -- Drop any existing FK on event_id (name may vary), then re-add with cascade.
    if exists (select 1 from information_schema.table_constraints
               where table_schema = 'public'
                 and table_name = 'attendance_log'
                 and constraint_name = 'attendance_log_event_id_fkey') then
      alter table attendance_log drop constraint attendance_log_event_id_fkey;
    end if;

    alter table attendance_log
      add constraint attendance_log_event_id_fkey
      foreign key (event_id) references events(id) on delete cascade;
  end if;
end $$;
