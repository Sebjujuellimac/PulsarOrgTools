-- ============================================================
-- PULSAR ORG TOOLS — Tighten events INSERT to officers only
-- Run in Supabase SQL Editor.
-- Replaces the original "public write" blanket policy with
-- separate read / officer-insert / officer-update policies.
-- ============================================================

drop policy if exists "public write" on events;

drop policy if exists "officer insert" on events;
drop policy if exists "officer update" on events;

create policy "officer insert" on events for insert with check (is_officer());
create policy "officer update" on events for update using (is_officer());
