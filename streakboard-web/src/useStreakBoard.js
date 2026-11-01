import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { addDays, browserTimeZone, displayStreak, isValidTimeZone, todayInTz } from './dates.js';

export const HEATMAP_DAYS = 90;
export const PENDING = '__pending__'; // placeholder row id while a check-in is in flight

/* The session + settings step runs once per page load, even if React mounts the
   effect twice, so a first visit can never create two anonymous sessions. */
let sessionPromise = null;
async function bootSession() {
  const user = await api.startSession();

  let settings = { timezone: 'UTC', backfillDays: 7 };
  let settingsFailed = false;
  try {
    const row = await api.ensureSettings(user.$id, browserTimeZone());
    settings = {
      timezone: isValidTimeZone(row.timezone) ? row.timezone : 'UTC', // same fallback as the server
      backfillDays: Number.isInteger(row.backfillDays) ? Math.min(Math.max(row.backfillDays, 0), 7) : 7,
    };
  } catch {
    settingsFailed = true; // the server falls back to UTC too, so stay consistent with it
  }
  return { user, settings, settingsFailed };
}

/** Habits plus the last 90 days of check-ins. Always fetched fresh. */
async function fetchLists(userId, timezone) {
  const from = addDays(todayInTz(timezone), -(HEATMAP_DAYS - 1));
  const [habits, checkins] = await Promise.all([api.listHabits(userId), api.listCheckins(userId, from)]);
  return { habits, marks: groupMarks(checkins) };
}

const groupMarks = (checkins) => {
  const marks = {};
  for (const c of checkins) (marks[c.habitId] ??= {})[c.day] = c.id;
  return marks;
};

const withStats = (habit, s) => ({
  ...habit,
  currentStreak: s.currentStreak,
  longestStreak: s.longestStreak,
  totalCheckins: s.totalCheckins,
  lastCheckinDay: s.lastCheckinDay,
});

/** Optimistic numbers for a new check-in. The server's stats replace them. */
function afterCheckin(h, day, today) {
  const last = !h.lastCheckinDay || day > h.lastCheckinDay ? day : h.lastCheckinDay;
  const next = { ...h, totalCheckins: h.totalCheckins + 1, lastCheckinDay: last };
  if (day !== today) return next;
  const current = displayStreak(h, today) + 1;
  return { ...next, currentStreak: current, longestStreak: Math.max(h.longestStreak, current) };
}

/** Optimistic numbers for an undo. A refreshed `stats` call replaces them. */
function afterUndo(h, day, today, remainingDays) {
  const last = h.lastCheckinDay === day ? remainingDays.sort().at(-1) ?? null : h.lastCheckinDay;
  return {
    ...h,
    totalCheckins: Math.max(0, h.totalCheckins - 1),
    lastCheckinDay: last,
    currentStreak: day === today ? Math.max(0, displayStreak(h, today) - 1) : h.currentStreak,
  };
}

