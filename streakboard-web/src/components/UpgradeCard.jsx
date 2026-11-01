import { useState } from 'react';

export default function UpgradeCard({ streak, onUpgrade, onDismiss }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onUpgrade(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <section className="upgrade" aria-labelledby="upgrade-title">
      <div>
        <h2 id="upgrade-title">{streak >= 3 ? `${streak} days in a row.` : 'Create an account.'}</h2>
        <p>Add an email and password to turn this into a full account. Your habits and history stay exactly as they are.</p>
      </div>
      <form onSubmit={submit}>
        <label className="sr" htmlFor="up-email">Email</label>
        <input id="up-email" className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="sr" htmlFor="up-pass">Password</label>
        <input id="up-pass" className="input" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="upgrade-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
          <button className="btn btn-secondary" type="button" onClick={onDismiss}>Not now</button>
        </div>
      </form>
    </section>
  );
}
