/**
 * Timezone abbreviation → IANA zone name.
 * Used by /event create and tests.
 */
export const TIMEZONE_MAP = {
  'EST':  'America/New_York',
  'CST':  'America/Chicago',
  'MST':  'America/Denver',
  'PST':  'America/Los_Angeles',
  'GMT':  'UTC',
  'UTC':  'UTC',
  'BST':  'Europe/London',
  'CET':  'Europe/Paris',
  'AEST': 'Australia/Sydney',
};

/**
 * Convert a local date + time string to a UTC Date, respecting DST.
 * Uses the sv-SE locale trick (YYYY-MM-DD HH:MM:SS) for reliable parsing.
 * @param {string} dateStr  — YYYY-MM-DD
 * @param {string} timeStr  — HH:MM (24h)
 * @param {string} tzAbbr   — abbreviation from TIMEZONE_MAP (default: 'EST')
 * @returns {Date|null}
 */
export function parseEventTime(dateStr, timeStr, tzAbbr = 'EST') {
  const ianaZone = TIMEZONE_MAP[tzAbbr.toUpperCase()];
  if (!ianaZone) return null;

  // Treat the input as if it were UTC first (naive parse)
  const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(naiveUTC.getTime())) return null;

  // Find what the clock in the target timezone shows at that naive UTC instant,
  // then compute the offset between the two
  const fmt = (tz) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(naiveUTC);

  const offsetMs = new Date(fmt('UTC') + 'Z') - new Date(fmt(ianaZone) + 'Z');

  // Apply offset to get the real UTC equivalent of the local time
  return new Date(naiveUTC.getTime() + offsetMs);
}
