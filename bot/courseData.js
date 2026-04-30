// KHD Course definitions — source of truth for prereq enforcement.
// Keep in sync with CLAUDE.md course map.

export const COURSES = {
  // ── Air Wing ──────────────────────────────────────────────
  'BFS-01': { title: 'First Time Pilot',           track: 'Air Wing',  prereqs: [] },
  'BFS-02': { title: 'The Next Steps',              track: 'Air Wing',  prereqs: ['BFS-01'] },
  'AWC-01': { title: 'Combat Basics',               track: 'Air Wing',  prereqs: ['BFS-02'] },
  'AWC-02': { title: 'Element Tactics',             track: 'Air Wing',  prereqs: ['AWC-01', 'COM-01'] },
  'AWC-03': { title: 'Escort and Overwatch',        track: 'Air Wing',  prereqs: ['AWC-02'] },

  // ── Ground Forces ─────────────────────────────────────────
  'GFC-01': { title: 'Formation and FPS Fundamentals', track: 'Ground Forces', prereqs: [] },
  'GVO-01': { title: 'Ground Vehicle Operations',       track: 'Ground Forces', prereqs: ['GFC-01'] },

  // ── Marine Security Forces ────────────────────────────────
  'MSF-01': { title: 'CQB and Shipboard Combat',   track: 'MSF',       prereqs: ['GFC-01', 'FLT-01', 'COM-01'] },
  'MSF-02': { title: 'Boarding Operations',         track: 'MSF',       prereqs: ['MSF-01'] },

  // ── Fleet ─────────────────────────────────────────────────
  'ENG-01': { title: 'Ship Systems and Repair Fundamentals', track: 'Fleet', prereqs: ['BFS-01'] },
  'FLT-01': { title: 'Multicrew Fundamentals',      track: 'Fleet',     prereqs: ['ENG-01', 'COM-01'] },
  'FLT-02': { title: 'Capital Operations',           track: 'Fleet',     prereqs: ['FLT-01'] },

  // ── Comms ─────────────────────────────────────────────────
  'COM-01': { title: 'Comms Fundamentals',           track: 'Comms',     prereqs: [] },
  // COM-02 requires breadth — handled separately in checkPrereqs()
  'COM-02': { title: 'SRS and Officer Comms',        track: 'Comms',     prereqs: ['COM-01'],
              breadth: { 'Air Wing': 'AWC-01', 'Ground Forces': 'GFC-01', 'Fleet': 'FLT-01' } },

  // ── Mining ────────────────────────────────────────────────
  'MNG-01': { title: 'Mining Fundamentals',          track: 'Mining',    prereqs: [] },
  'MNG-02': { title: 'Ship Mining and Crew Roles',   track: 'Mining',    prereqs: ['MNG-01'] },

  // ── Salvage ───────────────────────────────────────────────
  'SAL-01': { title: 'Salvage Fundamentals',         track: 'Salvage',   prereqs: ['BFS-01'] },
  'SAL-02': { title: 'Post-Engagement Recovery Operations', track: 'Salvage', prereqs: ['SAL-01'] },

  // ── Logistics ─────────────────────────────────────────────
  'LOG-01': { title: 'Cargo and Transport',          track: 'Logistics', prereqs: ['BFS-01'] },
};

// Track display order for profile embeds
export const TRACK_ORDER = [
  'Air Wing', 'Ground Forces', 'MSF', 'Fleet', 'Comms', 'Mining', 'Salvage', 'Logistics',
];

// Track emoji
export const TRACK_EMOJI = {
  'Air Wing':      '✈️',
  'Ground Forces': '🪖',
  'MSF':           '⚓',
  'Fleet':         '🚀',
  'Comms':         '📡',
  'Mining':        '⛏️',
  'Salvage':       '🔧',
  'Logistics':     '📦',
};

/**
 * Check whether a member can receive a certification.
 * @param {string} courseCode
 * @param {string[]} heldCodes - array of course codes the member already holds
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkPrereqs(courseCode, heldCodes) {
  const course = COURSES[courseCode];
  if (!course) return { ok: false, missing: [`Unknown course: ${courseCode}`] };

  const held = new Set(heldCodes);
  const missing = course.prereqs.filter(p => !held.has(p));

  // COM-02 breadth check: needs at least the listed cert from each breadth track
  if (courseCode === 'COM-02' && course.breadth) {
    for (const [track, required] of Object.entries(course.breadth)) {
      if (!held.has(required)) {
        missing.push(`${required} (${track} breadth requirement)`);
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
