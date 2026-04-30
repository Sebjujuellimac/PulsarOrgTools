import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the Supabase client before importing helpers ─────────────────────────
vi.mock('../db.js', () => ({
  db: { from: vi.fn() },
}));

import { db } from '../db.js';
import { ensureMember, awardDkp } from '../eventHelpers.js';

// ── Builder factory — mimics Supabase's chained API ──────────────────────────

/**
 * Returns a chainable mock that resolves `result` at the terminal call.
 * Terminal calls: .maybeSingle(), .single()
 * Non-terminal calls (select, insert, update, eq, etc.) return `self`.
 */
function makeBuilder(result = { data: null, error: null }) {
  const self = {
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single:      vi.fn().mockResolvedValue(result),
  };
  return self;
}

/**
 * Build a table-keyed set of mock builders.
 * db.from(table) returns the builder for that table.
 * Unmapped tables fall back to a default (no-op) builder.
 */
function mockTables(tableMap) {
  const fallback = makeBuilder();
  db.from.mockImplementation((table) => tableMap[table] ?? fallback);
}

beforeEach(() => vi.clearAllMocks());

// ── ensureMember ──────────────────────────────────────────────────────────────

describe('ensureMember', () => {
  const fakeUser = { id: '111', username: 'Ryker', displayName: 'Ryker' };

  it('returns the existing member row if found', async () => {
    const existingMember = { id: '111', username: 'Ryker', display_name: 'Ryker', dkp_balance: 75 };
    mockTables({
      members: makeBuilder({ data: existingMember, error: null }),
    });

    const result = await ensureMember(fakeUser);
    expect(result).toEqual(existingMember);
  });

  it('does not insert when the member already exists', async () => {
    const membersBuilder = makeBuilder({ data: { id: '111' }, error: null });
    mockTables({ members: membersBuilder });

    await ensureMember(fakeUser);
    expect(membersBuilder.insert).not.toHaveBeenCalled();
  });

  it('inserts and returns a new member when not found', async () => {
    const newMember = { id: '222', username: 'Hex', display_name: 'Hex', dkp_balance: 0 };
    const membersBuilder = makeBuilder();
    // First terminal call (maybeSingle) = not found
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // Second terminal call (single after insert) = new row
    membersBuilder.single.mockResolvedValueOnce({ data: newMember, error: null });
    mockTables({ members: membersBuilder });

    const result = await ensureMember({ id: '222', username: 'Hex', displayName: 'Hex' });
    expect(result).toEqual(newMember);
    expect(membersBuilder.insert).toHaveBeenCalledOnce();
  });

  it('uses username as display_name fallback when displayName is absent', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    membersBuilder.single.mockResolvedValueOnce({ data: { id: '333', username: 'Ghost', display_name: 'Ghost', dkp_balance: 0 }, error: null });
    mockTables({ members: membersBuilder });

    await ensureMember({ id: '333', username: 'Ghost' }); // no displayName
    const insertPayload = membersBuilder.insert.mock.calls[0][0];
    expect(insertPayload.display_name).toBe('Ghost');
  });

  it('returns null when insert fails', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    membersBuilder.single.mockResolvedValueOnce({ data: null, error: { message: 'unique violation' } });
    mockTables({ members: membersBuilder });

    const result = await ensureMember({ id: '444', username: 'Nova', displayName: 'Nova' });
    expect(result).toBeNull();
  });

  it('inserts with dkp_balance of 0', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    membersBuilder.single.mockResolvedValueOnce({ data: { id: '555', dkp_balance: 0 }, error: null });
    mockTables({ members: membersBuilder });

    await ensureMember({ id: '555', username: 'Zero', displayName: 'Zero' });
    const payload = membersBuilder.insert.mock.calls[0][0];
    expect(payload.dkp_balance).toBe(0);
  });
});

// ── awardDkp ─────────────────────────────────────────────────────────────────

describe('awardDkp', () => {
  it('returns null when member is not found in the DB', async () => {
    mockTables({
      members: makeBuilder({ data: null, error: null }),
    });

    const result = await awardDkp({ memberId: 'ghost', amount: 100, reason: 'test' });
    expect(result).toBeNull();
  });

  it('returns the new balance after awarding DKP', async () => {
    const membersBuilder = makeBuilder();
    // Select → returns member with balance 50
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 50 }, error: null });
    // update().eq() resolves without error
    membersBuilder.eq.mockResolvedValue({ error: null });
    mockTables({
      members:          membersBuilder,
      dkp_transactions: makeBuilder({ data: null, error: null }),
    });

    const result = await awardDkp({ memberId: '111', amount: 25, reason: 'Quest done' });
    expect(result).toBe(75);
  });

  it('handles positive DKP — adds to existing balance', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 200 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    mockTables({
      members:          membersBuilder,
      dkp_transactions: makeBuilder(),
    });

    expect(await awardDkp({ memberId: '111', amount: 50, reason: 'Event' })).toBe(250);
  });

  it('handles negative DKP (deductions) — subtracts from balance', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 100 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    mockTables({
      members:          membersBuilder,
      dkp_transactions: makeBuilder(),
    });

    expect(await awardDkp({ memberId: '111', amount: -30, reason: 'Penalty' })).toBe(70);
  });

  it('handles awarding 0 DKP — balance unchanged', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 100 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    mockTables({
      members:          membersBuilder,
      dkp_transactions: makeBuilder(),
    });

    expect(await awardDkp({ memberId: '111', amount: 0, reason: 'Nothing' })).toBe(100);
  });

  it('award from a zero balance — never goes negative from addition', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 0 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    mockTables({
      members:          membersBuilder,
      dkp_transactions: makeBuilder(),
    });

    expect(await awardDkp({ memberId: '111', amount: 500, reason: 'Big award' })).toBe(500);
  });

  it('inserts a transaction record', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 50 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    const txBuilder = makeBuilder({ data: null, error: null });
    mockTables({ members: membersBuilder, dkp_transactions: txBuilder });

    await awardDkp({ memberId: '111', amount: 10, reason: 'Quest: Test' });
    expect(txBuilder.insert).toHaveBeenCalledOnce();

    const tx = txBuilder.insert.mock.calls[0][0];
    expect(tx.member_id).toBe('111');
    expect(tx.amount).toBe(10);
    expect(tx.reason).toBe('Quest: Test');
  });

  it('passes optional eventId through to the transaction', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 0 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    const txBuilder = makeBuilder();
    mockTables({ members: membersBuilder, dkp_transactions: txBuilder });

    await awardDkp({ memberId: '111', amount: 20, reason: 'Attend', eventId: 'evt-abc' });
    const tx = txBuilder.insert.mock.calls[0][0];
    expect(tx.event_id).toBe('evt-abc');
  });

  it('passes optional questId through to the transaction', async () => {
    const membersBuilder = makeBuilder();
    membersBuilder.maybeSingle.mockResolvedValueOnce({ data: { id: '111', dkp_balance: 0 }, error: null });
    membersBuilder.eq.mockResolvedValue({ error: null });
    const txBuilder = makeBuilder();
    mockTables({ members: membersBuilder, dkp_transactions: txBuilder });

    await awardDkp({ memberId: '111', amount: 30, reason: 'Quest', questId: 'q-xyz' });
    const tx = txBuilder.insert.mock.calls[0][0];
    expect(tx.quest_id).toBe('q-xyz');
  });
});
