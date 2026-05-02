-- ── Cert write access for officers via the web dashboard ─────────────────────
-- Run in Supabase SQL Editor.
-- Officers can award and revoke certifications from the dashboard member modal.

drop policy if exists "officer insert" on certifications;
drop policy if exists "officer delete" on certifications;

create policy "officer insert"
  on certifications for insert
  with check (is_officer());

create policy "officer delete"
  on certifications for delete
  using (is_officer());
