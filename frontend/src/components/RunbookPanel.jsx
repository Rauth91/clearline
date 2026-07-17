/**
 * RunbookPanel — fix steps for a selected anomaly
 */

export default function RunbookPanel({ anomaly, onClose }) {
  if (!anomaly?.runbook) {
    return (
      <div style={styles.empty}>
        Select an anomaly with a runbook code to see fix steps.
      </div>
    )
  }

  const rb = anomaly.runbook

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.code}>{rb.code}</div>
          <div style={styles.title}>{rb.title}</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={styles.close} aria-label="Close">×</button>
        )}
      </div>
      <ol style={styles.list}>
        {rb.steps.map((step, i) => (
          <li key={i} style={styles.step}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

const styles = {
  panel: {
    background: 'var(--bg1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  empty: {
    color: 'var(--muted)',
    fontSize: '0.82rem',
    padding: '10px 12px',
    background: 'var(--bg1)',
    borderRadius: 8,
    border: '1px solid var(--line)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '12px 14px',
    borderBottom: '1px solid var(--line)',
    background: 'var(--panel-head-bg)',
  },
  code: {
    fontFamily: 'var(--mono)',
    fontSize: '0.7rem',
    color: 'var(--accent-ink)',
    fontWeight: 700,
    letterSpacing: '0.03em',
  },
  title: {
    color: 'var(--ink)',
    fontSize: '0.9rem',
    fontWeight: 650,
    marginTop: 2,
  },
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '1.1rem',
  },
  list: {
    margin: 0,
    padding: '12px 14px 12px 30px',
  },
  step: {
    color: 'var(--ink-soft)',
    fontSize: '0.82rem',
    lineHeight: 1.5,
    marginBottom: 8,
  },
}
