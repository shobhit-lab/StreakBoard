import test from 'node:test';
import assert from 'node:assert/strict';
import { sdk, fakeDb, ctx } from './fakes.js';
import { handle as checkin } from '../functions/checkin/src/handler.js';
import { handle as stats } from '../functions/stats/src/handler.js';
import { handle as cascade } from '../functions/cascade/src/handler.js';
import { handle as exportAll } from '../functions/export/src/handler.js';
import { handle as createHabit } from '../functions/create-habit/src/handler.js';
import { todayInTz, addDays } from '../shared/streaks.js';

const today = () => todayInTz('UTC');
const call = async (fn, db, c) => { await fn(c, { db, sdk }); return c.out; };
async function makeHabit(db, userId, name = 'Read') {
  return (await call(createHabit, db, ctx({ userId, body: { name } }))).body;
}

test('check-in creates a row, updates cached stats, owner-only permissions', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const r = await call(checkin, db, ctx({ userId: 'alice', body: { habitId: h.$id } }));
  assert.equal(r.status, 201);
  assert.equal(r.body.stats.currentStreak, 1);
  assert.deepEqual(r.body.checkin.$permissions, ['read(user:alice)', 'update(user:alice)', 'delete(user:alice)']);
  assert.equal(db.tables.habits.get(h.$id).currentStreak, 1);
});

test('idempotency: parallel check-ins for the same habit+day produce one row', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const results = await Promise.all(Array.from({ length: 5 }, () => call(checkin, db, ctx({ userId: 'alice', body: { habitId: h.$id } }))));
  assert.equal(db.tables.checkins.size, 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
});

test('validation: future, too old, malformed, bad note', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const send = (body) => call(checkin, db, ctx({ userId: 'alice', body: { habitId: h.$id, ...body } }));
  assert.equal((await send({ day: addDays(today(), 1) })).status, 422);
  assert.equal((await send({ day: addDays(today(), -8) })).status, 422);
  assert.equal((await send({ day: addDays(today(), -7) })).status, 201);
  assert.equal((await send({ day: '2026-02-30' })).status, 400);
  assert.equal((await send({ note: 'x'.repeat(281) })).status, 400);
});

test('authorization: user B cannot check in on, or learn about, user A\'s habit', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const theirs = await call(checkin, db, ctx({ userId: 'bob', body: { habitId: h.$id } }));
  const missing = await call(checkin, db, ctx({ userId: 'bob', body: { habitId: 'doesnotexist' } }));
  assert.equal(theirs.status, 404);
  assert.deepEqual(theirs, missing); // identical responses: no existence leak
  assert.equal(db.tables.checkins?.size ?? 0, 0);
  assert.equal((await call(checkin, db, ctx({ body: { habitId: h.$id } }))).status, 401);
  assert.equal((await call(stats, db, ctx({ userId: 'bob', body: { habitId: h.$id } }))).status, 404);
});

test('a userId in the body is ignored (identity comes from headers)', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const r = await call(checkin, db, ctx({ userId: 'bob', body: { habitId: h.$id, userId: 'alice' } }));
  assert.equal(r.status, 404);
});

test('limits: the 51st active habit is rejected; archived do not count', async () => {
  const db = fakeDb();
  for (let i = 0; i < 50; i++) assert.equal((await call(createHabit, db, ctx({ userId: 'alice', body: { name: `h${i}` } }))).status, 201);
  assert.equal((await call(createHabit, db, ctx({ userId: 'alice', body: { name: 'one too many' } }))).status, 422);
  assert.equal((await call(createHabit, db, ctx({ userId: 'bob', body: { name: 'fine' } }))).status, 201);
  [...db.tables.habits.values()][0].archived = true;
  assert.equal((await call(createHabit, db, ctx({ userId: 'alice', body: { name: 'now fits' } }))).status, 201);
});

test('create-habit validates name and emoji', async () => {
  const db = fakeDb();
  assert.equal((await call(createHabit, db, ctx({ userId: 'a', body: { name: '   ' } }))).status, 400);
  assert.equal((await call(createHabit, db, ctx({ userId: 'a', body: { name: 'x'.repeat(81) } }))).status, 400);
  assert.equal((await call(createHabit, db, ctx({ userId: 'a', body: { name: 'ok', emoji: 'toolongemoji' } }))).status, 400);
  assert.equal((await call(createHabit, db, ctx({ userId: 'a', body: { name: ' ok ' } }))).body.name, 'ok');
});

