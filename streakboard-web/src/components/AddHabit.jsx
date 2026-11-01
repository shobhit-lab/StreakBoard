import { useState } from 'react';

const EMOJI = ['✅', '📚', '🏃', '🧘', '💧', '🥗', '😴', '✍️', '🎸', '💪', '🧹', '🌱'];

export default function AddHabit({ onAdd }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const ok = await onAdd({ name: trimmed, emoji });
    setSaving(false);
    if (ok) setName('');
  };

  return (
    <form className="add" onSubmit={submit}>
      <label className="sr" htmlFor="habit-name">Habit name</label>
      <input
        id="habit-name"
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="Read 10 pages"
        autoComplete="off"
      />
      <div className="emoji-row" role="radiogroup" aria-label="Emoji">
        {EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={emoji === e}
            className={`emoji-opt${emoji === e ? ' selected' : ''}`}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <button className="btn btn-primary" type="submit" disabled={!name.trim() || saving}>
        {saving ? 'Adding…' : 'Add habit'}
      </button>
    </form>
  );
}
