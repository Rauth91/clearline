/**
 * Shared network readiness UI — manual metrics entry + verdict card.
 */

import { QUALITY_THRESHOLDS } from '../lib/networkReadiness.js'
import { buildVerdictActions } from '../lib/networkProbes.js'
import { navigate } from '../lib/router.js'

export function NetworkScoreStrip({ jitter, loss, mos, callsLabel }) {
  return (
    <div className="survey-score-grid readiness-inline">
      <div className="survey-score">
        <span>Worst jitter</span>
        <strong>{jitter != null && jitter !== '' ? `${jitter} ms` : '-'}</strong>
      </div>
      <div className="survey-score">
        <span>Worst loss</span>
        <strong>{loss != null && loss !== '' ? `${loss}%` : '-'}</strong>
      </div>
      <div className="survey-score">
        <span>Lowest MOS</span>
        <strong>{mos ?? '-'}</strong>
      </div>
      <div className="survey-score">
        <span>Calls</span>
        <strong>{callsLabel || '-'}</strong>
      </div>
    </div>
  )
}

/**
 * Manual metrics: down/up/jitter/loss/MOS/ALG + seats.
 */
export function NetworkManualEntry({ values, onChange, idPrefix = 'nc' }) {
  const v = values || {}
  function set(field, value) {
    onChange?.({ ...v, [field]: value })
  }

  return (
    <div className="nc-manual">
      <div className="survey-form-grid">
        <label className="survey-field" htmlFor={`${idPrefix}-down`}>
          Download Mbps
          <input
            id={`${idPrefix}-down`}
            type="number"
            inputMode="decimal"
            value={v.downMbps ?? ''}
            onChange={e => set('downMbps', e.target.value)}
          />
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-up`}>
          Upload Mbps
          <input
            id={`${idPrefix}-up`}
            type="number"
            inputMode="decimal"
            value={v.upMbps ?? ''}
            onChange={e => set('upMbps', e.target.value)}
          />
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-jitter`}>
          Jitter ms
          <input
            id={`${idPrefix}-jitter`}
            type="number"
            inputMode="decimal"
            value={v.jitter ?? ''}
            onChange={e => set('jitter', e.target.value)}
          />
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-loss`}>
          Packet loss %
          <input
            id={`${idPrefix}-loss`}
            type="number"
            inputMode="decimal"
            value={v.loss ?? ''}
            onChange={e => set('loss', e.target.value)}
          />
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-mos`}>
          MOS
          <input
            id={`${idPrefix}-mos`}
            type="number"
            inputMode="decimal"
            step="0.1"
            value={v.mos ?? ''}
            onChange={e => set('mos', e.target.value)}
          />
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-alg`}>
          SIP ALG
          <select
            id={`${idPrefix}-alg`}
            value={v.sipAlg ?? ''}
            onChange={e => set('sipAlg', e.target.value)}
          >
            <option value="">—</option>
            <option value="clear">Clear</option>
            <option value="detected">Detected</option>
          </select>
        </label>
        <label className="survey-field" htmlFor={`${idPrefix}-seats`}>
          Seat count
          <input
            id={`${idPrefix}-seats`}
            type="number"
            inputMode="numeric"
            min={1}
            value={v.seats ?? ''}
            onChange={e => set('seats', e.target.value)}
          />
        </label>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><span className="panel-title">Quality guide</span></div>
        <table className="threshold-table compact">
          <tbody>
            {QUALITY_THRESHOLDS.map(t => (
              <tr key={t.metric}>
                <td>{t.metric}</td>
                <td className="ok-cell">{t.good}</td>
                <td className="warn-cell">{t.watch}</td>
                <td className="err-cell">{t.bad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function openAction(action) {
  if (!action?.href) return
  if (action.external || /^https?:/i.test(action.href)) {
    window.open(action.href, '_blank', 'noopener,noreferrer')
    return
  }
  const [pathPart, queryPart = ''] = action.href.split('?')
  const query = {}
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v = ''] = pair.split('=')
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v)
    }
  }
  navigate(pathPart, Object.keys(query).length ? { query } : undefined)
}

export function NetworkVerdictCard({ verdict, manual }) {
  if (!verdict) return null
  const status = verdict.status || 'info'
  const label = status === 'pass' ? 'Pass' : status === 'warn' ? 'Watch' : status === 'fail' ? 'Fail' : '—'
  const actions = buildVerdictActions(verdict, manual)
  const showActions = status === 'fail' || status === 'warn'

  return (
    <div className={`nc-verdict nc-verdict-${status}`} aria-label="Network verdict">
      <div className="nc-verdict-head">
        <span className={`status-pill status-${status === 'pass' ? 'pass' : status === 'warn' ? 'warn' : status === 'fail' ? 'fail' : 'info'}`}>
          {label}
        </span>
        <strong>
          {verdict.callsSupported != null
            ? `${verdict.callsSupported} calls supported / ${verdict.callsNeeded} seats`
            : 'Enter bandwidth to estimate call capacity'}
        </strong>
      </div>
      {verdict.callsSupported != null && (
        <p className="nc-verdict-math">
          floor(min(up, down) × 1000 × 0.8 / 87.2) = {verdict.callsSupported}
          {' '}(G.711 ~87.2 kbps, 80% usable)
        </p>
      )}
      <ul className="nc-verdict-reasons">
        {(verdict.reasons || []).map((r, i) => (
          <li key={`${r}-${i}`}>{r}</li>
        ))}
      </ul>

      {showActions && actions.length > 0 && (
        <div className="nc-actions" aria-label="Recommended actions">
          <div className="nc-section-label">Next actions</div>
          <ul className="nc-action-list">
            {actions.map((a, i) => (
              <li key={`${a.reason}-${i}`} className="nc-action-item">
                <div className="nc-action-reason">{a.reason}</div>
                <p className="nc-action-text">{a.action}</p>
                {a.href ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openAction(a)}
                  >
                    {a.external || /^https?:/i.test(a.href) ? 'Open Visualware' : 'Open tool'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function buildNetworkSummaryText({ verdict, manual, natText, actions }) {
  const lines = [
    'ClearLine — Network Check summary',
    '--------------------------------',
  ]
  if (natText) {
    lines.push('Connection identity:', natText, '')
  }
  lines.push('Entered metrics:')
  lines.push(`  Download: ${manual?.downMbps || '—'} Mbps`)
  lines.push(`  Upload: ${manual?.upMbps || '—'} Mbps`)
  lines.push(`  Jitter: ${manual?.jitter || '—'} ms`)
  lines.push(`  Loss: ${manual?.loss || '—'} %`)
  lines.push(`  MOS: ${manual?.mos || '—'}`)
  lines.push(`  SIP ALG: ${manual?.sipAlg || '—'}`)
  lines.push(`  Seats: ${manual?.seats || '—'}`)
  lines.push('')
  if (verdict) {
    lines.push(`Verdict: ${verdict.status?.toUpperCase()}`)
    if (verdict.callsSupported != null) {
      lines.push(`Calls supported: ${verdict.callsSupported} (need ${verdict.callsNeeded})`)
      lines.push('Formula: floor(min(up,down)×1000×0.8/87.2)')
    }
    for (const r of verdict.reasons || []) lines.push(`  · ${r}`)
  }
  const act = actions || buildVerdictActions(verdict, manual)
  if (act.length) {
    lines.push('')
    lines.push('Recommended actions:')
    for (const a of act) {
      lines.push(`  → ${a.action}`)
      if (a.detail) lines.push(`     (${a.detail})`)
    }
  }
  return lines.join('\n')
}