export function useStreakBoard() {
  const [status, setStatus] = useState(api.configError ? 'error' : 'loading'); // loading | ready | error
  const [fatal, setFatal] = useState(api.configError);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({ timezone: browserTimeZone(), backfillDays: 7 });
  const [habits, setHabits] = useState([]);
  const [marks, setMarks] = useState({}); // habitId -> { [day]: checkinRowId }
  const [busy, setBusy] = useState({});   // habitId -> true while a request is in flight
  const [today, setToday] = useState(() => todayInTz(browserTimeZone()));
  const [toasts, setToasts] = useState([]);

  // Latest values for async callbacks, which would otherwise close over stale state.
  const live = useRef({});
  live.current = { habits, marks, busy, today, settings, user };
  const toastId = useRef(0);

  const toast = useCallback((message, { tone = 'info', action } = {}) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 5000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      sessionPromise ??= bootSession();
      const session = await sessionPromise;
      const tz = session.settings.timezone;
      const lists = await fetchLists(session.user.$id, tz);
      setUser(session.user);
      setSettings(session.settings);
      setToday(todayInTz(tz));
      setHabits(lists.habits);
      setMarks(lists.marks);
      setFatal(null);
      setStatus('ready');
      if (session.settingsFailed) {
        toast("Couldn't save your time zone, so check-ins count in UTC until it's saved.", { tone: 'error' });
      }

      // A cached streak that already ended is repaired in the background.
      const yesterday = addDays(todayInTz(tz), -1);
      if (lists.habits.some((h) => h.currentStreak > 0 && (!h.lastCheckinDay || h.lastCheckinDay < yesterday))) {
        api.refreshStats().then((stats) => {
          const byId = Object.fromEntries(stats.map((x) => [x.habitId, x]));
          setHabits((hs) => hs.map((h) => (byId[h.id] ? withStats(h, byId[h.id]) : h)));
        }).catch(() => {});
      }
    } catch (e) {
      sessionPromise = null; // allow "Try again" to start over
      setFatal(e.message);
      setStatus('error');
    }
  }, [toast]);

  /** Quietly re-fetch habits and check-ins (no loading screen). */
  const refreshLists = useCallback(async () => {
    const { user, settings } = live.current;
    if (!user) return;
    try {
      const lists = await fetchLists(user.$id, settings.timezone);
      setHabits(lists.habits);
      setMarks(lists.marks);
    } catch { /* keep what is on screen */ }
  }, []);

  useEffect(() => {
    if (!api.configError) load();
  }, [load]);

  // Keep "today" right if the tab stays open across midnight.
  useEffect(() => {
    const tick = () => setToday(todayInTz(live.current.settings.timezone));
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const fail = useCallback((e) => {
    toast(e.message, { tone: 'error' });
    if (e.status === 404) refreshLists(); // the habit is gone: refresh the list
  }, [toast, refreshLists]);

  const setBusyFor = (id, on) => setBusy((b) => ({ ...b, [id]: on }));

  const addHabit = useCallback(async ({ name, emoji }) => {
    try {
      const habit = await api.createHabit({ name, emoji });
      setHabits((hs) => [...hs, habit]);
      setMarks((m) => ({ ...m, [habit.id]: {} }));
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }, [fail]);

  /** Check in (today when `day` is omitted), updating the UI before the server answers. */
  const checkIn = useCallback(async (habit, day) => {
    const { today, marks, habits, busy } = live.current;
    const id = habit.id;
    const target = day ?? today;
    if (busy[id] || marks[id]?.[target]) return;

    const before = { habit: habits.find((h) => h.id === id), marks: marks[id] ?? {} };
    setBusyFor(id, true);
    setMarks((m) => ({ ...m, [id]: { ...before.marks, [target]: PENDING } }));
    setHabits((hs) => hs.map((h) => (h.id === id ? afterCheckin(h, target, today) : h)));
    try {
      const res = await api.checkIn(id, day);
      setMarks((m) => {
        const cur = { ...m[id] };
        delete cur[target];
        cur[res.checkin.day] = res.checkin.$id;
        return { ...m, [id]: cur };
      });
      setHabits((hs) => hs.map((h) => (h.id === id ? withStats(h, res.stats) : h)));
    } catch (e) {
      setMarks((m) => ({ ...m, [id]: before.marks }));
      setHabits((hs) => hs.map((h) => (h.id === id ? before.habit : h)));
      fail(e);
    } finally {
      setBusyFor(id, false);
    }
  }, [fail]);

  /** Undo a check-in by deleting its row, then ask `stats` for the true numbers. */
  const undo = useCallback(async (habit, day) => {
    const { today, marks, habits, busy } = live.current;
    const id = habit.id;
    const rowId = marks[id]?.[day];
    if (!rowId || rowId === PENDING || busy[id]) return;

    const before = { habit: habits.find((h) => h.id === id), marks: marks[id] };
    const rest = { ...before.marks };
    delete rest[day];
    setBusyFor(id, true);
    setMarks((m) => ({ ...m, [id]: rest }));
    setHabits((hs) => hs.map((h) => (h.id === id ? afterUndo(h, day, today, Object.keys(rest)) : h)));
    try {
      await api.undoCheckin(rowId);
    } catch (e) {
      setMarks((m) => ({ ...m, [id]: before.marks }));
      setHabits((hs) => hs.map((h) => (h.id === id ? before.habit : h)));
      fail(e);
      setBusyFor(id, false);
      return;
    }
    try {
      const [s] = await api.refreshStats(id);
      if (s) setHabits((hs) => hs.map((h) => (h.id === id ? withStats(h, s) : h)));
    } catch { /* the cascade function also refreshes the cache */ }
    setBusyFor(id, false);
  }, [fail]);

  const rename = useCallback(async (habit, name) => {
    const next = name.trim();
    if (!next || next.length > 80) return false;
    if (next === habit.name) return true;
    setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, name: next } : h)));
    try {
      await api.renameHabit(habit.id, next);
      return true;
    } catch (e) {
      setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, name: habit.name } : h)));
      fail(e);
      return false;
    }
  }, [fail]);

  const unarchive = useCallback(async (habit) => {
    try {
      await api.setArchived(habit.id, false);
      setHabits((hs) => [...hs, habit].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const archive = useCallback(async (habit) => {
    setHabits((hs) => hs.filter((h) => h.id !== habit.id));
    try {
      await api.setArchived(habit.id, true);
      toast(`Archived ${habit.name}.`, { action: { label: 'Undo', run: () => unarchive(habit) } });
    } catch (e) {
      setHabits((hs) => [...hs, habit].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      fail(e);
    }
  }, [fail, toast, unarchive]);

  const exportData = useCallback(async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `streakboard-export-${live.current.today}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(data.truncated ? 'Exported, but the file was cut off at 50,000 rows.' : 'Export downloaded.');
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  /** Throws an ApiError with a readable message so the form can show it inline. */
  const upgrade = useCallback(async (email, password) => {
    const updated = await api.upgradeToEmail(email, password);
    setUser(updated);
    toast('Account created. Your habits now belong to it.');
  }, [toast]);

  return {
    status, fatal, user, settings, habits, marks, busy, today, toasts,
    isAnonymous: api.isAnonymous(user),
    retry: load, dismissToast, addHabit, checkIn, undo, rename, archive, exportData, upgrade,
  };
}