test('stats paginates: habit with 250 check-ins is fully counted', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  for (let i = 0; i < 250; i++) {
    const day = addDays(today(), -i);
    db.tables.checkins ??= new Map();
    db.tables.checkins.set(`c${i}`, { $id: `c${i}`, habitId: h.$id, userId: 'alice', day });
  }
  const r = await call(stats, db, ctx({ userId: 'alice', body: { habitId: h.$id } }));
  assert.equal(r.body.stats[0].totalCheckins, 250);
  assert.equal(r.body.stats[0].currentStreak, 250);
});

test('stats overwrites a tampered client-side cache', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  db.tables.habits.get(h.$id).currentStreak = 9999;
  await call(stats, db, ctx({ userId: 'alice', body: {} }));
  assert.equal(db.tables.habits.get(h.$id).currentStreak, 0);
});

test('cascade: deleting a habit removes all 250 check-ins (and re-run is a no-op)', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice'); const other = await makeHabit(db, 'alice', 'Other');
  db.tables.checkins = new Map();
  for (let i = 0; i < 250; i++) db.tables.checkins.set(`c${i}`, { $id: `c${i}`, habitId: h.$id, userId: 'alice', day: addDays(today(), -i) });
  db.tables.checkins.set('keep', { $id: 'keep', habitId: other.$id, userId: 'alice', day: today() });
  db.tables.habits.delete(h.$id);
  const ev = { 'x-appwrite-event': `databases.streakboard.tables.habits.rows.${h.$id}.delete` };
  const first = await call(cascade, db, ctx({ headers: ev, body: { $id: h.$id } }));
  assert.equal(first.body.deleted, 250);
  assert.deepEqual([...db.tables.checkins.keys()], ['keep']);
  assert.equal((await call(cascade, db, ctx({ headers: ev, body: { $id: h.$id } }))).body.deleted, 0);
});

test('undo: checkin row delete event rebuilds cached stats', async () => {
  const db = fakeDb(); const h = await makeHabit(db, 'alice');
  const made = await call(checkin, db, ctx({ userId: 'alice', body: { habitId: h.$id } }));
  const id = made.body.checkin.$id;
  db.tables.checkins.delete(id);
  await call(cascade, db, ctx({ headers: { 'x-appwrite-event': `databases.streakboard.tables.checkins.rows.${id}.delete` }, body: { $id: id, habitId: h.$id } }));
  assert.equal(db.tables.habits.get(h.$id).currentStreak, 0);
  assert.equal(db.tables.habits.get(h.$id).lastCheckinDay, null);
});

test('account deletion removes every row for that user only', async () => {
  const db = fakeDb(); const a = await makeHabit(db, 'alice'); const b = await makeHabit(db, 'bob');
  await call(checkin, db, ctx({ userId: 'alice', body: { habitId: a.$id } }));
  await call(checkin, db, ctx({ userId: 'bob', body: { habitId: b.$id } }));
  const r = await call(cascade, db, ctx({ headers: { 'x-appwrite-event': 'users.alice.delete' }, body: { $id: 'alice' } }));
  assert.deepEqual(r.body.deleted, { checkins: 1, habits: 1, settings: 0 });
  assert.equal(db.tables.habits.size, 1); assert.equal(db.tables.checkins.size, 1);
});

test('export contains exactly the caller\'s rows, with internals stripped', async () => {
  const db = fakeDb(); const a = await makeHabit(db, 'alice'); const b = await makeHabit(db, 'bob');
  await call(checkin, db, ctx({ userId: 'alice', body: { habitId: a.$id, note: 'hi' } }));
  await call(checkin, db, ctx({ userId: 'bob', body: { habitId: b.$id } }));
  const r = await call(exportAll, db, ctx({ userId: 'alice', body: {} }));
  assert.equal(r.body.habits.length, 1); assert.equal(r.body.checkins.length, 1);
  assert.equal(r.body.checkins[0].note, 'hi');
  assert.ok(![...r.body.habits, ...r.body.checkins].some((x) => Object.keys(x).some((k) => k.startsWith('$'))));
  assert.equal(r.body.truncated, false);
});
