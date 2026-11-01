// Pure date + streak logic. No Appwrite imports, so it is trivially unit-testable.
// All arithmetic uses calendar dates (UTC midnight of a YYYY-MM-DD string),
// never local timestamps, so DST shifts cannot create or hide a day.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidDay(s) {
  if (typeof s !== 'string') return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  // Round-trip rejects impossible dates such as 2026-02-30.
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function toNum(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromNum(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export const addDays = (day, n) => fromNum(toNum(day) + n);

/** Today's calendar date in an IANA timezone. Falls back to UTC on a bad zone. */
export function todayInTz(timeZone = 'UTC', now = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    if (isValidDay(s)) return s;
  } catch { /* invalid time zone */ }
  return now.toISOString().slice(0, 10);
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/**
 * FR-C3 / FR-C4. Returns null when the day is acceptable,
 * otherwise { status, message } ready to send to the client.
 */
export function validateCheckinDay(day, today, backfillDays = 7) {
  if (!isValidDay(day)) return { status: 400, message: 'day must be a valid YYYY-MM-DD date' };
  if (day > today) return { status: 422, message: 'Future check-ins are not allowed' };
  if (day < addDays(today, -backfillDays)) {
    return { status: 422, message: `Check-ins can only be back-filled ${backfillDays} days` };
  }
  return null;
}

/**
 * FR-S1..S3.
 * current: run ending today, or yesterday if today is not yet checked in.
 * longest: longest run of consecutive days anywhere in history.
 * completion30: share of the last 30 days (including today) that were checked in.
 */
export function computeStats(days, today) {
  const nums = [...new Set(days.filter(isValidDay).map(toNum))].sort((a, b) => a - b);
  const have = new Set(nums);
  const t = toNum(today);

  let currentStreak = 0;
  for (let c = have.has(t) ? t : t - 1; have.has(c); c--) currentStreak++;

  let longestStreak = 0, run = 0, prev = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = n;
  }

  const inWindow = nums.filter((n) => n > t - 30 && n <= t).length;
  return {
    currentStreak,
    longestStreak,
    totalCheckins: nums.length,
    lastCheckinDay: nums.length ? fromNum(nums[nums.length - 1]) : null,
    completion30: Math.round((inWindow / 30) * 100) / 100,
  };
}
