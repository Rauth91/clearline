/**
 * AnomalyPanel — severity-grouped anomaly list
 */

const SEVERITY_CONFIG = {
  error: { label: 'Errors', color: 'var(--err)', bg: 'var(--err-soft)', icon: '!' },
  warning: { label: 'Warnings', color: 'var(--warn)', bg: 'var(--warn-soft)', icon: '!' },
  info: { label: 'Info', color: 'var(--info)', bg: 'var(--info-soft)', icon: 'i' },
}

export default function AnomalyPanel({ anomalies, onAnomalyClick }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div style={styles.clean}>
        <span style={{ fontWeight: 700, color: 'var(--ok)' }}>Clear</span>
        <span style={{ marginLeft: 8, color: 'var(--ok)' }}>No anomalies detected</span>
      </div>
    )
  }

  const grouped = { error: [], warning: [], info: [] }
  anomalies.forEach(a => {
    if (grouped[a.severity]) grouped[a.severity].push(a)
  })

  return (
    <div>
      {['error', 'warning', 'info'].map(sev => {
        const items = grouped[sev]
        if (!items.length) return null
        const cfg = SEVERITY_CONFIG[sev]
        return (
          <div key={sev} style={{ marginBottom: 12 }}>
            <div style={{ ...styles.groupHeader, color: cfg.color }}>
              {cfg.label} ({items.length})
            </div>
            {items.map((a, i) => (
              <div
                key={i}
                style={{
                  ...styles.item,
                  background: cfg.bg,
                  borderLeft: `3px solid ${cfg.color}`,
                  cursor: onAnomalyClick ? 'pointer' : 'default',
                }}
                onClick={() => onAnomalyClick && onAnomalyClick(a)}
              >
                <div style={{ color: cfg.color, fontWeight: 650, fontSize: '0.86rem' }}>
                  {a.title}
                </div>
                <div style={{ color: 'var(--ink-soft)', fontSize: '0.8rem', marginTop: 3, lineHeight: 1.4 }}>
                  {a.detail}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  Message #{a.message_index + 1}
                  {a.code ? ` · ${a.code}` : ''}
                  {a.runbook ? ' · runbook' : ''}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  groupHeader: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  item: {
    padding: '10px 12px',
    borderRadius: 8,
    marginBottom: 6,
    border: '1px solid transparent',
    transition: 'transform 140ms ease',
  },
  clean: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'var(--ok-soft)',
    borderRadius: 8,
    border: '1px solid var(--ok-border)',
    fontSize: '0.88rem',
  },
}
