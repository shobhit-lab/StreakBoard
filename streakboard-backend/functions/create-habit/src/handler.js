import { ID } from './shared/ids.js';
import { DB, T, MAX_ACTIVE_HABITS, callerId, ownerPermissions } from './shared/lib.js';

/** POST { name, emoji?, frequency? } -> habit. Enforces FR-H1 and FR-H5 server-side. */
export async function handle({ req, res, error }, { db, sdk }) {
  const userId = callerId(req);
  if (!userId) return res.json({ error: 'Unauthenticated' }, 401);

  const body = req.bodyJson ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const emoji = body.emoji === undefined ? '✅' : body.emoji;
  const frequency = body.frequency ?? 'daily';
  if (name.length < 1 || name.length > 80) return res.json({ error: 'name must be 1 to 80 characters' }, 400);
  if (typeof emoji !== 'string' || emoji.length < 1 || emoji.length > 8) return res.json({ error: 'emoji must be 1 to 8 characters' }, 400);
  if (frequency !== 'daily') return res.json({ error: 'frequency must be "daily"' }, 400);

  try {
    const { total } = await db.listRows({
      databaseId: DB, tableId: T.habits,
      queries: [sdk.Query.equal('userId', userId), sdk.Query.equal('archived', false), sdk.Query.limit(1)],
    });
    if (total >= MAX_ACTIVE_HABITS) return res.json({ error: `Limit of ${MAX_ACTIVE_HABITS} active habits reached` }, 422);

    const habit = await db.createRow({
      databaseId: DB, tableId: T.habits, rowId: ID.unique(),
      data: { userId, name, emoji, frequency, archived: false,
        currentStreak: 0, longestStreak: 0, totalCheckins: 0, lastCheckinDay: null },
      permissions: ownerPermissions(sdk, userId),
    });
    return res.json(habit, 201);
  } catch (e) {
    error?.(`create-habit failed: ${e?.message ?? e}`);
    return res.json({ error: 'Internal error' }, 500);
  }
}
