-- ── Operations (profit-sharing runs) ─────────────────────────────────────────
-- Run this in the Supabase SQL Editor.
-- Tracks mining/salvage/cargo runs, crew splits, and guild bank contributions.
-- aUEC and DKP are intentionally kept separate — no cross-integration.

-- ── Core tables ──────────────────────────────────────────────────────────────

create table if not exists operations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null default 'mining',  -- mining | salvage | cargo | other
  owner_id     text references members(id) on delete set null,
  wallet_fee   numeric not null default 5,       -- % transfer fee deducted from each outgoing payment
  guild_bank_pct numeric not null default 0,     -- % of net taken for guild bank before crew split
  status       text not null default 'active',   -- active | settled | archived
  notes        text,
  created_at   timestamptz default now(),
  settled_at   timestamptz
);

-- Who was on the run
create table if not exists operation_crew (
  id            uuid primary key default gen_random_uuid(),
  operation_id  uuid not null references operations(id) on delete cascade,
  member_id     text references members(id) on delete set null,  -- null = guest
  display_name  text not null,         -- name snapshot (survives member leaving)
  crew_type     text not null default 'share',  -- share | hourly
  hourly_rate   numeric default 0,     -- aUEC/hr, only relevant if hourly
  elapsed_ms    bigint default 0,      -- tracked time in milliseconds
  is_owner      boolean default false, -- owns the wallet for this run
  display_order int default 0
);

-- Refinery jobs within a run
create table if not exists operation_jobs (
  id              uuid primary key default gen_random_uuid(),
  operation_id    uuid not null references operations(id) on delete cascade,
  location        text,
  refinery_cost   numeric default 0,
  payer_name      text,                -- display_name of crew member holding funds
  timer_end       timestamptz,         -- absolute end time (survives refresh)
  timer_total_ms  bigint default 0,
  timer_done      boolean default false,
  display_order   int default 0
);

-- Items within a refinery job
create table if not exists operation_items (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references operation_jobs(id) on delete cascade,
  name          text not null,
  qty_cscu      int default 0,         -- quantity in cSCU (centri-SCU)
  value_score   int,                   -- /999 purity score, null = unknown
  status        text default 'pending', -- pending | refining | sold
  sell_price    numeric default 0,     -- actual aUEC total received when sold
  display_order int default 0
);

-- ── Guild bank ledger ─────────────────────────────────────────────────────────
-- Each settled operation writes one entry here.
-- Balance = SUM(amount) across all entries.

create table if not exists guild_bank_ledger (
  id            uuid primary key default gen_random_uuid(),
  operation_id  uuid references operations(id) on delete set null,
  amount        numeric not null,      -- aUEC deposited
  pct_used      numeric,              -- guild_bank_pct that was in effect
  recorded_by   text references members(id) on delete set null,
  notes         text,
  created_at    timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_operations_status      on operations(status);
create index if not exists idx_operations_created_at  on operations(created_at desc);
create index if not exists idx_op_crew_operation      on operation_crew(operation_id);
create index if not exists idx_op_jobs_operation      on operation_jobs(operation_id);
create index if not exists idx_op_items_job           on operation_items(job_id);
create index if not exists idx_guild_bank_created_at  on guild_bank_ledger(created_at desc);

-- ── RLS policies ─────────────────────────────────────────────────────────────

alter table operations          enable row level security;
alter table operation_crew      enable row level security;
alter table operation_jobs      enable row level security;
alter table operation_items     enable row level security;
alter table guild_bank_ledger   enable row level security;

-- All authenticated members can read operations
create policy "read operations"     on operations       for select using (auth.role() = 'authenticated');
create policy "read op crew"        on operation_crew   for select using (auth.role() = 'authenticated');
create policy "read op jobs"        on operation_jobs   for select using (auth.role() = 'authenticated');
create policy "read op items"       on operation_items  for select using (auth.role() = 'authenticated');
create policy "read guild bank"     on guild_bank_ledger for select using (auth.role() = 'authenticated');

-- Officers can create and manage operations
create policy "officer insert operations"   on operations       for insert with check (is_officer());
create policy "officer update operations"   on operations       for update using (is_officer());
create policy "officer delete operations"   on operations       for delete using (is_officer());

create policy "officer insert op crew"      on operation_crew   for insert with check (is_officer());
create policy "officer update op crew"      on operation_crew   for update using (is_officer());
create policy "officer delete op crew"      on operation_crew   for delete using (is_officer());

create policy "officer insert op jobs"      on operation_jobs   for insert with check (is_officer());
create policy "officer update op jobs"      on operation_jobs   for update using (is_officer());
create policy "officer delete op jobs"      on operation_jobs   for delete using (is_officer());

create policy "officer insert op items"     on operation_items  for insert with check (is_officer());
create policy "officer update op items"     on operation_items  for update using (is_officer());
create policy "officer delete op items"     on operation_items  for delete using (is_officer());

create policy "officer insert guild bank"   on guild_bank_ledger for insert with check (is_officer());

-- ── Guild bank running balance helper ────────────────────────────────────────
-- Convenience view — dashboard reads this instead of summing manually.

create or replace view guild_bank_balance as
  select coalesce(sum(amount), 0)::numeric as balance
  from guild_bank_ledger;
