-- ============================================================
-- PULSAR ORG TOOLS — Certification Schema
-- Run this in Supabase SQL Editor after schema_bot.sql
-- Project ref: njsmomshevbigaxmjvmj
-- ============================================================

-- ============================================================
-- CERTIFICATIONS
-- One row per member per course they have passed.
-- ============================================================
create table if not exists certifications (
  id           uuid primary key default uuid_generate_v4(),
  member_id    text not null references members(id) on delete cascade,
  course_code  text not null,
  awarded_by   text,                   -- Discord user ID of officer
  notes        text,
  awarded_at   timestamptz default now(),
  unique(member_id, course_code)
);

-- ============================================================
-- RLS
-- ============================================================
alter table certifications enable row level security;

drop policy if exists "public read"  on certifications;
drop policy if exists "public write" on certifications;

create policy "public read"  on certifications for select using (true);
create policy "public write" on certifications for all    using (true);
