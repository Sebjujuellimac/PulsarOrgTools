import { describe, it, expect } from 'vitest';
import { parseEventTime, TIMEZONE_MAP } from '../utils/timeUtils.js';

// ── TIMEZONE_MAP coverage ─────────────────────────────────────────────────────

describe('TIMEZONE_MAP', () => {
  const EXPECTED = ['EST','CST','MST','PST','GMT','UTC','BST','CET','AEST'];

  it.each(EXPECTED)('contains %s', (abbr) => {
    expect(TIMEZONE_MAP[abbr]).toBeDefined();
    expect(typeof TIMEZONE_MAP[abbr]).toBe('string');
  });

  it('GMT and UTC both map to UTC zone', () => {
    expect(TIMEZONE_MAP['GMT']).toBe('UTC');
    expect(TIMEZONE_MAP['UTC']).toBe('UTC');
  });
});

// ── Invalid inputs ────────────────────────────────────────────────────────────

describe('parseEventTime — invalid inputs', () => {
  it('returns null for unknown timezone abbreviation', () => {
    expect(parseEventTime('2026-05-10', '20:00', 'XYZ')).toBeNull();
  });

  it('returns null for empty timezone', () => {
    expect(parseEventTime('2026-05-10', '20:00', '')).toBeNull();
  });

  it('returns null for garbage date string', () => {
    expect(parseEventTime('not-a-date', '20:00', 'EST')).toBeNull();
  });

  it('returns null for garbage time string', () => {
    expect(parseEventTime('2026-05-10', 'nope', 'EST')).toBeNull();
  });

  it('returns null for completely empty strings', () => {
    expect(parseEventTime('', '', 'EST')).toBeNull();
  });
});

// ── UTC passthrough ───────────────────────────────────────────────────────────

describe('parseEventTime — UTC / GMT', () => {
  it('UTC input produces identical UTC output', () => {
    const result = parseEventTime('2026-05-10', '20:00', 'UTC');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-05-10T20:00:00.000Z');
  });

  it('GMT treated same as UTC', () => {
    const utc = parseEventTime('2026-05-10', '15:30', 'UTC');
    const gmt = parseEventTime('2026-05-10', '15:30', 'GMT');
    expect(gmt.toISOString()).toBe(utc.toISOString());
  });
});

// ── Eastern Time (EST / EDT) ──────────────────────────────────────────────────

describe('parseEventTime — Eastern Time', () => {
  it('returns a Date instance', () => {
    const result = parseEventTime('2026-05-10', '20:00', 'EST');
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('winter date (Jan 10) uses UTC-5 — 20:00 EST = 01:00 UTC next day', () => {
    const result = parseEventTime('2026-01-10', '20:00', 'EST');
    expect(result.toISOString()).toBe('2026-01-11T01:00:00.000Z');
  });

  it('summer date (Jul 10) uses UTC-4 (EDT) — 20:00 EDT = 00:00 UTC next day', () => {
    const result = parseEventTime('2026-07-10', '20:00', 'EST');
    expect(result.toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });

  it('midnight edge case — 00:00 EST winter = 05:00 UTC same day', () => {
    const result = parseEventTime('2026-03-01', '00:00', 'EST');
    expect(result.toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });
});

// ── Pacific Time ──────────────────────────────────────────────────────────────

describe('parseEventTime — Pacific Time', () => {
  it('winter date (Jan 10) uses UTC-8 — 18:00 PST = 02:00 UTC next day', () => {
    const result = parseEventTime('2026-01-10', '18:00', 'PST');
    expect(result.toISOString()).toBe('2026-01-11T02:00:00.000Z');
  });

  it('summer date (Jul 10) uses UTC-7 (PDT) — 18:00 PDT = 01:00 UTC next day', () => {
    const result = parseEventTime('2026-07-10', '18:00', 'PST');
    expect(result.toISOString()).toBe('2026-07-11T01:00:00.000Z');
  });
});

// ── Case insensitivity ────────────────────────────────────────────────────────

describe('parseEventTime — case insensitivity', () => {
  it('lowercase timezone matches uppercase', () => {
    const lower = parseEventTime('2026-05-10', '20:00', 'est');
    const upper = parseEventTime('2026-05-10', '20:00', 'EST');
    expect(lower).not.toBeNull();
    expect(lower.toISOString()).toBe(upper.toISOString());
  });

  it('mixed case works too', () => {
    const mixed = parseEventTime('2026-05-10', '20:00', 'Est');
    const upper = parseEventTime('2026-05-10', '20:00', 'EST');
    expect(mixed.toISOString()).toBe(upper.toISOString());
  });
});

// ── Consistency checks ────────────────────────────────────────────────────────

describe('parseEventTime — consistency', () => {
  it('same input always produces same output', () => {
    const a = parseEventTime('2026-06-15', '19:30', 'CST');
    const b = parseEventTime('2026-06-15', '19:30', 'CST');
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it('later time on same day produces a later UTC result', () => {
    const early = parseEventTime('2026-05-10', '14:00', 'UTC');
    const late  = parseEventTime('2026-05-10', '22:00', 'UTC');
    expect(late.getTime()).toBeGreaterThan(early.getTime());
  });

  it('result is offset from UTC by the expected hours', () => {
    // AEST (Australia/Sydney) is UTC+10 in winter (no DST in Jul)
    const result = parseEventTime('2026-07-15', '10:00', 'AEST');
    // 10:00 AEST = 00:00 UTC
    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});
