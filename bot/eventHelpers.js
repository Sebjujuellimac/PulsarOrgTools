import { db } from './db.js';

/**
 * Called when a Discord Scheduled Event transitions to COMPLETED.
 * Marks the event closed in DB and awards DKP to all attendees who registered.
 */
export async function autoCloseEvent(discordEvent) {
  const discordEventId = discordEvent.id;

  // Find matching event in our DB
  const { data: evt, error: evtErr } = await db
    .from('events')
    .select('*')
    .eq('discord_event_id', discordEventId)
    .maybeSingle();

  if (evtErr || !evt) {
    console.log(`autoCloseEvent: no DB event found for discord_event_id ${discordEventId}`);
    return;
  }

  if (evt.status === 'closed') {
    console.log(`autoCloseEvent: event ${evt.id} already closed`);
    return;
  }

  const dkpReward = evt.dkp_reward ?? 0;

  // Mark event closed
  await db.from('events').update({ status: 'closed' }).eq('id', evt.id);

  if (dkpReward <= 0) {
    console.log(`autoCloseEvent: event ${evt.id} closed, no DKP reward set`);
    return;
  }

  // Fetch all attendance records for this event
  const { data: attendees } = await db
    .from('attendance')
    .select('member_id')
    .eq('event_id', evt.id)
    .eq('attended', true);

  if (!attendees || attendees.length === 0) {
    console.log(`autoCloseEvent: event ${evt.id} closed, no attendees to reward`);
    return;
  }

  // Award DKP to each attendee
  for (const row of attendees) {
    await awardDkp({
      memberId: row.member_id,
      amount: dkpReward,
      reason: `Event attendance: ${evt.title}`,
      eventId: evt.id,
    });
  }

  console.log(`autoCloseEvent: awarded ${dkpReward} DKP to ${attendees.length} attendees for "${evt.title}"`);
}

/**
 * Award (or deduct if negative) DKP to a member.
 * Creates the member record if it doesn't exist.
 */
export async function awardDkp({ memberId, amount, reason, eventId = null, questId = null, awardedBy = null }) {
  // Upsert member row (Discord ID as primary key means we create if missing)
  const { data: member } = await db
    .from('members')
    .select('id, dkp_balance')
    .eq('id', memberId)
    .maybeSingle();

  if (!member) {
    console.warn(`awardDkp: member ${memberId} not found in DB`);
    return null;
  }

  const newBalance = (member.dkp_balance ?? 0) + amount;

  const [balanceUpdate, txInsert] = await Promise.all([
    db.from('members').update({ dkp_balance: newBalance }).eq('id', memberId),
    db.from('dkp_transactions').insert({
      member_id: memberId,
      amount,
      reason,
      event_id: eventId,
      quest_id: questId,
      awarded_by: awardedBy,
    }),
  ]);

  if (balanceUpdate.error) console.error('awardDkp balance update error:', balanceUpdate.error);
  if (txInsert.error) console.error('awardDkp tx insert error:', txInsert.error);

  return newBalance;
}

/**
 * Ensure a Discord user exists in the members table.
 * Returns the member row.
 */
export async function ensureMember(discordUser) {
  const { data: existing } = await db
    .from('members')
    .select('*')
    .eq('id', discordUser.id)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await db.from('members').insert({
    id: discordUser.id,
    username: discordUser.username,
    display_name: discordUser.displayName ?? discordUser.username,
    dkp_balance: 0,
  }).select().single();

  if (error) {
    console.error('ensureMember insert error:', error);
    return null;
  }
  return created;
}
