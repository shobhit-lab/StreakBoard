// Minimal in-memory TablesDB + SDK fakes, enough to exercise the handlers offline.
export const sdk = {
  Query: {
    equal: (a, v) => ({ m: 'equal', a, v }), limit: (n) => ({ m: 'limit', n }),
    cursorAfter: (id) => ({ m: 'cursorAfter', id }), orderAsc: (a) => ({ m: 'orderAsc', a }),
    select: (a) => ({ m: 'select', a }),
  },
  Permission: { read: (r) => `read(${r})`, update: (r) => `update(${r})`, delete: (r) => `delete(${r})` },
  Role: { user: (id) => `user:${id}` },
};
const err = (code, message) => Object.assign(new Error(message), { code });

export function fakeDb() {
  const t = {}; // tableId -> Map(rowId -> row)
  const table = (id) => (t[id] ??= new Map());
  const uniq = { checkins: ['habitId', 'day'] };
  const db = {
    tables: t,
    async getRow({ tableId, rowId }) { const r = table(tableId).get(rowId); if (!r) throw err(404, 'not found'); return { ...r }; },
    async createRow({ tableId, rowId, data, permissions }) {
      if (table(tableId).has(rowId)) throw err(409, 'exists');
      const u = uniq[tableId];
      if (u && [...table(tableId).values()].some((r) => u.every((k) => r[k] === data[k]))) throw err(409, 'unique');
      const row = { $id: rowId, $permissions: permissions, ...data }; table(tableId).set(rowId, row); return { ...row };
    },
    async updateRow({ tableId, rowId, data }) { const r = await db.getRow({ tableId, rowId }); const n = { ...table(tableId).get(rowId), ...data }; table(tableId).set(rowId, n); return { ...r, ...data }; },
    async deleteRow({ tableId, rowId }) { if (!table(tableId).delete(rowId)) throw err(404, 'not found'); },
    async listRows({ tableId, queries = [] }) {
      let rows = [...table(tableId).values()];
      for (const q of queries) if (q.m === 'equal') rows = rows.filter((r) => r[q.a] === q.v);
      const ord = queries.find((q) => q.m === 'orderAsc');
      if (ord) rows.sort((a, b) => (a[ord.a] < b[ord.a] ? -1 : 1));
      const total = rows.length;
      const cur = queries.find((q) => q.m === 'cursorAfter');
      if (cur) rows = rows.slice(rows.findIndex((r) => r.$id === cur.id) + 1);
      const lim = queries.find((q) => q.m === 'limit')?.n ?? 25;
      return { total, rows: rows.slice(0, lim).map((r) => ({ ...r })) };
    },
  };
  return db;
}

export function ctx({ userId, body, headers = {} }) {
  const out = {};
  return {
    out,
    req: { headers: { ...(userId ? { 'x-appwrite-user-id': userId } : {}), ...headers }, bodyJson: body },
    res: { json: (b, status = 200) => Object.assign(out, { body: b, status }) },
    log: () => {}, error: () => {},
  };
}
