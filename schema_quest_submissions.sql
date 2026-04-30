-- ============================================================
-- PULSAR ORG TOOLS — Quest Submissions
-- Allows members to submit quest turn-ins from the web dashboard.
-- Officers confirm and award DKP via the Discord bot.
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists quest_submissions (
  id           uuid primary key default uuid_generate_v4(),
  quest_id     uuid not null references quests(id) on delete cascade,
  member_id    text not null references members(id) on delete cascade,
  notes        text,
  submitted_at timestamptz default now()
);

alter table quest_submissions enable row level security;

drop policy if exists "public read"  on quest_submissions;
drop policy if exists "public write" on quest_submissions;

create policy "public read"  on quest_submissions for select using (true);
create policy "public write" on quest_submissions for all    using (true);
