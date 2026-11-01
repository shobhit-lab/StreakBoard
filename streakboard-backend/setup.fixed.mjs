// Creates the StreakBoard database, tables, columns, indexes and permissions.
// Idempotent: safe to re-run (409 "already exists" is treated as success).
//   APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... node setup.mjs
// API key scopes needed: databases.write, tables.write, columns.write, indexes.write, (+ read variants)
import * as sdk from 'node-appwrite';
const { Client, TablesDB, Permission, Role } = sdk;
const IndexType = sdk.IndexType ?? sdk.TablesDBIndexType;

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY'); process.exit(1);
}
const db = new TablesDB(new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY));
const databaseId = 'streakboard';

const ensure = async (label, fn) => {
  try { await fn(); console.log('  created', label); }
  catch (e) { if (e.code === 409) console.log('  exists ', label); else { console.error('  FAILED ', label, e.message); throw e; } }
};

async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await db.listColumns({ databaseId, tableId });
    if (columns.every((c) => c.status === 'available')) return;
    if (columns.some((c) => c.status === 'failed')) throw new Error(`column failed on ${tableId}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${tableId} columns`);
}

const str = (tableId, key, size, required = false, xdefault) =>
  ensure(`${tableId}.${key}`, () => db.createStringColumn({ databaseId, tableId, key, size, required, ...(xdefault !== undefined && { xdefault }) }));
const int = (tableId, key, min, max, xdefault) =>
  ensure(`${tableId}.${key}`, () => db.createIntegerColumn({ databaseId, tableId, key, required: false, min, max, xdefault }));
const index = (tableId, key, type, columns) =>
  ensure(`index ${tableId}.${key}`, () => db.createIndex({ databaseId, tableId, key, type, columns, orders: columns.map(() => 'ASC') }));

const KEY = IndexType?.Key ?? 'key';
const UNIQUE = IndexType?.Unique ?? 'unique';

console.log('database');
await ensure('streakboard', () => db.create({ databaseId, name: 'StreakBoard' }));

// Table-level permissions are empty on purpose. With rowSecurity on, access is granted per row
// to the owner. Habits and check-ins are created only by Functions (limits + validation),
// which is the end state of PRD section 10, step 5, applied from day one.
console.log('habits');
await ensure('table habits', () => db.createTable({ databaseId, tableId: 'habits', name: 'Habits', permissions: [], rowSecurity: true }));
await str('habits', 'userId', 36, true);
await str('habits', 'name', 80, true);
await str('habits', 'emoji', 8, false, '✅');
await ensure('habits.frequency', () => db.createEnumColumn({ databaseId, tableId: 'habits', key: 'frequency', elements: ['daily'], required: false, xdefault: 'daily' }));
await ensure('habits.archived', () => db.createBooleanColumn({ databaseId, tableId: 'habits', key: 'archived', required: false, xdefault: false }));
await int('habits', 'currentStreak', 0, 100000, 0);
await int('habits', 'longestStreak', 0, 100000, 0);
await int('habits', 'totalCheckins', 0, 1000000, 0);
await str('habits', 'lastCheckinDay', 10, false);
await waitForColumns('habits');
await index('habits', 'by_user', KEY, ['userId']);
await index('habits', 'by_user_archived', KEY, ['userId', 'archived']);

console.log('checkins');
await ensure('table checkins', () => db.createTable({ databaseId, tableId: 'checkins', name: 'Check-ins', permissions: [], rowSecurity: true }));
await str('checkins', 'habitId', 36, true);
await str('checkins', 'userId', 36, true);
await str('checkins', 'day', 10, true);
await str('checkins', 'note', 280, false);
await waitForColumns('checkins');
await index('checkins', 'uniq_habit_day', UNIQUE, ['habitId', 'day']); // FR-C2 at the database level
await index('checkins', 'by_user_day', KEY, ['userId', 'day']);
await index('checkins', 'by_habit', KEY, ['habitId']);

console.log('user_settings');
await ensure('table user_settings', () => db.createTable({ databaseId, tableId: 'user_settings', name: 'User settings', permissions: [Permission.create(Role.users())], rowSecurity: true }));
await str('user_settings', 'userId', 36, true);
await str('user_settings', 'timezone', 64, false, 'UTC');
await int('user_settings', 'backfillDays', 0, 7, 7);
await waitForColumns('user_settings');
await index('user_settings', 'uniq_user', UNIQUE, ['userId']);

console.log('\nSchema ready. Next: npm run deploy, then add the event triggers (see README).');
