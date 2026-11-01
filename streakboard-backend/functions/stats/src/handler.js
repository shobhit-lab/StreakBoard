import { DB, T, PAGE, MAX_ACTIVE_HABITS, callerId, loadOwnedHabit, getSettings, refreshHabitStats, todayFor } from './shared/lib.js';

/** POST { habitId? } -> { stats: [{ habitId, ...stats }] }. No id = all active habits. */
export async function handle({ req, res, error }, { db, sdk }) {
  const userId = callerId(req);
  if (!userId) return res.json({ error: 'Unauthenticated' }, 401);
  const { habitId } = req.bodyJson ?? {};
  if (habitId !== undefined && typeof habitId !== 'string') return res.json({ error: 'habitId must be a string' }, 400);

  try {
    const today = todayFor(await getSettings(db, sdk, userId));
    let habits;
    if (habitId) {
      const h = await loadOwnedHabit(db, habitId, userId);
      if (!h) return res.json({ error: 'Habit not found' }, 404);
      habits = [h];
    } else {
      ({ rows: habits } = await db.listRows({
        databaseId: DB, tableId: T.habits,
        queries: [sdk.Query.equal('userId', userId), sdk.Query.equal('archived', false),
          sdk.Query.limit(Math.min(PAGE, MAX_ACTIVE_HABITS))],
      }));
    }

    const stats = [];
    for (let i = 0; i < habits.length; i += 5) { // small batches keep us inside rate limits
      const batch = await Promise.all(habits.slice(i, i + 5).map(async (h) => ({
        habitId: h.$id, ...(await refreshHabitStats(db, sdk, h, today)),
      })));
      stats.push(...batch);
    }
    return res.json({ today, stats });
  } catch (e) {
    error?.(`stats failed: ${e?.message ?? e}`);
    return res.json({ error: 'Internal error' }, 500);
  }
}
