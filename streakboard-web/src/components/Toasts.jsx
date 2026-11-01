export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' toast-error' : ''}`}>
          <span>{t.message}</span>
          {t.action && (
            <button type="button" className="toast-action" onClick={() => { t.action.run(); onDismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
