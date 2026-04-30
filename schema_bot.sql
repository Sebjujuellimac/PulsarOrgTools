-- ============================================================
-- PULSAR ORG TOOLS — Bot Schema Extension
-- Paste into Supabase SQL Editor and run AFTER schema.sql
-- (or run standalone — these tables are independent)
-- Project ref: njsmomshevbigaxmjvmj
-- ============================================================

-- Enable UUID extension (safe to repeat)
create extension if not exists "uuid-ossp";

-- ============================================================
-- MEMBERS
-- Discord user records. id = Discord user snowflake (text).
-- ============================================================
create table if not exists members (
  id            text primary key,               -- Discord user ID (snowflake)
  username      text not null,
  display_name  text,
  dkp_balance   integer not null default 0,
  joined_at     timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- EVENTS
-- Org events (training sessions, ops, mining fleets, etc.)
-- Optionally linked to a Discord Scheduled Event by ID.
-- ============================================================
create table if not exists events (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null,
  description       text,
  dkp_reward        integer not null default 0,
  status            text not null default 'open',   -- open, closed
  discord_event_id  text unique,                     -- Discord Scheduled Event ID
  created_by        text,                            -- Discord user ID of creator
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- ATTENDANCE
-- One row per member per event. attended = true when confirmed.
-- ============================================================
create table if not exists attendance (
  id         uuid primary key default uuid_generate_v4(),
  event_id   uuid not null references events(id) on delete cascade,
  member_id  text not null references members(id) on delete cascade,
  attended   boolean not null default false,
  marked_at  timestamptz default now(),
  unique(event_id, member_id)
);

-- ============================================================
-- QUESTS
-- Must come before dkp_transactions (which references it).
-- ============================================================
create table if not exists quests (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  dkp_reward  integer not null default 0,
  status      text not null default 'open',         -- open, completed, closed
  created_by  text,                                  -- Discord user ID
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- DKP TRANSACTIONS
-- Immutable ledger of every DKP award or deduction.
-- ============================================================
create table if not exists dkp_transactions (
  id          uuid primary key default uuid_generate_v4(),
  member_id   text not null references members(id) on delete cascade,
  amount      integer not null,                    -- positive = award, negative = deduct
  reason      text not null,
  event_id    uuid references events(id),
  quest_id    uuid references quests(id),
  awarded_by  text,                                -- Discord user ID of officer
  created_at  timestamptz default now()
);

-- ============================================================
-- QUEST COMPLETIONS
-- Records who completed a quest (for history/audit).
-- ============================================================
create table if not exists quest_completions (
  id           uuid primary key default uuid_generate_v4(),
  quest_id     uuid not null references quests(id) on delete cascade,
  member_id    text not null references members(id) on delete cascade,
  notes        text,
  completed_by text,                                 -- officer who marked it
  completed_at timestamptz default now()
);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists members_updated_at  on members;
drop trigger if exists events_updated_at   on events;
drop trigger if exists quests_updated_at   on quests;

create trigger members_updated_at  before update on members  for each row execute function update_updated_at();
create trigger events_updated_at   before update on events   for each row execute function update_updated_at();
create trigger quests_updated_at   before update on quests   for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table members           enable row level security;
alter table events            enable row level security;
alter table attendance        enable row level security;
alter table dkp_transactions  enable row level security;
alter table quests            enable row level security;
alter table quest_completions enable row level security;

drop policy if exists "public read"  on members;
drop policy if exists "public write" on members;
drop policy if exists "public read"  on events;
drop policy if exists "public write" on events;
drop policy if exists "public read"  on attendance;
drop policy if exists "public write" on attendance;
drop policy if exists "public read"  on dkp_transactions;
drop policy if exists "public write" on dkp_transactions;
drop policy if exists "public read"  on quests;
drop policy if exists "public write" on quests;
drop policy if exists "public read"  on quest_completions;
drop policy if exists "public write" on quest_completions;

create policy "public read"  on members           for select using (true);
create policy "public write" on members           for all    using (true);
create policy "public read"  on events            for select using (true);
create policy "public write" on events            for all    using (true);
create policy "public read"  on attendance        for select using (true);
create policy "public write" on attendance        for all    using (true);
create policy "public read"  on dkp_transactions  for select using (true);
create policy "public write" on dkp_transactions  for all    using (true);
create policy "public read"  on quests            for select using (true);
create policy "public write" on quests            for all    using (true);
create policy "public read"  on quest_completions for select using (true);
create policy "public write" on quest_completions for all    using (true);
