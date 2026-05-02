import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from './db.js';
import { getCourses, checkPrereqs } from './courseData.js';

/**
 * Called when a Discord Scheduled Event transitions to COMPLETED.
 * Marks the event closed in DB, awards DKP to all marked attendees,
 * and (if the event has a course_code) posts an officer confirmation
 * prompt to award certifications.
 *
 * @param {GuildScheduledEvent} discordEvent
 * @param {Client} [client] — optional, needed to post the cert prompt
 */
export async function autoCloseEvent(discordEvent, client = null) {
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

  // Fetch all attendance records for this event
  const { data: attendees } = await db
    .from('attendance')
    .select('member_id')
    .eq('event_id', evt.id)
    .eq('attended', true);

  const attendeeIds = (attendees ?? []).map(a => a.member_id);

  // Award DKP if applicable
  if (dkpReward > 0 && attendeeIds.length > 0) {
    for (const memberId of attendeeIds) {
      await awardDkp({
        memberId,
        amount: dkpReward,
        reason: `Event attendance: ${evt.title}`,
        eventId: evt.id,
      });
    }
    console.log(`autoCloseEvent: awarded ${dkpReward} DKP to ${attendeeIds.length} attendees for "${evt.title}"`);
  } else {
    console.log(`autoCloseEvent: event ${evt.id} closed, no DKP awarded (reward=${dkpReward}, attendees=${attendeeIds.length})`);
  }

  // Cert confirmation prompt — only if course_code is set and we have a client
  if (evt.course_code && evt.officer_channel_id && client) {
    await postCertConfirmationPrompt(client, evt, attendeeIds).catch(err =>
      console.error('postCertConfirmationPrompt error:', err.message)
    );
  }
}

/**
 * Posts a confirmation message in the event's officer channel with
 * Approve / Skip buttons for awarding certs to all attendees.
 */
async function postCertConfirmationPrompt(client, evt, attendeeIds) {
  const COURSES = await getCourses();
  const course = COURSES[evt.course_code];
  if (!course) {
    console.warn(`postCertConfirmationPrompt: unknown course_code ${evt.course_code} on event ${evt.id}`);
    return;
  }

  const channel = await client.channels.fetch(evt.officer_channel_id).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn(`postCertConfirmationPrompt: channel ${evt.officer_channel_id} not accessible`);
    return;
  }

  const attendeeCount = attendeeIds.length;
  const attendeeList = attendeeCount
    ? attendeeIds.map(id => `<@${id}>`).join(', ')
    : '*No attendees marked.*';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cert-approve-${evt.id}`)
      .setLabel(`Award ${evt.course_code} to all`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(attendeeCount === 0),
    new ButtonBuilder()
      .setCustomId(`cert-skip-${evt.id}`)
      .setLabel('Skip / no certs')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content:
      `🎓 **${evt.title}** has ended.\n` +
      `Course: **${evt.course_code} — ${course.title}**\n` +
      `Attendees (${attendeeCount}): ${attendeeList}\n\n` +
      `Award the cert to all attendees who meet prerequisites?\n` +
      `*Officers can also use \`/event certify event_id:${evt.id}\` for selective awarding.*`,
    components: [row],
  });
}

/**
 * Awards a course cert to every member ID in `memberIds` that:
 *   1. is registered
 *   2. doesn't already hold the cert
 *   3. meets the prerequisites (or override=true)
 *
 * Returns { awarded: [...names], skipped: [{name, reason}, ...] }.
 */
export async function awardCertsToAttendees({ eventId, courseCode, memberIds, awardedBy, override = false, notes = null }) {
  const COURSES = await getCourses();
  const course = COURSES[courseCode];
  if (!course) return { awarded: [], skipped: [], error: `Unknown course ${courseCode}` };

  const awarded = [];
  const skipped = [];

  for (const memberId of memberIds) {
    const { data: member } = await db
      .from('members').select('id, display_name, username').eq('id', memberId).maybeSingle();
    if (!member) { skipped.push({ name: memberId, reason: 'not registered' }); continue; }
    const name = member.display_name || member.username;

    // Already holds it?
    const { data: existing } = await db.from('certifications')
      .select('id').eq('member_id', memberId).eq('course_code', courseCode).maybeSingle();
    if (existing) { skipped.push({ name, reason: 'already holds' }); continue; }

    // Prereq check
    if (!override) {
      const { data: heldRows } = await db.from('certifications').select('course_code').eq('member_id', memberId);
      const held = (heldRows ?? []).map(r => r.course_code);
      const { ok, missing } = await checkPrereqs(courseCode, held);
      if (!ok) { skipped.push({ name, reason: `missing ${missing.join(', ')}` }); continue; }
    }

    const { error } = await db.from('certifications').insert({
      member_id: memberId,
      course_code: courseCode,
      awarded_by: awardedBy,
      notes: notes ?? `Auto-awarded from event ${eventId}`,
    });
    if (error) { skipped.push({ name, reason: error.message }); continue; }

    awarded.push(name);
  }

  return { awarded, skipped };
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
