/**
 * rsiApi.js — Thin wrapper around starcitizen-api.com
 *
 * Docs: https://starcitizen-api.com/api.php
 * URL format: https://starcitizen-api.com/{key}/v1/{mode}/{endpoint}
 *
 * Modes:
 *   live  — real-time RSI scrape, counts against 1 000/day quota
 *   cache — cached ~2 am UTC daily, unlimited calls
 *   auto  — tries cache first, falls back to live
 */

import 'dotenv/config';

const BASE    = 'https://api.starcitizen-api.com';
const API_KEY = process.env.STARCITIZEN_API_KEY;

/** Low-level fetch with timeout + key check */
async function rsiGet(endpoint, mode = 'live') {
  if (!API_KEY) throw new Error('STARCITIZEN_API_KEY is not set in .env');

  const url = `${BASE}/${API_KEY}/v1/${mode}/${endpoint}`;
  const res  = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`RSI API HTTP ${res.status} for ${endpoint}`);

  const json = await res.json();
  if (json.code !== 200) {
    throw new Error(`RSI API error ${json.code}: ${json.message ?? 'unknown'}`);
  }
  return json.data;
}

/** Normalize raw API user object into a flat structure */
function normalizeUser(raw) {
  const profile = raw?.profile ?? {};
  const org     = raw?.organization ?? null;
  return {
    handle:        profile.handle        ?? null,
    displayName:   profile.display       ?? null,
    citizenNumber: profile.id            ?? null,
    avatarUrl:     profile.image         ?? null,
    bio:           profile.bio           ?? null,
    enlisted:      profile.enlisted      ?? null,
    orgName:       org?.name             ?? null,
    orgSid:        org?.sid              ?? null,
    orgRank:       org?.rank             ?? null,
    orgStars:      org?.stars            ?? null,
  };
}

/**
 * Fetch a public RSI user profile.
 * Returns null if the handle doesn't exist (404-style).
 *
 * @param {string} handle   RSI handle (case-insensitive)
 * @param {'live'|'cache'|'auto'} mode
 * @returns {Promise<object|null>}
 */
export async function fetchRsiUser(handle, mode = 'live') {
  try {
    const data = await rsiGet(`user/${encodeURIComponent(handle)}`, mode);
    return normalizeUser(data);
  } catch (err) {
    // API returns code 404 wrapped in an error message for unknown handles
    if (/404|not found|no profile/i.test(err.message)) return null;
    throw err;
  }
}

/**
 * Fetch one page of org members (32 per page) in cache mode.
 *
 * @param {string} sid    Org SID (e.g. 'PULSAR')
 * @param {number} page   1-indexed
 * @returns {Promise<{ totalPages: number, members: Array }>}
 */
export async function fetchOrgMembers(sid, page = 1) {
  const data = await rsiGet(
    `organization_members/${encodeURIComponent(sid)}?page=${page}`,
    'cache'
  );
  // data.resultset = array of members; data.page = { totalrows, totalrowsperpage }
  const members = (data?.resultset ?? []).map(m => ({
    handle:      m.handle      ?? null,
    displayName: m.display     ?? null,
    rank:        m.rank        ?? null,
    stars:       m.stars       ?? null,
    roles:       m.roles       ?? [],
  }));
  const totalRows = data?.page?.totalrows     ?? members.length;
  const perPage   = data?.page?.totalrowsperpage ?? 32;
  return {
    totalPages: Math.ceil(totalRows / perPage),
    members,
  };
}

/**
 * Check whether a given RSI handle appears in an org's member list.
 * Walks all pages in cache mode (unlimited).
 *
 * @param {string} handle  RSI handle to look for (case-insensitive)
 * @param {string} sid     Org SID
 * @returns {Promise<boolean>}
 */
export async function isOrgMember(handle, sid) {
  const lower = handle.toLowerCase();
  let page = 1;
  while (true) {
    const { totalPages, members } = await fetchOrgMembers(sid, page);
    if (members.some(m => m.handle?.toLowerCase() === lower)) return true;
    if (page >= totalPages) return false;
    page++;
  }
}
