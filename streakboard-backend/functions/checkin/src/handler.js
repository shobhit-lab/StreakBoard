import { isValidDay, validateCheckinDay } from './shared/streaks.js';
import {
  DB, T, callerId, isConflict, isNotFound, ownerPermissions, checkinRowId,
  loadOwnedHabit, getSettings, refreshHabitStats, todayFor,
} from './shared/lib.js';

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;

/** POST { habitId, day?, note? } -> { checkin, stats, created } */
export async function handle({ req, res, error }, { db, sdk }) {
  const userId = callerId(req);
  if (!userId) return res.json({ error: 'Unauthenticated' }, 401);

  const { habitId, day, note } = req.bodyJson ?? {};
  if (typeof habitId !== 'string' || !ID_RE.test(habitId)) return res.json({ error: 'habitId is required' }, 400);
  if (day !== undefined && !isValidDay(day)) return res.json({ error: 'day must be a valid YYYY-MM-DD date' }, 400);
  if (note !== undefined && (typeof note !== 'string' || note.length > 280)) {
    return res.json({ error: 'note must be a string of at most 280 characters' }, 400);
  }

  try {
    const habit = await loadOwnedHabit(db, habitId, userId);
    if (!habit) return res.json({ error: 'Habit not found' }, 404);
    if (habit.archived) return res.json({ error: 'Habit is archived' }, 422);

    const settings = await getSettings(db, sdk, userId);
    const today = todayFor(settings);
    const target = day ?? today;
    const invalid = validateCheckinDay(target, today, settings.backfillDays);
    if (invalid) return res.json({ error: invalid.message }, invalid.status);

    const rowId = checkinRowId(habitId, target);
    let checkin, created = true;
    try {
      checkin = await db.createRow({
        databaseId: DB, tableId: T.checkins, rowId,
        data: { habitId, userId, day: target, ...(note ? { note } : {}) },
        permissions: ownerPermissions(sdk, userId),
      });
    } catch (e) {
      if (!isConflict(e)) throw e;
      created = false; // FR-C2: idempotent, return the existing row
      try {
        checkin = await db.getRow({ databaseId: DB, tableId: T.checkins, rowId });
      } catch (e2) {
        if (!isNotFound(e2)) throw e2;
        // Conflict came from the unique index on a row with a different id.
        const { rows } = await db.listRows({
          databaseId: DB, tableId: T.checkins,
          queries: [sdk.Query.equal('habitId', habitId), sdk.Query.equal('day', target), sdk.Query.limit(1)],
        });
        checkin = rows[0];
      }
    }

    const stats = await refreshHabitStats(db, sdk, habit, today);
    return res.json({ checkin, stats, created }, created ? 201 : 200);
  } catch (e) {
    error?.(`checkin failed: ${e?.message ?? e}`);
    return res.json({ error: 'Internal error' }, 500);
  }
}
