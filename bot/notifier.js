/**
 * notifier.js — Supabase Realtime subscriber for Discord DM notifications.
 *
 * Watches the `notifications_queue` table for new rows and dispatches
 * DMs to the relevant Discord members.
 *
 * Supported notification types:
 *   refine_done  — refine order timer expired; payload: { session_name, job_loc }
 *   payout       — session payout receipt;    payload: { session_name, amount, crew_name, detail? }
 */

import { db } from './db.js';

export function startNotifier(client) {
  db.channel('notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications_queue' },
      payload => handleNotification(client, payload.new)
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('[Notifier] Realtime subscription active — watching notifications_queue.');
      } else {
        console.log('[Notifier] Realtime status:', status);
      }
    });
}

async function handleNotification(client, row) {
  if (row.sent_at) return; // already handled (e.g. duplicate delivery)

  try {
    // Claim the row immediately — only process if we actually updated a row
    // (guards against duplicate delivery on reconnect)
    const { data: claimed } = await db
      .from('notifications_queue')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('sent_at', null)
      .select('id')
      .maybeSingle();

    if (!claimed) return; // another instance already claimed it

    const user = await client.users.fetch(row.member_id).catch(() => null);
    if (!user) {
      console.warn(`[Notifier] Could not fetch Discord user ${row.member_id} for notification ${row.id}`);
      return;
    }

    const dm = await user.createDM().catch(() => null);
    if (!dm) {
      console.warn(`[Notifier] Could not open DM with ${user.tag}`);
      return;
    }

    const p = row.payload || {};

    if (row.type === 'refine_done') {
      const loc  = p.job_loc     ? `**${p.job_loc}**`      : 'the refinery';
      const sess = p.session_name ? `\nSession: *${p.session_name}*` : '';
      await dm.send(
        `⚗️ **Refine complete!**\n` +
        `Your order at ${loc} has finished and is ready to collect.` +
        sess
      );
    } else if (row.type === 'payout') {
      const amt  = typeof p.amount === 'number'
        ? `**${p.amount.toLocaleString()} aUEC**`
        : 'your share';
      const sess = p.session_name ? `Session: **${p.session_name}**\n` : '';
      const det  = p.detail       ? `\n${p.detail}`                    : '';
      await dm.send(
        `💰 **Payout receipt**\n` +
        sess +
        `Your share: ${amt}` +
        det
      );
    } else {
      console.warn(`[Notifier] Unknown notification type: ${row.type}`);
    }

    console.log(`[Notifier] Sent ${row.type} DM → ${user.tag} (notification ${row.id})`);
  } catch (err) {
    console.error(`[Notifier] Error processing notification ${row.id}:`, err.message);
  }
}
