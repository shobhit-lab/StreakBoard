import { DB, T, PAGE, isNotFound, getSettings, refreshHabitStats, todayFor } from './shared/lib.js';

/** Delete every row in `table` where `column` equals `value`, page by page. Idempotent. */
export async function purge(db, sdk, table, column, value) {
  let deleted = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const { rows } = await db.listRows({
      databaseId: DB, tableId: table,
      queries: [sdk.Query.equal(column, value), sdk.Query.select(['$id']), sdk.Query.limit(PAGE)],
    });
    if (!rows.length) break;
    for (let i = 0; i < rows.length; i += 10) {
      await Promise.all(rows.slice(i, i + 10).map(async (r) => {
        try { await db.deleteRow({ databaseId: DB, tableId: table, rowId: r.$id }); deleted++; }
        catch (e) { if (!isNotFound(e)) throw e; }
      }));
    }
  }
  return deleted;
}

/**
 * Event-driven. Routes on the x-appwrite-event header:
 *   habits row delete   -> delete that habit's check-ins          (FR-H4)
 *   checkins row delete -> rebuild the habit's cached stats       (keeps undo consistent)
 *   users delete        -> delete all of the user's rows          (FR-D2)
 */
export async function handle({ req, res, log, error }, { db, sdk }) {
  const event = req.headers?.['x-appwrite-event'] ?? '';
  const row = req.bodyJson ?? {};
  try {
    if (/\.tables\.habits\.rows\..+\.delete$/.test(event)) {
      const deleted = await purge(db, sdk, T.checkins, 'habitId', row.$id);
      return res.json({ action: 'habit-cascade', habitId: row.$id, deleted });
    }
    if (/\.tables\.checkins\.rows\..+\.delete$/.test(event)) {
      let habit;
      try { habit = await db.getRow({ databaseId: DB, tableId: T.habits, rowId: row.habitId }); }
      catch (e) { if (isNotFound(e)) return res.json({ action: 'skip', reason: 'habit gone' }); throw e; }
      const settings = await getSettings(db, sdk, habit.userId);
      const stats = await refreshHabitStats(db, sdk, habit, todayFor(settings));
      return res.json({ action: 'stats-refresh', habitId: habit.$id, stats });
    }
    if (/^users\..+\.delete$/.test(event)) {
      const userId = row.$id;
      const out = {
        checkins: await purge(db, sdk, T.checkins, 'userId', userId),
        habits: await purge(db, sdk, T.habits, 'userId', userId),
        settings: await purge(db, sdk, T.settings, 'userId', userId),
      };
      log?.(`account cascade for ${userId}: ${JSON.stringify(out)}`);
      return res.json({ action: 'account-cascade', userId, deleted: out });
    }
    return res.json({ action: 'ignored', event }, 202);
  } catch (e) {
    error?.(`cascade failed (${event}): ${e?.message ?? e}`);
    return res.json({ error: 'Internal error' }, 500); // non-2xx so the run is visible; safe to re-run
  }
}
