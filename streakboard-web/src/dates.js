// Calendar-date helpers. Days are "YYYY-MM-DD" strings, same as the backend.
// Math happens on UTC midnight of that string, so DST can't shift a day.
const MS_PER_DAY = 86_400_000;

export const toNum = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};
export const fromNum = (n) => new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
export const addDays = (day, n) => fromNum(toNum(day) + n);

/** Monday = 0 ... Sunday = 6. (1970-01-01 was a Thursday.) */
export const weekdayIndex = (day) => (toNum(day) + 3) % 7;

export const isValidTimeZone = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const browserTimeZone = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Today's calendar date in an IANA time zone (en-CA formats as YYYY-MM-DD). */
export function todayInTz(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const formatDay = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

/**
 * The habit row caches currentStreak as of the last check-in or stats run.
 * If the last check-in is older than yesterday, that streak has already ended,
 * so show 0 instead of the stale number (the backend counts a run that ends
 * yesterday as still alive).
 */
export function displayStreak(habit, today) {
  const last = habit.lastCheckinDay;
  return last && last >= addDays(today, -1) ? habit.currentStreak : 0;
}
