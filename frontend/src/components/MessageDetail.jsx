/**
 * MessageDetail — selected SIP message side panel
 */

export default function MessageDetail({ message, onClose }) {
  if (!message) return null

  const fields = [
    { label: 'Direction', value: message.direction },
    { label: 'Source IP', value: message.src_ip },
    { label: 'Destination IP', value: message.dst_ip },
    { label: 'Call-ID', value: message.call_id },
    { label: 'From', value: message.from_header },
    { label: 'To', value: message.to_header },
    { label: 'CSeq', value: message.cseq },
    { label: 'Timestamp', value: message.timestamp },
    { label: 'Has SDP', value: message.has_sdp ? 'Yes' : 'No' },
  ].filter(f => f.value)

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <span style={styles.label}>{message.label}</span>
          <span style={styles.index}>Message #{message.index + 1}</span>
        </div>
        <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>
      </div>

      <div style={styles.fields}>
        {fields.map(f => (
          <div key={f.label} style={styles.field}>
            <div style={styles.fieldLabel}>{f.label}</div>
            <div style={styles.fieldValue}>{f.value}</div>
          </div>
        ))}
      </div>

      {message.sdp && (
        <>
          <div style={styles.rawLabel}>SDP</div>
          <pre style={styles.raw}>{message.sdp}</pre>
        </>
      )}

      <div style={styles.rawLabel}>Raw SIP</div>
      <pre style={styles.raw}>{message.raw}</pre>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'var(--panel-head-bg)',
    borderBottom: '1px solid var(--line)',
  },
  label: {
    fontWeight: 700,
    fontSize: '1rem',
    color: 'var(--ink)',
    fontFamily: 'var(--mono)',
  },
  index: {
    marginLeft: 10,
    fontSize: '0.75rem',
    color: 'var(--muted)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '1.2rem',
    lineHeight: 1,
    padding: '2px 6px',
  },
  fields: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--line)',
  },
  field: {
    display: 'flex',
    gap: 12,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  fieldLabel: {
    color: 'var(--muted)',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    minWidth: 100,
    paddingTop: 2,
  },
  fieldValue: {
    color: 'var(--ink-soft)',
    fontSize: '0.8rem',
    fontFamily: 'var(--mono)',
    wordBreak: 'break-all',
  },
  rawLabel: {
    padding: '8px 14px 4px',
    color: 'var(--muted)',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  raw: {
    padding: '0 14px 14px',
    color: 'var(--ink-soft)',
    fontSize: '0.72rem',
    fontFamily: 'var(--mono)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowY: 'auto',
    maxHeight: 240,
    lineHeight: 1.55,
  },
}
