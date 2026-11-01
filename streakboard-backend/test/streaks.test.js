import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, isValidDay, addDays, todayInTz, validateCheckinDay } from '../shared/streaks.js';

const T = '2026-10-31';
const run = (...d) => d;

test('empty history', () => {
  assert.deepEqual(computeStats([], T), { currentStreak: 0, longestStreak: 0, totalCheckins: 0, lastCheckinDay: null, completion30: 0 });
});
test('today only', () => {
  const s = computeStats([T], T);
  assert.equal(s.currentStreak, 1); assert.equal(s.longestStreak, 1); assert.equal(s.lastCheckinDay, T);
});
test('streak survives until a full day is missed (run ends yesterday)', () => {
  assert.equal(computeStats(run('2026-10-28', '2026-10-29', '2026-10-30'), T).currentStreak, 3);
});
test('streak breaks after a full missed day', () => {
  const s = computeStats(run('2026-10-27', '2026-10-28', '2026-10-29'), T);
  assert.equal(s.currentStreak, 0); assert.equal(s.longestStreak, 3);
});
test('a one-day gap splits runs; longest wins', () => {
  const s = computeStats(run('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24', '2026-10-30', '2026-10-31'), T);
  assert.equal(s.currentStreak, 2); assert.equal(s.longestStreak, 3);
});
test('month and year boundaries', () => {
  assert.equal(computeStats(run('2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'), '2026-01-02').currentStreak, 4);
  assert.equal(computeStats(run('2026-09-30', '2026-10-01'), '2026-10-01').currentStreak, 2);
});
test('leap day', () => {
  assert.equal(computeStats(run('2028-02-28', '2028-02-29', '2028-03-01'), '2028-03-01').currentStreak, 3);
  assert.equal(isValidDay('2028-02-29'), true);
  assert.equal(isValidDay('2026-02-29'), false);
});
test('daylight-saving dates never create or hide a day', () => {
  // US spring-forward 2026-03-08 and fall-back 2026-11-01; EU 2026-03-29 and 2026-10-25.
  for (const [a, b, c] of [['2026-03-07', '2026-03-08', '2026-03-09'], ['2026-10-31', '2026-11-01', '2026-11-02'], ['2026-03-28', '2026-03-29', '2026-03-30'], ['2026-10-24', '2026-10-25', '2026-10-26']]) {
    assert.equal(computeStats([a, b, c], c).currentStreak, 3);
    assert.equal(addDays(a, 1), b); assert.equal(addDays(c, -1), b);
  }
});
test('duplicates and invalid strings are ignored', () => {
  const s = computeStats([T, T, 'garbage', '2026-13-01'], T);
  assert.equal(s.totalCheckins, 1);
});
test('unsorted input is handled', () => {
  assert.equal(computeStats(run('2026-10-31', '2026-10-29', '2026-10-30'), T).currentStreak, 3);
});
test('completion30 counts a 30-day window including today', () => {
  const days = Array.from({ length: 15 }, (_, i) => addDays(T, -i)); // 15 of last 30
  assert.equal(computeStats(days, T).completion30, 0.5);
  assert.equal(computeStats([addDays(T, -30)], T).completion30, 0); // day 31 back is outside
});
test('todayInTz uses the user calendar, not the server clock (midnight edge)', () => {
  const now = new Date('2026-10-31T19:00:00Z'); // 00:30 on 1 Nov in Kolkata (UTC+5:30)
  assert.equal(todayInTz('Asia/Kolkata', now), '2026-11-01');
  assert.equal(todayInTz('UTC', now), '2026-10-31');
  assert.equal(todayInTz('America/Los_Angeles', now), '2026-10-31');
  assert.equal(todayInTz('Not/AZone', now), '2026-10-31'); // falls back to UTC
});
test('validateCheckinDay: future, window edge, malformed', () => {
  assert.equal(validateCheckinDay('2026-11-01', T).status, 422);
  assert.equal(validateCheckinDay(T, T), null);
  assert.equal(validateCheckinDay('2026-10-24', T), null);        // exactly 7 days back
  assert.equal(validateCheckinDay('2026-10-23', T).status, 422);  // 8 days back
  assert.equal(validateCheckinDay('31/10/2026', T).status, 400);
  assert.equal(validateCheckinDay('2026-10-30', T, 0).status, 422); // custom window
});
