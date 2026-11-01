import { DB, T, PAGE, callerId } from './shared/lib.js';

export const EXPORT_CAP = 50_000;

const clean = (row) => {
  const out = { id: row.$id, createdAt: row.$createdAt };
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('$')) out[k] = v;
  return out;
};

async function collect(db, sdk, tableId, userId, orderColumn, budget) {
  const { Query } = sdk;
  const out = [];
  let cursor = null;
  while (out.length < budget) {
    const queries = [Query.equal('userId', userId), Query.limit(Math.min(PAGE, budget - out.length))];
    if (orderColumn) queries.push(Query.orderAsc(orderColumn));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const { rows } = await db.listRows({ databaseId: DB, tableId, queries });
    out.push(...rows);
    if (rows.length < PAGE) return { rows: out, truncated: false };
    cursor = rows[rows.length - 1].$id;
  }
  return { rows: out, truncated: true };
}

/** FR-D1. Returns exactly the caller's rows, never anyone else's. */
export async function handle({ req, res, error }, { db, sdk }) {
  const userId = callerId(req);
  if (!userId) return res.json({ error: 'Unauthenticated' }, 401);
  try {
    const habits = await collect(db, sdk, T.habits, userId, null, EXPORT_CAP);
    const checkins = await collect(db, sdk, T.checkins, userId, 'day', EXPORT_CAP - habits.rows.length);
    return res.json({
      exportedAt: new Date().toISOString(),
      truncated: habits.truncated || checkins.truncated,
      habits: habits.rows.map(clean),
      checkins: checkins.rows.map(clean),
    });
  } catch (e) {
    error?.(`export failed: ${e?.message ?? e}`);
    return res.json({ error: 'Internal error' }, 500);
  }
}
