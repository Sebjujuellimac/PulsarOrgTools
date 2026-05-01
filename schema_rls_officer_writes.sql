-- ============================================================
-- PULSAR ORG TOOLS — Officer Write Policies
-- Run AFTER schema_rls.sql.
-- Grants Discord-authenticated officers the ability to approve
-- quest turn-ins from the web dashboard (anon key).
-- ============================================================

-- ── MEMBERS: officers can update any member's DKP balance ────────────────────
-- The base RLS only allows self-update. Officers need to credit any member.
drop policy if exists "officer update any" on members;
create policy "officer update any"
  on members for update
  using (is_officer());

-- ── DKP TRANSACTIONS: officers can insert award records ──────────────────────
-- Currently read-only from the web. Officers need to log DKP awards.
drop policy if exists "officer insert" on dkp_transactions;
create policy "officer insert"
  on dkp_transactions for insert
  with check (is_officer());

-- ── QUEST COMPLETIONS: officers can record completions ───────────────────────
-- Currently read-only from the web. Officers need to mark quests done.
drop policy if exists "officer insert" on quest_completions;
create policy "officer insert"
  on quest_completions for insert
  with check (is_officer());

-- ── QUEST SUBMISSIONS: officers can delete (approve/deny clears the row) ─────
-- The public insert policy already exists (anyone can submit a turn-in).
-- Officers need to remove submissions once they've been processed.
drop policy if exists "officer delete" on quest_submissions;
create policy "officer delete"
  on quest_submissions for delete
  using (is_officer());
