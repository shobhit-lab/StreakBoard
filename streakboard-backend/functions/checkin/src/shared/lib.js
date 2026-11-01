import { createHash } from 'node:crypto';
import { computeStats, todayInTz, isValidTimeZone } from './streaks.js';

export const DB = 'streakboard';
export const T = { habits: 'habits', checkins: 'checkins', settings: 'user_settings' };
export const PAGE = 100;
export const MAX_ACTIVE_HABITS = 50;

export const callerId = (req) => req.headers?.['x-appwrite-user-id'] || null;
export const isNotFound = (e) => e?.code === 404;
export const isConflict = (e) => e?.code === 409;

/** Owner-only permissions (section 6.5). */
export const ownerPermissions = ({ Permission, Role }, userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

/**
 * Deterministic row id for a check-in. Combined with the unique index this
 * makes double-taps and retries collapse onto one row, and lets us fetch the
 * existing row by id on conflict with no query.
 */
export const checkinRowId = (habitId, day) =>
  createHash('sha256').update(`${habitId}:${day}`).digest('hex').slice(0, 36);

/** FR-C6 + 404 rule: "not yours" and "does not exist" are indistinguishable. */
export async function loadOwnedHabit(db, habitId, userId) {
  try {
    const habit = await db.getRow({ databaseId: DB, tableId: T.habits, rowId: habitId });
    return habit.userId === userId ? habit : null;
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function getSettings(db, sdk, userId) {
  const { rows } = await db.listRows({
    databaseId: DB, tableId: T.settings,
    queries: [sdk.Query.equal('userId', userId), sdk.Query.limit(1)],
  });
  const s = rows[0];
  return {
    timezone: s && isValidTimeZone(s.timezone) ? s.timezone : 'UTC',
    backfillDays: Number.isInteger(s?.backfillDays) ? Math.min(Math.max(s.backfillDays, 0), 7) : 7,
  };
}

/** All check-in days for a habit, cursor-paginated so nothing is missed. */
export async function fetchCheckinDays(db, sdk, habitId) {
  const { Query } = sdk;
  const days = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('habitId', habitId), Query.orderAsc('day'),
      Query.select(['$id', 'day']), Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const { rows } = await db.listRows({ databaseId: DB, tableId: T.checkins, queries });
    for (const r of rows) days.push(r.day);
    if (rows.length < PAGE) return days;
    cursor = rows[rows.length - 1].$id;
  }
}

const CACHE_KEYS = ['currentStreak', 'longestStreak', 'totalCheckins', 'lastCheckinDay'];

/**
 * Recompute stats from the check-ins (the source of truth) and rewrite the
 * denormalized cache on the habit only if it changed. A tampered client value
 * is therefore always overwritten (section 6.5).
 */
export async function refreshHabitStats(db, sdk, habit, today) {
  const stats = computeStats(await fetchCheckinDays(db, sdk, habit.$id), today);
  const changed = CACHE_KEYS.some((k) => (habit[k] ?? null) !== (stats[k] ?? null));
  if (changed) {
    await db.updateRow({
      databaseId: DB, tableId: T.habits, rowId: habit.$id,
      data: Object.fromEntries(CACHE_KEYS.map((k) => [k, stats[k]])),
    });
  }
  return stats;
}

export const todayFor = (settings) => todayInTz(settings.timezone);
