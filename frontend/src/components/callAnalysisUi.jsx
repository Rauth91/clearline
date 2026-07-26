/**
 * Shared Call Diagnostic / Packet Capture analysis UI.
 */

import { useState } from 'react'
import { navigate } from '../lib/router.js'
import { describeCall } from '../lib/sipLadder.js'

export function MetricCard({ label, value, rating, hint }) {
  const ratingClass = rating === 'good' ? 'is-ok' : rating === 'warn' ? 'is-warn' : rating === 'bad' ? 'is-err' : ''
  return (
    <div className={`cd-metric ${ratingClass}`}>
      <div className="cd-metric-label">{label}</div>
      <div className="cd-metric-value">{value}</div>
      {hint ? <div className="cd-metric-hint">{hint}</div> : null}
    </div>
  )
}

export function formatSec(sec, digits = 1) {
  if (sec == null || Number.isNaN(sec)) return '—'
  return `${sec.toFixed(digits)}s`
}

export function CallPicker({ calls, onSelect }) {
  return (
    <div className="cd-picker">
      <div className="cd-section-label">Multiple calls in this export</div>
      <p className="cd-picker-hint">Select a call to analyze. Related Call-IDs (e.g. transfers) are listed separately.</p>
      <ul className="cd-picker-list">
        {calls.map(call => (
          <li key={call.callId}>
            <button type="button" className="cd-picker-card" onClick={() => onSelect(call)}>
              <div className="cd-picker-main">
                <strong>
                  {call.from?.user || '—'}
                  {' → '}
                  {call.dialed || call.to?.user || '—'}
                </strong>
                <span className="cd-mono cd-picker-id">{call.callId}</span>
              </div>
              <div className="cd-picker-meta">
                <span>{call.startTime || '—'}</span>
                <span className={`cd-result-badge cd-result-${call.result?.tone || 'warn'}`}>
                  {call.result?.label || '—'}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Findings({ findings, hasError }) {
  if (!findings?.length) {
    return (
      <div className="cd-clean">
        No issues flagged — this call looks healthy.
      </div>
    )
  }
  return (
    <div className="cd-findings">
      <div className="cd-findings-head">
        <div className="cd-section-label">Findings</div>
        {hasError ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/tools/symptom')}
          >
            Troubleshoot this
          </button>
        ) : null}
      </div>
      <ul className="cd-finding-list">
        {findings.map((f, i) => (
          <li key={`${f.title}-${i}`} className={`cd-finding cd-finding-${f.severity}`}>
            <div className="cd-finding-top">
              <span className={`cd-sev-chip cd-sev-${f.severity}`}>{f.severity}</span>
              <strong>{f.title}</strong>
              {f.sipCode ? (
                <a
                  className="cd-sip-link"
                  href={`#/tools/reference?q=${encodeURIComponent(String(f.sipCode))}`}
                  onClick={e => {
                    e.preventDefault()
                    navigate('/tools/reference', { query: { q: String(f.sipCode) } })
                  }}
                >
                  {f.sipCode}
                </a>
              ) : null}
            </div>
            <p>{f.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Ladder({ call }) {
  const [openIdx, setOpenIdx] = useState(null)
  const events = call.ladder || []
  const midLabel = call.serverLabel || 'NetSapiens'

  return (
    <div className="cd-ladder-panel">
      <div className="cd-section-label">SIP ladder</div>
      <div className="cd-ladder" role="table" aria-label="SIP message ladder">
        <div className="cd-ladder-cols" role="row">
          <div className="cd-ladder-gutter-head" />
          <div className="cd-ladder-col-head">{call.phoneLabel}</div>
          <div className="cd-ladder-col-head">{midLabel}</div>
          <div className="cd-ladder-col-head">{call.farEndLabel}</div>
        </div>

        <div className="cd-ladder-steps">
          {events.map((ev, i) => {
            const expanded = openIdx === i
            const laneSpan = (() => {
              const order = { phone: 0, ns: 1, far: 2 }
              const a = order[ev.fromLane] ?? 1
              const b = order[ev.toLane] ?? 1
              return { left: Math.min(a, b), right: Math.max(a, b), goRight: b > a }
            })()

            return (
              <div
                key={i}
                className={`cd-ladder-step${ev.isAnswer ? ' is-answer' : ''}${expanded ? ' is-open' : ''}`}
              >
                <button
                  type="button"
                  className="cd-ladder-row-btn"
                  aria-expanded={expanded}
                  onClick={() => setOpenIdx(expanded ? null : i)}
                >
                  <span className="cd-ladder-gutter cd-mono">{ev.deltaLabel}</span>
                  <span className="cd-ladder-mobile-dir">
                    {ev.fromLane === 'phone' ? call.phoneLabel : ev.fromLane === 'far' ? call.farEndLabel : midLabel}
                    {' → '}
                    {ev.toLane === 'phone' ? call.phoneLabel : ev.toLane === 'far' ? call.farEndLabel : midLabel}
                  </span>
                  <span
                    className={`cd-ladder-track go-${laneSpan.goRight ? 'right' : 'left'}`}
                    data-left={laneSpan.left}
                    data-right={laneSpan.right}
                    style={{
                      '--cd-left': `${(laneSpan.left / 2) * 100}%`,
                      '--cd-right': `${((2 - laneSpan.right) / 2) * 100}%`,
                    }}
                  >
                    <span className="cd-col-line" data-col="0" />
                    <span className="cd-col-line" data-col="1" />
                    <span className="cd-col-line" data-col="2" />
                    <span
                      className="cd-arrow-wrap"
                      style={{
                        left: `calc(${laneSpan.left} * 33.333% + 8%)`,
                        right: `calc(${2 - laneSpan.right} * 33.333% + 8%)`,
                      }}
                    >
                      <span className="cd-arrow-line-inner" />
                      <span className={`cd-arrowhead ${laneSpan.goRight ? 'ah-right' : 'ah-left'}`} />
                      <span className={`cd-arrow-msg ${laneSpan.goRight ? 'msg-right' : 'msg-left'}`}>
                        <span className={`cd-pill cd-pill-${ev.tone}`}>
                          {ev.code && ev.code >= 300 ? (
                            <a
                              className="cd-pill-link"
                              href={`#/tools/reference?q=${encodeURIComponent(String(ev.code))}`}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                navigate('/tools/reference', { query: { q: String(ev.code) } })
                              }}
                            >
                              {ev.label}
                            </a>
                          ) : (
                            ev.label
                          )}
                        </span>
                        {ev.annotations?.map((a, ai) => (
                          <span key={ai} className="cd-inline-note">{a}</span>
                        ))}
                      </span>
                    </span>
                  </span>
                </button>
                {expanded ? (
                  <pre className="cd-ladder-raw cd-mono">{ev.raw}</pre>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="cd-ladder-legend">
          <span><i className="cd-pill cd-pill-request">REQ</i> request</span>
          <span><i className="cd-pill cd-pill-provisional">1xx</i> provisional</span>
          <span><i className="cd-pill cd-pill-success">2xx</i> success</span>
          <span><i className="cd-pill cd-pill-auth">401/407</i> auth</span>
          <span><i className="cd-pill cd-pill-client-err">4xx</i> client</span>
          <span><i className="cd-pill cd-pill-server-err">5xx/6xx</i> failure</span>
        </div>
      </div>
    </div>
  )
}

export function RoutingPanel({ call }) {
  const [open, setOpen] = useState(false)
  const r = call.routing || {}
  const media = call.media || {}

  return (
    <div className="cd-routing">
      <button
        type="button"
        className="cd-routing-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="cd-section-label">Why it routed this way</span>
        <span className="cd-routing-chevron">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <ol className="cd-routing-list">
          {r.dialPolicies?.length ? (
            <li>
              <strong>Dial policy</strong>
              <ul>
                {r.dialPolicies.map((p, i) => <li key={i} className="cd-mono">{p}</li>)}
              </ul>
            </li>
          ) : null}
          {r.dialPlans?.length ? (
            <li>
              <strong>Dial plan cascade</strong>
              <ul>
                {r.dialPlans.map((p, i) => (
                  <li
                    key={i}
                    className={`cd-mono${p.match || p.name === r.matchingPlan ? ' is-match' : ''}`}
                  >
                    {p.raw}
                    {p.match || p.name === r.matchingPlan ? ' ← match' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          {r.translation ? (
            <li>
              <strong>Number translation</strong>
              <div className="cd-mono">{r.translation.summary}</div>
            </li>
          ) : null}
          <li>
            <strong>Destination</strong>
            <div>{r.destinationType || (call.onNet ? 'on-net subscriber' : 'carrier')}</div>
            {call.farEndUri ? <div className="cd-mono">{call.farEndUri}</div> : null}
          </li>
          <li>
            <strong>RTP relay</strong>
            {media.relayed ? (
              <div>
                Server-relayed media
                {media.relays?.[0] ? (
                  <span className="cd-mono">
                    {' '}
                    (orig={media.relays[0].origPort}, term={media.relays[0].termPort})
                  </span>
                ) : null}
                {media.rtpSession ? (
                  <div className="cd-mono">GetRtpSession({media.rtpSession})</div>
                ) : null}
              </div>
            ) : (
              <div>No RTP relay lines in this capture.</div>
            )}
          </li>
        </ol>
      ) : null}
    </div>
  )
}

export function AnalysisView({ call, onBack, onPickOther, multi, beforeLadder = null, note = null }) {
  const m = call.metrics || {}
  const c = call.codecs || {}
  const hasError = (call.findings || []).some(f => f.severity === 'error')

  const talkValue = (() => {
    if (m.talkSec == null) return '—'
    const bits = [`${m.talkSec}s`]
    if (m.holdSec) bits.push(`hold ${m.holdSec}s`)
    if (c.negotiated) bits.push(c.negotiated)
    return bits.join(' · ')
  })()

  return (
    <div className="cd-results">
      <div className="cd-results-toolbar">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          New analysis
        </button>
        {multi ? (
          <button type="button" className="btn btn-secondary" onClick={onPickOther}>
            Other calls
          </button>
        ) : null}
      </div>

      {note ? <p className="cd-pcap-note">{note}</p> : null}

      <div className="cd-metrics-row">
        <MetricCard
          label="Post-dial delay"
          value={formatSec(m.postDialDelaySec)}
          rating={m.postDialRating}
          hint="good <3s · warn 3–6s · bad >6s"
        />
        <MetricCard
          label="Ring before answer"
          value={formatSec(m.ringBeforeAnswerSec)}
          hint="first 180 → 200 OK"
        />
        <MetricCard
          label="Talk time"
          value={talkValue}
          hint={c.negotiatedClass ? `${c.negotiatedClass} codec` : 'from CDR when present'}
        />
        <MetricCard
          label="Ended by"
          value={m.endedBy || '—'}
          hint={m.cancelled ? 'CANCEL before answer' : 'BYE leg'}
        />
      </div>

      <div className="cd-story">
        <span className="cd-story-icon" aria-hidden="true">◎</span>
        <p>{call.narrative || describeCall(call)}</p>
      </div>

      <Findings findings={call.findings} hasError={hasError} />
      {beforeLadder}
      {(call.ladder || []).length > 0 ? <Ladder call={call} /> : null}
      <RoutingPanel call={call} />
    </div>
  )
}
