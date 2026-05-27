/**
 * decay.js — Monthly DKP decay scheduler.
 *
 * Fires at 3:00 AM on the 5th of every month.
 * Applies a 10% decay to every member's DKP balance,
 * rounding the result UP (Math.ceil) so fractional DKP
 * never accumulates against a member.
 *
 * Each decayed member gets a dkp_transactions entry for auditability.
 */

import cron from 'node-cron';
import { db } from './db.js';

export function startDecayScheduler(client) {
  // Cron: minute=0, hour=3, day=5, any month, any weekday
  cron.schedule('0 3 5 * *', () => runDecay(client), { timezone: 'UTC' });
  console.log('[Decay] Monthly DKP decay scheduled — 03:00 UTC on the 5th.');
}

export async function runDecay(client) {
  console.log('[Decay] Running monthly 10% DKP decay…');

  try {
    const { data: members, error } = await db
      .from('members')
      .select('id, display_name, dkp_balance')
      .gt('dkp_balance', 0);

    if (error) throw error;
    if (!members?.length) {
      console.log('[Decay] No members with positive balance — nothing to do.');
      return;
    }

    // Calculate new balances — ceil(balance * 0.9) rounds the REMAINING amount up
    const updates = members.map(m => ({
      id:          m.id,
      display_name: m.display_name,
      oldBalance:  m.dkp_balance,
      newBalance:  Math.ceil(m.dkp_balance * 0.9),
      decayed:     m.dkp_balance - Math.ceil(m.dkp_balance * 0.9),
    }));

    // Apply all balance updates
    await Promise.all(
      updates.map(u =>
        db.from('members').update({ dkp_balance: u.newBalance }).eq('id', u.id)
      )
    );

    // Log one transaction per member
    await db.from('dkp_transactions').insert(
      updates.map(u => ({
        member_id:  u.id,
        amount:     -u.decayed,
        reason:     'Monthly DKP decay (10%)',
        awarded_by: null,
      }))
    );

    const total = updates.reduce((s, u) => s + u.decayed, 0);
    console.log(`[Decay] Done — ${updates.length} member(s) affected, ${total} DKP total decayed.`);

  } catch (err) {
    console.error('[Decay] Error during decay run:', err);
  }
}
