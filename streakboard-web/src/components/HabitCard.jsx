import { useState } from 'react';
import { displayStreak } from '../dates.js';
import { HEATMAP_DAYS } from '../useStreakBoard.js';
import Heatmap from './Heatmap.jsx';
import { ArchiveIcon, CheckIcon, FlameIcon, PencilIcon } from './Icons.jsx';

export default function HabitCard({ habit, marks, today, backfillDays, busy, onCheckIn, onUndo, onRename, onArchive }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(habit.name);

  const streak = displayStreak(habit, today);
  const doneToday = Boolean(marks[today]);

  const startEdit = () => { setDraft(habit.name); setEditing(true); };
  const save = async (e) => {
    e.preventDefault();
    if (await onRename(habit, draft)) setEditing(false);
  };
  const toggleDay = (day) => (marks[day] ? onUndo(habit, day) : onCheckIn(habit, day === today ? undefined : day));

  return (
    <article className="card">
      <div className="card-head">
        <span className="emoji" aria-hidden="true">{habit.emoji}</span>
        {editing ? (
          <form className="rename" onSubmit={save}>
            <label className="sr" htmlFor={`rename-${habit.id}`}>Habit name</label>
            <input
              id={`rename-${habit.id}`}
              className="input input-card"
              value={draft}
              maxLength={80}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.trim()}>Save</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <h3>{habit.name}</h3>
            <button type="button" className="icon-btn icon-btn-card" onClick={startEdit} aria-label={`Rename ${habit.name}`}><PencilIcon /></button>
            <button type="button" className="icon-btn icon-btn-card" onClick={() => onArchive(habit)} aria-label={`Archive ${habit.name}`}><ArchiveIcon /></button>
          </>
        )}
      </div>

      <dl className="stats">
        <div className="stat stat-streak">
          <dt className="stat-label">Day streak</dt>
          <dd><FlameIcon width={30} height={30} />{streak}</dd>
        </div>
        <div className="stat">
          <dt className="stat-label">Longest</dt>
          <dd>{habit.longestStreak}</dd>
        </div>
        <div className="stat">
          <dt className="stat-label">Total</dt>
          <dd>{habit.totalCheckins}</dd>
        </div>
      </dl>

      {doneToday ? (
        <div className="done-row">
          <span className="done-label"><CheckIcon width={18} height={18} /> Done for today</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onUndo(habit, today)}>Undo</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => onCheckIn(habit)}>
          Check in
        </button>
      )}

      <Heatmap marks={marks} today={today} days={HEATMAP_DAYS} backfillDays={backfillDays} locked={busy} onToggle={toggleDay} />
      {backfillDays > 0 && <p className="hint">Missed a day this past week? Tap it above to fill it in, or tap a filled day to clear it.</p>}
    </article>
  );
}
