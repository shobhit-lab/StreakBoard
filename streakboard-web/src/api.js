// Everything that talks to Appwrite lives here. No API keys: the browser only
// holds a user session. Habits and check-ins are created by Functions only.
import { Client, Account, TablesDB, Functions, Query, Permission, Role, ID } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

export const configError =
  !endpoint || !projectId
    ? 'StreakBoard needs VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID. Copy .env.example to .env, fill both in, then restart the dev server.'
    : null;

const DB = 'streakboard';
const T = { habits: 'habits', checkins: 'checkins', settings: 'user_settings' };
const PAGE = 100;

let account, tablesDB, functions;
if (!configError) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId);
  account = new Account(client);
  tablesDB = new TablesDB(client);
  functions = new Functions(client);
}

/* ---------- errors ---------- */

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const sentence = (s) => {
  const t = String(s ?? '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '';
};

function friendly(status, serverMessage) {
  switch (status) {
    case 400: return `That request wasn't accepted. ${sentence(serverMessage)}`.trim();
    case 401: return 'Your session has ended. Reload the page to start a new one.';
    case 404: return "That habit doesn't exist anymore. Your list has been refreshed.";
    case 409: return sentence(serverMessage) || 'That already exists.';
    case 422: return sentence(serverMessage) || "That can't be done right now.";
    case 429: return 'Too many requests. Wait a few seconds and try again.';
    default: return 'StreakBoard hit a server problem. Try again in a moment.';
  }
}

/** Turn anything thrown by the SDK into an ApiError with a readable message. */
function fromException(e) {
  if (e instanceof ApiError) return e;
  if (!e?.code) return new ApiError("Can't reach StreakBoard. Check your connection and try again.", 0);
  if (e.code === 404 && /^(database|table|collection)_/.test(e.type ?? '')) {
    return new ApiError('The StreakBoard database or tables were not found. Run the backend setup and check your project ID.', 503);
  }
  return new ApiError(friendly(e.code, e.message), e.code);
}

const guard = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    throw fromException(e);
  }
};

/* ---------- functions ---------- */

/**
 * Run a Function synchronously. A Function's own 400/404/422 arrive as
 * execution.responseStatusCode (not as a thrown error), so check it.
 */
async function call(functionId, payload) {
  let exec;
  try {
    exec = await functions.createExecution({
      functionId,
      body: JSON.stringify(payload ?? {}),
      async: false,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    if (e?.code === 404 || String(e?.type ?? '').startsWith('function_')) {
      throw new ApiError(`The "${functionId}" function isn't available. Check that the backend is deployed.`, 503);
    }
    throw fromException(e);
  }

  let body = null;
  try {
    body = exec.responseBody ? JSON.parse(exec.responseBody) : null;
  } catch { /* non-JSON body */ }

  const status = exec.responseStatusCode;
  if (exec.status !== 'completed' || !status || status >= 400) {
    throw new ApiError(friendly(status || 500, body?.error), status || 500);
  }
  return body;
}

/* ---------- mapping ---------- */

const toHabit = (row) => ({
  id: row.$id,
  name: row.name,
  emoji: row.emoji || '✅',
  currentStreak: row.currentStreak ?? 0,
  longestStreak: row.longestStreak ?? 0,
  totalCheckins: row.totalCheckins ?? 0,
  lastCheckinDay: row.lastCheckinDay ?? null,
  createdAt: row.$createdAt ?? '',
});

/* ---------- session & settings ---------- */

/** Reuse the existing session, or create an anonymous one on first visit. */
export const startSession = guard(async () => {
  try {
    return await account.get();
  } catch (e) {
    if (e?.code !== 401) throw e; // only a missing session means "first visit"
  }
  await account.createAnonymousSession();
  return account.get();
});

export const isAnonymous = (user) => !user?.email;

/** Create the user's settings row once (owner-only), or return the existing one. */
export const ensureSettings = guard(async (userId, timezone) => {
  const queries = [Query.equal('userId', userId), Query.limit(1)];
  const find = async () =>
    (await tablesDB.listRows({ databaseId: DB, tableId: T.settings, queries })).rows[0];

  const existing = await find();
  if (existing) return existing;
  try {
    return await tablesDB.createRow({
      databaseId: DB,
      tableId: T.settings,
      rowId: ID.unique(),
      data: { userId, timezone },
      permissions: [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))],
    });
  } catch (e) {
    if (e?.code === 409) { // another tab created it first
      const row = await find();
      if (row) return row;
    }
    throw e;
  }
});

/** Anonymous -> email account. Keeps the same user id, so all data stays. */
export async function upgradeToEmail(email, password) {
  try {
    await account.updateEmail({ email, password });
    return await account.get();
  } catch (e) {
    if (e?.code === 409) throw new ApiError('That email already belongs to another account.', 409);
    if (e?.code === 400) throw new ApiError('Enter a valid email and a password of at least 8 characters.', 400);
    throw fromException(e);
  }
}

/* ---------- habits & check-ins ---------- */

export const listHabits = guard(async (userId) => {
  const { rows } = await tablesDB.listRows({
    databaseId: DB,
    tableId: T.habits,
    queries: [
      Query.equal('userId', userId), Query.equal('archived', false),
      Query.orderAsc('$createdAt'), Query.limit(PAGE),
    ],
  });
  return rows.map(toHabit);
});

/** Check-ins since `from`, cursor-paginated. Returns [{ id, habitId, day }]. */
export const listCheckins = guard(async (userId, from) => {
  const out = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('userId', userId), Query.greaterThanEqual('day', from),
      Query.orderAsc('day'), Query.select(['$id', 'habitId', 'day']), Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const { rows } = await tablesDB.listRows({ databaseId: DB, tableId: T.checkins, queries });
    for (const r of rows) out.push({ id: r.$id, habitId: r.habitId, day: r.day });
    if (rows.length < PAGE) return out;
    cursor = rows[rows.length - 1].$id;
  }
});

export const createHabit = guard(async ({ name, emoji }) => toHabit(await call('create-habit', { name, emoji })));

/** `day` is optional; omit it for today and the server uses the user's time zone. */
export const checkIn = guard((habitId, day) => call('checkin', day ? { habitId, day } : { habitId }));

/** Undo = delete the check-in row. A row that is already gone counts as done. */
export const undoCheckin = guard(async (rowId) => {
  try {
    await tablesDB.deleteRow({ databaseId: DB, tableId: T.checkins, rowId });
  } catch (e) {
    if (e?.code !== 404) throw e;
  }
});

/** Recompute (and repair) cached stats. One habit, or all active habits. */
export const refreshStats = guard(async (habitId) => (await call('stats', habitId ? { habitId } : {})).stats);

export const renameHabit = guard((habitId, name) =>
  tablesDB.updateRow({ databaseId: DB, tableId: T.habits, rowId: habitId, data: { name } }));

export const setArchived = guard((habitId, archived) =>
  tablesDB.updateRow({ databaseId: DB, tableId: T.habits, rowId: habitId, data: { archived } }));

export const exportData = guard(() => call('export', {}));
