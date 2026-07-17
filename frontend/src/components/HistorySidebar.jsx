/**
 * HistorySidebar — last N analyzed traces in localStorage
 */

const STORAGE_KEY = 'voip-ops-history'
const MAX_ITEMS = 10

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveHistoryItem(item) {
  const prev = loadHistory().filter(h => h.id !== item.id)
  const next = [item, ...prev].slice(0, MAX_ITEMS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY)
  return []
}

export default function HistorySidebar({ history, onSelect, onClear }) {
  if (!history?.length) {
    return <div style={styles.empty}>No saved analyses yet.</div>
  }

  return (
    <div>
      <div style={styles.head}>
        <span>History</span>
        <button type="button" onClick={onClear} style={styles.clear}>Clear</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {history.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            style={styles.item}
            title={item.summary}
          >
            <div style={styles.itemLabel}>{item.label || 'Untitled'}</div>
            <div style={styles.itemMeta}>
              {item.messageCount} msgs · {new Date(item.savedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--muted)',
    marginBottom: 8,
  },
  clear: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-ink)',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    color: 'var(--muted)',
    fontSize: '0.82rem',
  },
  item: {
    textAlign: 'left',
    background: 'var(--bg1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    color: 'inherit',
  },
  itemLabel: {
    color: 'var(--ink)',
    fontSize: '0.84rem',
    fontWeight: 650,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    color: 'var(--muted)',
    fontSize: '0.72rem',
    marginTop: 2,
  },
}
