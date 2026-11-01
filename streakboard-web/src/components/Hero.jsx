const WEEKS = 13;

// Decorative only: a heatmap that fills in toward today. It carries no data.
const cells = [];
for (let c = 0; c < WEEKS; c++) {
  for (let r = 0; r < 7; r++) {
    const last = c === WEEKS - 1;
    if (last && r > 3) { cells.push({ key: `${c}-${r}`, kind: 'none' }); continue; }
    const hash = (((c * 7 + r) * 2654435761) >>> 0) % 100; // fixed pseudo-random, denser toward today
    const on = last || hash < 8 + c * 7;
    cells.push({ key: `${c}-${r}`, kind: last && r === 3 ? 'today' : on ? 'on' : 'off' });
  }
}

// After the page scrolls to the app, put the cursor in the habit-name box.
const focusNameBox = () => setTimeout(() => document.getElementById('habit-name')?.focus({ preventScroll: true }), 450);

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <h1>Show up today. Keep the streak.</h1>
        <p>
          StreakBoard is a daily habit tracker. Add a habit, check in once a day, and
          watch your streak and your last 90 days fill in. No signup.
        </p>
        <a className="btn btn-primary btn-lg" href="#app" onClick={focusNameBox}>Start tracking</a>
      </div>
      <div className="hero-board" aria-hidden="true">
        <div className="heatmap" style={{ '--weeks': WEEKS }}>
          {cells.map((c) => <span key={c.key} className={`cell ${c.kind === 'on' ? 'on' : ''} ${c.kind === 'today' ? 'on today' : ''} ${c.kind === 'none' ? 'cell-pad' : ''}`} />)}
        </div>
      </div>
    </section>
  );
}
