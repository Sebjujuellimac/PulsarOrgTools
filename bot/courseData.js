// ============================================================
// PULSAR ORG TOOLS — Course Data
// DB-backed source of truth for courses, tracks, and prereq
// validation. All exports are async; results are cached for
// 60 seconds to keep slash command autocomplete snappy without
// hammering the DB.
//
// Officers edit courses from the dashboard; the bot picks up
// changes on the next cache miss (or call invalidateCourseCache()
// after a known mutation).
// ============================================================

import { db } from './db.js';

let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;  // 60s

async function loadAll() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  const [coursesRes, tracksRes] = await Promise.all([
    db.from('courses').select('*').order('display_order', { ascending: true }),
    db.from('tracks').select('*').order('display_order',  { ascending: true }),
  ]);

  if (coursesRes.error) console.error('courseData loadAll courses error:', coursesRes.error.message);
  if (tracksRes.error)  console.error('courseData loadAll tracks error:',  tracksRes.error.message);

  const COURSES = {};
  for (const c of coursesRes.data ?? []) {
    COURSES[c.code] = {
      title:      c.title,
      track:      c.track,
      prereqs:    Array.isArray(c.prereqs) ? c.prereqs : [],
      breadth:    c.breadth ?? null,
      retired_at: c.retired_at,
    };
  }

  const tracks      = tracksRes.data ?? [];
  const TRACK_ORDER = tracks.filter(t => !t.retired_at).map(t => t.name);
  const TRACK_EMOJI = {};
  for (const t of tracks) TRACK_EMOJI[t.name] = t.emoji;

  _cache = { COURSES, TRACK_ORDER, TRACK_EMOJI };
  _cacheTime = now;
  return _cache;
}

export async function getCourses()    { return (await loadAll()).COURSES; }
export async function getTrackOrder() { return (await loadAll()).TRACK_ORDER; }
export async function getTrackEmoji() { return (await loadAll()).TRACK_EMOJI; }

export function invalidateCourseCache() {
  _cache = null; _cacheTime = 0;
}

/**
 * Check whether a member can receive a certification.
 * @returns {Promise<{ ok: boolean, missing: string[] }>}
 */
export async function checkPrereqs(courseCode, heldCodes) {
  const COURSES = await getCourses();
  const course  = COURSES[courseCode];
  if (!course) return { ok: false, missing: [`Unknown course: ${courseCode}`] };

  const held    = new Set(heldCodes);
  const missing = (course.prereqs ?? []).filter(p => !held.has(p));

  if (course.breadth) {
    for (const [track, required] of Object.entries(course.breadth)) {
      if (!held.has(required)) missing.push(`${required} (${track} breadth requirement)`);
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Returns the top N course matches for an autocomplete query string.
 * Filters out retired courses by default. Searches both code and title.
 */
export async function autocompleteCourses(query, { limit = 25, includeRetired = false } = {}) {
  const COURSES = await getCourses();
  const q = (query ?? '').toLowerCase().trim();
  const entries = Object.entries(COURSES)
    .filter(([, c]) => includeRetired || !c.retired_at)
    .filter(([code, c]) => !q || code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
    .slice(0, limit)
    .map(([code, c]) => ({ name: `${code} — ${c.title}`, value: code }));
  return entries;
}
