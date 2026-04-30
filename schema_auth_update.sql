-- ============================================================
-- PULSAR ORG TOOLS — Auth / Officer schema update
-- Run in Supabase SQL Editor
-- ============================================================

-- Add officer flag + avatar to members
alter table members
  add column if not exists is_officer    boolean not null default false,
  add column if not exists discord_avatar text;

-- Org config table (key-value store for settings like admin_password)
create table if not exists org_config (
  key    text primary key,
  value  text not null
);

alter table org_config enable row level security;

drop policy if exists "public read"  on org_config;
drop policy if exists "public write" on org_config;

-- Public can read config (needed for client-side admin password check)
-- Tighten this when proper auth is fully enforced
create policy "public read"  on org_config for select using (true);
create policy "public write" on org_config for all    using (true);

-- Seed a default admin password — CHANGE THIS before going live
insert into org_config (key, value)
values ('admin_password', 'changeme123')
on conflict (key) do nothing;
