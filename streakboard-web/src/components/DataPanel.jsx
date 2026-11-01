import { useState } from 'react';

export default function DataPanel({ timezone, email, isAnonymous, onExport, onCreateAccount }) {
  const [exporting, setExporting] = useState(false);
  const run = async () => {
    setExporting(true);
    await onExport();
    setExporting(false);
  };

  return (
    <section className="panel" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>
      <div className="panel-grid">
        <div>
          <h3>Export</h3>
          <p>Download every habit and check-in as a JSON file.</p>
          <button type="button" className="btn btn-secondary" onClick={run} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Export data'}
          </button>
        </div>
        <div>
          <h3>Time zone</h3>
          <p>A check-in counts for your calendar day in <strong>{timezone}</strong>.</p>
        </div>
        <div>
          <h3>Account</h3>
          {isAnonymous ? (
            <>
              <p>You&rsquo;re using StreakBoard without an account.</p>
              <button type="button" className="btn btn-secondary" onClick={onCreateAccount}>Create account</button>
            </>
          ) : (
            <p>Signed in as <strong>{email}</strong>.</p>
          )}
        </div>
      </div>
    </section>
  );
}
