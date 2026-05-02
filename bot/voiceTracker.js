// ============================================================
// PULSAR ORG TOOLS — Voice Channel Auto-Attendance
// Watches for members joining voice channels linked to open
// events and marks them attended automatically.
// ============================================================

import { db } from './db.js';

// How early before scheduled_start_time and how long after
// scheduled_end_time we still credit a voice join as attendance.
const PRE_WINDOW_MS  = 15 * 60 * 1000;          // 15 min before
const POST_WINDOW_MS = 30 * 60 * 1000;          // 30 min after end
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000; // 2h fallback if no end time

/**
 * Called from voiceStateUpdate. Checks if the member just joined
 * a voice channel that's linked to an active event and, if so,
 * marks them attended.
 */
export async function handleVoiceStateUpdate(oldState, newState) {
  // Only care about joins / channel switches into a new channel
  const newChannelId = newState.channelId;
  if (!newChannelId) return;                    // user left voice
  if (oldState.channelId === newChannelId) return; // didn't change channel

  const memberId = newState.id;
  if (!memberId) return;

  // Find any open event linked to this voice channel that's currently in window
  const now = Date.now();
  const { data: events, error } = await db
    .from('events')
    .select('id, title, scheduled_start_time, scheduled_end_time, voice_channel_id, status')
    .eq('voice_channel_id', newChannelId)
    .eq('status', 'open');

  if (error) { console.error('voiceTracker fetch error:', error.message); return; }
  if (!events?.length) return;

  for (const evt of events) {
    if (!isInAttendanceWindow(evt, now)) continue;

    // Member must be registered to be tracked
    const { data: member } = await db
      .from('members').select('id, display_name').eq('id', memberId).maybeSingle();
    if (!member) {
      console.log(`voiceTracker: ${memberId} joined "${evt.title}" voice but isn't registered (skipping).`);
      continue;
    }

    // Insert (or noop if already marked)
    const { error: upsertErr } = await db.from('attendance').upsert({
      event_id:  evt.id,
      member_id: memberId,
      attended:  true,
    }, { onConflict: 'event_id,member_id' });

    if (upsertErr) {
      console.error(`voiceTracker upsert error for ${memberId} on ${evt.id}:`, upsertErr.message);
    } else {
      console.log(`voiceTracker: marked ${member.display_name || memberId} attended for "${evt.title}".`);
    }
  }
}

function isInAttendanceWindow(evt, now) {
  if (!evt.scheduled_start_time) return false;
  const start = new Date(evt.scheduled_start_time).getTime();
  const end   = evt.scheduled_end_time
    ? new Date(evt.scheduled_end_time).getTime()
    : start + DEFAULT_DURATION_MS;
  return now >= start - PRE_WINDOW_MS && now <= end + POST_WINDOW_MS;
}
