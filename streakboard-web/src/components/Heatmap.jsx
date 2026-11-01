import { addDays, formatDay, weekdayIndex } from '../dates.js';
import { PENDING } from '../useStreakBoard.js';

/**
 * Last `days` days, one column per week (Monday on top). Days inside the
 * back-fill window are buttons: tap an empty one to fill it, a filled one to clear it.
 */
export default function Heatmap({ marks, today, days, backfillDays, locked, onToggle }) {
  const start = addDays(today, -(days - 1));
  const earliest = addDays(today, -backfillDays);
  const cells = [];
  for (let i = 0; i < weekdayIndex(start); i++) cells.push({ key: `pad${i}` });
  for (let i = 0; i < days; i++) cells.push({ key: addDays(start, i), day: addDays(start, i) });

  const total = Object.keys(marks).length;
  return (
    <div
      className="heatmap"
      style={{ '--weeks': Math.ceil(cells.length / 7) }}
      role="group"
      aria-label={`Last ${days} days, ${total} ${total === 1 ? 'check-in' : 'check-ins'}`}
    >
      {cells.map(({ key, day }) => {
        if (!day) return <span key={key} className="cell cell-pad" aria-hidden="true" />;
        const done = Boolean(marks[day]);
        const cls = `cell${done ? ' on' : ''}${day === today ? ' today' : ''}${marks[day] === PENDING ? ' pending' : ''}`;
        const label = `${formatDay(day)}: ${done ? 'checked in' : 'not checked in'}`;
        if (day < earliest) return <span key={key} className={cls} title={label} aria-hidden="true" />;
        return (
          <button
            key={key}
            type="button"
            className={`${cls} tap`}
            title={label}
            aria-label={`${label}. ${done ? 'Clear this day' : 'Fill in this day'}`}
            aria-pressed={done}
            disabled={locked}
            onClick={() => onToggle(day)}
          />
        );
      })}
    </div>
  );
}
