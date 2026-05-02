// ============================================================
// PULSAR ORG TOOLS — External Event Sync
// Fetches upcoming CIG content from YouTube RSS and Twitch
// schedule, then upserts into the org events table.
//
// Run via GitHub Actions cron (no Supabase Pro needed).
// YouTube: no API key required — uses public Atom RSS feed.
// Twitch:  requires a free developer app (dev.twitch.tv).
//
// Required env vars:
//   SUPABASE_URL          — your project URL
//   SUPABASE_SERVICE_KEY  — service role key (bypasses RLS)
//   TWITCH_CLIENT_ID      — from dev.twitch.tv app (optional)
//   TWITCH_CLIENT_SECRET  — from dev.twitch.tv app (optional)
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Config — verify channel IDs before first run ─────────────────────────────
// To find a YouTube channel ID: open the channel page, view source, search for
// "channelId" or use https://commentpicker.com/youtube-channel-id.php
const YOUTUBE_CHANNELS = [
  { id: 'UCTeLqJq1mXUX5WWoNXLmOIA', label: 'Roberts Space Industries' },
  // Add more CIG channels here if needed, e.g.:
  // { id: 'CHANNEL_ID_2', label: 'Star Citizen' },
];

// Twitch login names (lowercase) — CIG doesn't actively stream to Twitch,
// leave empty unless you want to track a specific community channel.
const TWITCH_CHANNELS = [
  // 'robertsspaceindustries',
];

// How far ahead/behind to import YouTube entries (days)
const YT_WINDOW_PAST_DAYS   = 7;
const YT_WINDOW_FUTURE_DAYS = 30;
// ─────────────────────────────────────────────────────────────────────────────

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── XML helpers ───────────────────────────────────────────────────────────────
function xmlText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeXmlEntities(m[1].trim()) : null;
}
function xmlAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"[^>]*>`));
  return m ? m[1] : null;
}
function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// ── YouTube RSS (no API key needed) ──────────────────────────────────────────
async function fetchYouTubeEvents(channelId, label) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  let xml;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn(`  YouTube RSS ${channelId} → HTTP ${res.status}`); return []; }
    xml = await res.text();
  } catch (err) {
    console.warn(`  YouTube RSS fetch error: ${err.message}`);
    return [];
  }

  const now       = Date.now();
  const pastMs    = YT_WINDOW_PAST_DAYS   * 86400_000;
  const futureMs  = YT_WINDOW_FUTURE_DAYS * 86400_000;

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  const results = [];

  for (const entry of entries) {
    const videoId   = xmlText(entry, 'yt:videoId');
    const title     = xmlText(entry, 'title');
    const published = xmlText(entry, 'published');
    const desc      = xmlText(entry, 'media:description') || '';
    const link      = xmlAttr(entry, 'link', 'href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    if (!videoId || !title || !published) continue;

    const startTime = new Date(published);
    if (isNaN(startTime.getTime())) continue;

    const delta = startTime.getTime() - now;
    if (delta < -pastMs || delta > futureMs) continue;

    results.push({
      source:              'youtube',
      source_id:           `yt:${videoId}`,
      source_url:          link,
      title:               `${title}`,
      description:         desc.slice(0, 600) || `Star Citizen — ${label}`,
      scheduled_start_time: startTime.toISOString(),
      scheduled_end_time:  null,
      status:              startTime.getTime() > now ? 'open' : 'closed',
      dkp_reward:          0,
      location:            null,
    });
  }

  return results;
}

// ── Twitch schedule (requires free developer app) ─────────────────────────────
async function getTwitchToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type:    'client_credentials',
    }),
  });
  if (!res.ok) { console.warn(`  Twitch token fetch → HTTP ${res.status}`); return null; }
  const { access_token } = await res.json();
  return access_token;
}

async function getTwitchUserId(login, token) {
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { data } = await res.json();
  return data?.[0]?.id ?? null;
}

async function fetchTwitchEvents(channelLogin, token) {
  const broadcasterId = await getTwitchUserId(channelLogin, token);
  if (!broadcasterId) { console.warn(`  Twitch: user not found — ${channelLogin}`); return []; }

  const res = await fetch(
    `https://api.twitch.tv/helix/schedule?broadcaster_id=${broadcasterId}&first=25`,
    { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
  );
  if (res.status === 404) return [];  // broadcaster has no schedule set
  if (!res.ok) { console.warn(`  Twitch schedule ${channelLogin} → HTTP ${res.status}`); return []; }

  const body = await res.json();
  const segments = body?.data?.segments ?? [];
  const now = Date.now();
  const results = [];

  for (const seg of segments) {
    if (!seg.start_time || !seg.title) continue;
    const startTime = new Date(seg.start_time);
    const endTime   = seg.end_time ? new Date(seg.end_time) : null;
    if (isNaN(startTime.getTime())) continue;

    // Skip segments that ended more than 1 hour ago
    const endCheck = endTime ?? startTime;
    if (endCheck.getTime() < now - 3600_000) continue;

    const category = seg.category?.name ?? '';
    results.push({
      source:              'twitch',
      source_id:           `twitch:${seg.id}`,
      source_url:          `https://www.twitch.tv/${channelLogin}`,
      title:               seg.title,
      description:         category ? `Live on Twitch — ${category}` : 'Live on Twitch',
      scheduled_start_time: startTime.toISOString(),
      scheduled_end_time:  endTime?.toISOString() ?? null,
      status:              startTime.getTime() > now ? 'open' : 'closed',
      dkp_reward:          0,
      location:            null,
    });
  }

  return results;
}

// ── Upsert into Supabase ──────────────────────────────────────────────────────
async function upsertEvents(events) {
  if (!events.length) { console.log('  No events to upsert.'); return; }
  const { error } = await db
    .from('events')
    .upsert(events, { onConflict: 'source_id' });
  if (error) console.error('  Upsert error:', error.message);
  else       console.log(`  ✔ Upserted ${events.length} event(s).`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('── Pulsar External Event Sync ──────────────────────────');
  const all = [];

  // YouTube RSS — no key required
  for (const ch of YOUTUBE_CHANNELS) {
    console.log(`\nYouTube: ${ch.label} (${ch.id})`);
    const evs = await fetchYouTubeEvents(ch.id, ch.label);
    console.log(`  → ${evs.length} event(s) in window`);
    all.push(...evs);
  }

  // Twitch — only if credentials are configured
  if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    const token = await getTwitchToken();
    if (token) {
      for (const login of TWITCH_CHANNELS) {
        console.log(`\nTwitch: ${login}`);
        const evs = await fetchTwitchEvents(login, token);
        console.log(`  → ${evs.length} scheduled segment(s)`);
        all.push(...evs);
      }
    }
  } else {
    console.log('\nTwitch: credentials not set — skipping.');
  }

  console.log(`\nUpserting ${all.length} total event(s)…`);
  await upsertEvents(all);
  console.log('\n── Done ────────────────────────────────────────────────');
}

main().catch(err => { console.error(err); process.exit(1); });
