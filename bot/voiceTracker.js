// ============================================================
// PULSAR ORG TOOLS — Voice Channel Clock-In / Clock-Out
//
// Tracks attendance time for events with a linked voice channel.
//   • First join  = clock_in  (never overwritten on rejoin)
//   • Every leave = clock_out (updated so the LAST departure is recorded)
//   • Rejoin after leave  = clock_out cleared (next leave becomes final)
//   • Event ends          = any still-present members are clocked out
//
// Time-based DKP and aUEC payouts are calculated by finalizeTimeTracking()
// in eventHelpers.js when the event closes.
// ============================================================

import { db } from './db.js';

const PRE_WINDOW_MS       = 15 * 60 * 1000;          // 15 min before start
const POST_WINDOW_MS      = 30 * 60 * 1000;          // 30 min after end
const DEFAULT_DURATION_MS =  2 * 60 * 60 * 1000;     // 2 h fallback

// ── Main handler ─────────────────────────────────────────────────────────────

export async function handleVoiceStateUpdate(oldState, newState) {
  const memberId     = newState.member?.id ?? oldState.member?.id;
  if (!memberId) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // No channel change (mute/deafen/stream toggle, etc.)
  if (oldChannelId === newChannelId) return;

  // Left a channel (fully or switched) — process as leave from old channel
  if (oldChannelId) {
    await handleVoiceLeave(memberId, oldChannelId).catch(e =>
      console.error('voiceTracker leave error:', e)
    );
  }

  // Joined a channel (new join or channel switch) — process as join to new channel
  if (newChannelId) {
    await handleVoiceJoin(memberId, newChannelId).catch(e =>
      console.error('voiceTracker join error:', e)
    );
  }
}

// ── Join ─────────────────────────────────────────────────────────────────────

async function handleVoiceJoin(memberId, channelId) {
  const evt = await findEventForChannel(channelId, Date.now());
  if (!evt) return;

  const { data: member } = await db
    .from('members').select('id, display_name').eq('id', memberId).maybeSingle();
  if (!member) {
    console.log(`voiceTracker: ${memberId} not registered — skipping clock-in for "${evt.title}"`);
    return;
  }

  const name        = member.display_name || memberId;
  const clockInTime = new Date().toISOString();

  // Always log the raw join event for the detailed timeline
  db.from('attendance_log')
    .insert({ event_id: evt.id, member_id: memberId, action: 'join', ts: clockInTime })
    .catch(e => console.error('attendance_log join error:', e.message));

  const { data: existing } = await db
    .from('attendance')
    .select('id, clock_in')
    .eq('event_id', evt.id)
    .eq('member_id', memberId)
    .maybeSingle();

  if (!existing) {
    // First time seen — insert with clock_in
    await db.from('attendance').insert({
      event_id:  evt.id,
      member_id: memberId,
      attended:  true,
      clock_in:  clockInTime,
    });
    console.log(`voiceTracker: clocked IN  ${name} for "${evt.title}"`);

  } else if (!existing.clock_in) {
    // Manually-marked record with no clock_in — set it now
    await db.from('attendance')
      .update({ attended: true, clock_in: clockInTime })
      .eq('id', existing.id);
    console.log(`voiceTracker: set clock_in for ${name} on "${evt.title}" (manual record)`);

  } else {
    // Rejoin — clear clock_out so the next departure becomes the final one
    await db.from('attendance')
      .update({ attended: true, clock_out: null })
      .eq('id', existing.id);
    console.log(`voiceTracker: ${name} re-joined "${evt.title}" — clock_out cleared`);
  }
}

// ── Leave ─────────────────────────────────────────────────────────────────────

async function handleVoiceLeave(memberId, channelId) {
  const evt = await findEventForChannel(channelId, Date.now());
  if (!evt) return;

  const clockOutTime = new Date().toISOString();

  // Always log the raw leave event for the detailed timeline
  db.from('attendance_log')
    .insert({ event_id: evt.id, member_id: memberId, action: 'leave', ts: clockOutTime })
    .catch(e => console.error('attendance_log leave error:', e.message));

  await db.from('attendance')
    .update({ clock_out: clockOutTime })
    .eq('event_id',  evt.id)
    .eq('member_id', memberId)
    .not('clock_in', 'is', null);   // only clock out if we have a clock-in

  console.log(`voiceTracker: clocked OUT ${memberId} from "${evt.title}"`);
}

// ── Sweep on event ACTIVE ─────────────────────────────────────────────────────
// Called from index.js when a Discord Scheduled Event transitions to ACTIVE.
// Clocks in anyone already sitting in the voice channel before the transition.

export async function sweepVoiceChannelOnStart(discordEvent) {
  const voiceChannelId = discordEvent.channelId;
  if (!voiceChannelId) return;

  const { data: evt } = await db
    .from('events')
    .select('id, title')
    .eq('discord_event_id', discordEvent.id)
    .maybeSingle();
  if (!evt) return;

  const guild = discordEvent.guild;
  if (!guild) return;

  const channel = await guild.channels.fetch(voiceChannelId).catch(() => null);
  if (!channel?.members) return;

  const now   = new Date().toISOString();
  let   count = 0;

  for (const [memberId, guildMember] of channel.members) {
    if (guildMember.user.bot) continue;

    const { data: dbMember } = await db
      .from('members').select('id').eq('id', memberId).maybeSingle();
    if (!dbMember) continue;

    const { data: existing } = await db
      .from('attendance')
      .select('id, clock_in')
      .eq('event_id',  evt.id)
      .eq('member_id', memberId)
      .maybeSingle();

    if (!existing) {
      await db.from('attendance').insert({
        event_id: evt.id, member_id: memberId, attended: true, clock_in: now,
      });
      db.from('attendance_log')
        .insert({ event_id: evt.id, member_id: memberId, action: 'join', ts: now })
        .catch(e => console.error('attendance_log sweep error:', e.message));
      count++;
    } else if (!existing.clock_in) {
      await db.from('attendance').update({ clock_in: now }).eq('id', existing.id);
      db.from('attendance_log')
        .insert({ event_id: evt.id, member_id: memberId, action: 'join', ts: now })
        .catch(e => console.error('attendance_log sweep error:', e.message));
      count++;
    }
    // Already has a clock_in — no action needed
  }

  console.log(`sweepVoiceChannelOnStart: clocked in ${count} early arrival(s) for "${evt.title}"`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findEventForChannel(channelId, nowMs) {
  const { data: events, error } = await db
    .from('events')
    .select('id, title, scheduled_start_time, scheduled_end_time, status')
    .eq('voice_channel_id', channelId)
    .eq('status', 'open');

  if (error || !events?.length) return null;
  return events.find(evt => isInAttendanceWindow(evt, nowMs)) ?? null;
}

function isInAttendanceWindow(evt, now) {
  if (!evt.scheduled_start_time) return false;
  const start = new Date(evt.scheduled_start_time).getTime();
  const end   = evt.scheduled_end_time
    ? new Date(evt.scheduled_end_time).getTime()
    : start + DEFAULT_DURATION_MS;
  return now >= start - PRE_WINDOW_MS && now <= end + POST_WINDOW_MS;
}
