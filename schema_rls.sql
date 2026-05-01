-- ============================================================
-- PULSAR ORG TOOLS — Proper Row Level Security
-- Run AFTER schema_bot.sql, schema_cert.sql, schema_auth_update.sql.
-- The bot now uses the service_role key and bypasses RLS.
-- The web dashboard uses the anon key and is governed by these policies.
-- ============================================================

-- ── Helper: get the authenticated user's Discord ID ───────────────────────────
-- Supabase stores Discord user metadata in the JWT.
create or replace function get_discord_id()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() ->> 'sub'
  );
$$;

-- ── Helper: check if the authenticated user is an officer ─────────────────────
-- Reads is_officer from members table, matched by Discord ID.
-- security definer so it can read members even if members has RLS.
create or replace function is_officer()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from members
    where id = get_discord_id()
    and   is_officer = true
  );
$$;

-- ============================================================
-- MEMBERS
-- Public read. Authenticated users can update their own row only.
-- Inserts and deletes handled by the bot (service role).
-- ============================================================
drop policy if exists "public read"  on members;
drop policy if exists "public write" on members;

create policy "public read"  on members for select using (true);
create policy "self update"  on members for update using (id = get_discord_id());

-- ============================================================
-- EVENTS
-- Public read. Officers can insert/update via the web.
-- Bot handles everything via service role.
-- ============================================================
drop policy if exists "public read"  on events;
drop policy if exists "public write" on events;

create policy "public read"     on events for select using (true);
create policy "officer insert"  on events for insert with check (is_officer());
create policy "officer update"  on events for update using (is_officer());

-- ============================================================
-- ATTENDANCE
-- Public read. Authenticated members can mark their own attendance.
-- ============================================================
drop policy if exists "public read"  on attendance;
drop policy if exists "public write" on attendance;

create policy "public read"   on attendance for select using (true);
create policy "self insert"   on attendance for insert with check (member_id = get_discord_id());
create policy "self update"   on attendance for update using  (member_id = get_discord_id());

-- ============================================================
-- DKP TRANSACTIONS
-- Read only from the web. All writes go through the bot.
-- ============================================================
drop policy if exists "public read"  on dkp_transactions;
drop policy if exists "public write" on dkp_transactions;

create policy "public read" on dkp_transactions for select using (true);

-- ============================================================
-- CERTIFICATIONS
-- Read only from the web. All writes go through the bot.
-- ============================================================
drop policy if exists "public read"  on certifications;
drop policy if exists "public write" on certifications;

create policy "public read" on certifications for select using (true);

-- ============================================================
-- QUESTS
-- Public read. Officers can create and update quests from the web.
-- ============================================================
drop policy if exists "public read"  on quests;
drop policy if exists "public write" on quests;

create policy "public read"    on quests for select using (true);
create policy "officer insert" on quests for insert with check (is_officer());
create policy "officer update" on quests for update using (is_officer());

-- ============================================================
-- QUEST COMPLETIONS
-- Read only from the web. Writes go through the bot.
-- ============================================================
drop policy if exists "public read"  on quest_completions;
drop policy if exists "public write" on quest_completions;

create policy "public read" on quest_completions for select using (true);

-- ============================================================
-- QUEST SUBMISSIONS
-- Public read. Anyone can submit (supports anonymous turn-ins).
-- Officers can update (mark reviewed) via the web.
-- ============================================================
drop policy if exists "public read"  on quest_submissions;
drop policy if exists "public write" on quest_submissions;

create policy "public read"    on quest_submissions for select using (true);
create policy "public insert"  on quest_submissions for insert with check (true);
create policy "officer update" on quest_submissions for update using (is_officer());

-- ============================================================
-- ORG CONFIG
-- Public read (needed for admin password check).
-- No web writes — update via SQL editor or bot only.
-- ============================================================
drop policy if exists "public read"  on org_config;
drop policy if exists "public write" on org_config;

create policy "public read" on org_config for select using (true);

-- ============================================================
-- INVENTORY TABLES
-- Public read. Writes require authentication (any signed-in user).
-- Tighten to is_officer() later if needed.
-- ============================================================
drop policy if exists "public read"  on components;
drop policy if exists "public write" on components;
drop policy if exists "public read"  on materials;
drop policy if exists "public write" on materials;
drop policy if exists "public read"  on blueprints;
drop policy if exists "public write" on blueprints;
drop policy if exists "public read"  on wikelo_items;
drop policy if exists "public write" on wikelo_items;
drop policy if exists "public read"  on wikelo_recipes;
drop policy if exists "public write" on wikelo_recipes;

create policy "public read"  on components     for select using (true);
create policy "auth write"   on components     for all    using (auth.role() = 'authenticated');
create policy "public read"  on materials      for select using (true);
create policy "auth write"   on materials      for all    using (auth.role() = 'authenticated');
create policy "public read"  on blueprints     for select using (true);
create policy "auth write"   on blueprints     for all    using (auth.role() = 'authenticated');
create policy "public read"  on wikelo_items   for select using (true);
create policy "auth write"   on wikelo_items   for all    using (auth.role() = 'authenticated');
create policy "public read"  on wikelo_recipes for select using (true);
create policy "auth write"   on wikelo_recipes for all    using (auth.role() = 'authenticated');
