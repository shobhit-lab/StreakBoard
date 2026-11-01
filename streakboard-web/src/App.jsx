import { useState } from 'react';
import { configError } from './api.js';
import { displayStreak } from './dates.js';
import { useStreakBoard } from './useStreakBoard.js';
import AddHabit from './components/AddHabit.jsx';
import DataPanel from './components/DataPanel.jsx';
import Header from './components/Header.jsx';
import HabitCard from './components/HabitCard.jsx';
import Hero from './components/Hero.jsx';
import Toasts from './components/Toasts.jsx';
import UpgradeCard from './components/UpgradeCard.jsx';

const DISMISS_KEY = 'streakboard-upgrade-dismissed';
const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

export default function App() {
  const sb = useStreakBoard();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const best = sb.habits.reduce((n, h) => Math.max(n, displayStreak(h, sb.today)), 0);
  const showUpgrade = sb.status === 'ready' && sb.isAnonymous && (upgradeOpen || (best >= 3 && !dismissed));

  const dismissUpgrade = () => {
    setUpgradeOpen(false);
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };
  const upgrade = async (email, password) => {
    await sb.upgrade(email, password);
    setUpgradeOpen(false);
  };

  return (
    <>
      <Header />
      <Hero />

      <main className="app" id="app">
        <h2 className="app-title">Your habits</h2>

        {sb.status === 'loading' && (
          <div className="grid" aria-busy="true" aria-label="Loading your habits">
            <div className="card skeleton" />
            <div className="card skeleton" />
          </div>
        )}

        {sb.status === 'error' && (
          <div className="notice" role="alert">
            <h3>{configError ? 'StreakBoard isn’t configured yet' : 'We couldn’t load your habits'}</h3>
            <p>{sb.fatal}</p>
            {!configError && <button type="button" className="btn btn-primary" onClick={sb.retry}>Try again</button>}
          </div>
        )}

        {sb.status === 'ready' && (
          <>
            {showUpgrade && <UpgradeCard streak={best} onUpgrade={upgrade} onDismiss={dismissUpgrade} />}
            <AddHabit onAdd={sb.addHabit} />

            {sb.habits.length === 0 ? (
              <div className="notice">
                <h3>No habits yet</h3>
                <p>Name one thing you want to do every day, pick an emoji, and add it above. Try &ldquo;Read 10 pages&rdquo; or &ldquo;Walk after lunch&rdquo;.</p>
              </div>
            ) : (
              <div className="grid">
                {sb.habits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    marks={sb.marks[h.id] ?? {}}
                    today={sb.today}
                    backfillDays={sb.settings.backfillDays}
                    busy={Boolean(sb.busy[h.id])}
                    onCheckIn={sb.checkIn}
                    onUndo={sb.undo}
                    onRename={sb.rename}
                    onArchive={sb.archive}
                  />
                ))}
              </div>
            )}

            <DataPanel
              timezone={sb.settings.timezone}
              email={sb.user?.email}
              isAnonymous={sb.isAnonymous}
              onExport={sb.exportData}
              onCreateAccount={() => setUpgradeOpen(true)}
            />
          </>
        )}
      </main>

      <footer className="footer">StreakBoard. Habits are private to your account.</footer>
      <Toasts toasts={sb.toasts} onDismiss={sb.dismissToast} />
    </>
  );
}
