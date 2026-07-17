/**
 * MediaPanel — SDP offer/answer negotiation view
 */

export default function MediaPanel({ media }) {
  if (!media || !media.sessions?.length) {
    return <div style={styles.empty}>No SDP media negotiation in this trace.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={styles.summary}>{media.summary}</div>
      {media.codec_mismatch && (
        <div style={styles.alert}>Codec mismatch between offer and answer</div>
      )}
      {media.direction_issues?.map((issue, i) => (
        <div key={i} style={styles.warn}>{issue}</div>
      ))}
      {media.media_ports?.length > 0 && (
        <div style={styles.ports}>Media ports: {media.media_ports.join(', ')}</div>
      )}
      {media.sessions.map((session, i) => (
        <div key={i} style={styles.session}>
          <div style={styles.sessionHead}>
            <span style={styles.role}>{session.role}</span>
            <span style={styles.meta}>msg #{session.message_index + 1}</span>
            {session.connection_ip && <span style={styles.meta}>{session.connection_ip}</span>}
          </div>
          {session.streams.map((s, j) => (
            <div key={j} style={{ marginBottom: 6 }}>
              <div style={styles.streamTitle}>
                {s.media_type} · {s.port}/{s.protocol}
                {s.direction ? ` · ${s.direction}` : ''}
              </div>
              <div style={styles.codecs}>
                {s.codecs.length ? s.codecs.join(' · ') : s.payload_types.join(' ')}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const styles = {
  summary: { color: 'var(--ink-soft)', fontSize: '0.82rem' },
  empty: {
    color: 'var(--muted)',
    fontSize: '0.82rem',
    padding: '10px 12px',
    background: 'var(--bg1)',
    borderRadius: 8,
    border: '1px solid var(--line)',
  },
  alert: {
    background: 'var(--err-soft)',
    border: '1px solid var(--err-border)',
    color: 'var(--err)',
    fontSize: '0.8rem',
    padding: '8px 10px',
    borderRadius: 6,
  },
  warn: {
    background: 'var(--warn-soft)',
    border: '1px solid var(--warn-border)',
    color: 'var(--warn)',
    fontSize: '0.8rem',
    padding: '8px 10px',
    borderRadius: 6,
  },
  ports: {
    fontFamily: 'var(--mono)',
    fontSize: '0.75rem',
    color: 'var(--muted)',
  },
  session: {
    background: 'var(--bg1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '10px 12px',
  },
  sessionHead: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  role: {
    textTransform: 'uppercase',
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: 'var(--accent-ink)',
    background: 'var(--accent-soft)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  meta: { color: 'var(--muted)', fontSize: '0.75rem', fontFamily: 'var(--mono)' },
  streamTitle: {
    color: 'var(--ink)',
    fontSize: '0.82rem',
    fontWeight: 650,
    fontFamily: 'var(--mono)',
  },
  codecs: {
    color: 'var(--ink-soft)',
    fontSize: '0.75rem',
    fontFamily: 'var(--mono)',
    marginTop: 2,
  },
}
