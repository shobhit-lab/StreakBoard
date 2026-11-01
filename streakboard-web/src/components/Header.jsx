import { useState } from 'react';
import { FlameIcon, MoonIcon, SunIcon } from './Icons.jsx';

const KEY = 'streakboard-theme';

function useTheme() {
  // index.html has already set data-theme before first paint.
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    setTheme(next);
  };
  return [theme, toggle];
}

export default function Header() {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <header className="topbar">
      <a className="brand" href="#top">
        <span className="brand-mark"><FlameIcon width={18} height={18} /></span>
        StreakBoard
      </a>
      <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}
