/**
 * CallDiagnostic — NetSapiens SIP call log analyzer
 * Upload or paste the CSV from NetSapiens Call History → Export
 * and get a plain-English summary, flagged issues, and call flow.
 */

import { useState, useRef } from 'react'

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(raw) {
  const rows = []
  let i = 0
  const n = raw.length

  while (i < n) {
    const fields = []
    while (i < n && raw[i] !== '\n') {
      if (raw[i] === '"') {
        i++
        let f = ''
        while (i < n) {
          if (raw[i] === '"') {
            if (raw[i + 1] === '"') { f += '"'; i += 2 }
            else { i++; break }
          } else { f += raw[i++] }
        }
        fields.push(f)
        if (raw[i] === ',') i++
      } else {
        let f = ''
        while (i < n && raw[i] !== ',' && raw[i] !== '\n') f += raw[i++]
        fields.push(f.trim())
        if (raw[i] === ',') i++
      }
    }
    if (raw[i] === '\n') i++
    if (fields.some(f => f)) rows.push(fields)
  }
  return rows
}

// ─── SIP Helpers ─────────────────────────────────────────────────────────────

const METHODS = ['INVITE','ACK','BYE','CANCEL','REGISTER','OPTIONS','NOTIFY',
                 'SUBSCRIBE','REFER','UPDATE','INFO','PRACK','MESSAGE','PUBLISH']

function header(lines, name) {
  const re = new RegExp(`^${name}:\\s*(.+)`, 'im')
  const m = lines.join('\n').match(re)
  return m ? m[1].trim() : null
}

function parseSip(text) {
  const lines = text.split('\n').map(l => l.trim())
  const result = { method: null, code: null, dir: null, fromIP: null, sdp: [], duration: null, rawLines: lines }

  for (const line of lines) {
    // Direction
    const rcv = line.match(/^Received Packet from ([\d.]+:\d+)/i)
    if (rcv) { result.dir = 'in'; result.fromIP = rcv[1] }
    const snd = line.match(/^Sending Packet to ([\d.]+:\d+)/i)
    if (snd) { result.dir = 'out'; result.toIP = snd[1] }

    // Request line
    for (const m of METHODS) {
      if (line.startsWith(m + ' sip:') || line.startsWith(m + ' <sip:')) {
        result.method = m; break
      }
    }

    // Response line
    const resp = line.match(/^SIP\/2\.0 (\d{3}) (.+)/)
    if (resp) { result.code = +resp[1]; result.method = `${resp[1]} ${resp[2]}` }

    // SDP codecs
    const rtp = line.match(/^a=rtpmap:(\d+)\s+(\w+)\/(\d+)/i)
    if (rtp) result.sdp.push({ pt: rtp[1], codec: rtp[2], rate: rtp[3] })

    const pt = line.match(/^a=ptime:(\d+)/i)
    if (pt) result.ptime = pt[1]

    // CDR duration
    const dur = line.match(/Duration=(\d+)s\s+Hold=(\d+)s\s+Talk=(\d+)s/i)
    if (dur) result.duration = { total: +dur[1], hold: +dur[2], talk: +dur[3] }
  }

  // Parse From/To headers
  const fromH = header(lines, 'From')
  if (fromH) {
    const m = fromH.match(/"?([^"<]*)"?\s*<sip:([^@>]+)@([^>:]+)/)
    if (m) result.fromUri = { name: m[1].trim(), user: m[2], host: m[3] }
  }
  const toH = header(lines, 'To')
  if (toH) {
    const m = toH.match(/<sip:([^@>]+)@([^>:]+)/)
    if (m) result.toUri = { user: m[1], host: m[2] }
  }
  const ua = header(lines, 'User-Agent')
  if (ua) result.userAgent = ua

  const cid = header(lines, 'Call-ID')
  if (cid) result.callId = cid

  const contact = header(lines, 'Contact')
  if (contact) {
    const m = contact.match(/sip:[^@]+@([\d.]+)/)
    if (m) result.contactIP = m[1]
  }

  const cseq = header(lines, 'CSeq')
  if (cseq) result.cseq = cseq

  return result
}

// ─── Parse full CSV ───────────────────────────────────────────────────────────

function parseLog(csv) {
  const rows = parseCSV(csv.trim())
  const events = []
  let firstTs = null

  for (const row of rows) {
    const [ts, , type, text, , unixTsm] = row
    if (!text || ts === 'Time Stamp' || ts === '"Time Stamp"') continue

    const tsMs = parseInt(unixTsm) || 0
    if (!firstTs && tsMs) firstTs = tsMs

    const sip = parseSip(text)
    events.push({
      ts: ts.replace(/"/g, '').trim(),
      tsMs,
      delta: firstTs && tsMs ? tsMs - firstTs : 0,
      type: (type || '').trim(),
      ...sip,
    })
  }

  return events
}

// ─── Analyzer ────────────────────────────────────────────────────────────────

function analyze(events) {
  const info = {}
  const issues = []
  const flow = []

  // Pull call metadata from first INVITE
  for (const ev of events) {
    if (!info.caller && ev.fromUri) info.caller = ev.fromUri
    if (!info.callee && ev.toUri) info.callee = ev.toUri
    if (!info.device && ev.userAgent) info.device = ev.userAgent
    if (!info.callId && ev.callId) info.callId = ev.callId
    if (ev.duration) info.duration = ev.duration
  }

  // Codec offer (first INVITE with SDP)
  const offerEv = events.find(e => e.method === 'INVITE' && e.sdp.length > 0)
  if (offerEv) { info.offeredCodecs = offerEv.sdp; info.ptime = offerEv.ptime }

  // Codec negotiated (200 OK with SDP)
  const okSdpEv = events.find(e => e.code === 200 && e.sdp.length > 0)
  if (okSdpEv) info.negotiatedCodecs = okSdpEv.sdp

  // NAT check
  const inviteEv = events.find(e => e.method === 'INVITE')
  if (inviteEv?.fromIP && inviteEv.contactIP) {
    const extIP = inviteEv.fromIP.split(':')[0]
    if (extIP !== inviteEv.contactIP) {
      info.natDetected = true
      info.externalIP = extIP
      info.internalIP = inviteEv.contactIP
    }
  }

  // Result detection
  const codes = events.map(e => e.code).filter(Boolean)
  const has200 = codes.includes(200)
  const has486 = codes.includes(486)
  const has404 = codes.includes(404)
  const has403 = codes.includes(403)
  const has503 = codes.includes(503)
  const has408 = codes.includes(408)
  const has407 = codes.includes(407)
  const hasBye = events.some(e => e.method === 'BYE')
  const hasCancel = events.some(e => e.method === 'CANCEL')

  if (has200) {
    info.result = 'connected'; info.resultLabel = 'Call Connected'; info.resultColor = 'green'
    // Who hung up
    const byeEv = events.find(e => e.method === 'BYE')
    if (byeEv) {
      info.hangupBy = byeEv.dir === 'in' ? 'Far end hung up' : 'Caller hung up'
    }
  } else if (has486) {
    info.result = 'busy'; info.resultLabel = 'Line Busy — 486'; info.resultColor = 'red'
    issues.push({ sev: 'error', title: 'Destination Busy (486)', body: 'The called extension was in use or had DND enabled. Confirm the extension status in NetSapiens and check DND / call forwarding settings.' })
  } else if (has404) {
    info.result = 'not-found'; info.resultLabel = 'Not Found — 404'; info.resultColor = 'red'
    issues.push({ sev: 'error', title: 'Extension Not Found (404)', body: 'NetSapiens could not find the dialed number. Check the dial plan, extension, or DID routing in NetSapiens.' })
  } else if (has403) {
    info.result = 'forbidden'; info.resultLabel = 'Auth Failed — 403'; info.resultColor = 'red'
    issues.push({ sev: 'error', title: 'Authentication Rejected (403)', body: 'SIP credentials were rejected. Check the auth username and password on the phone match what\'s in NetSapiens → Devices.' })
  } else if (has503) {
    info.result = 'unavailable'; info.resultLabel = 'Server Unavailable — 503'; info.resultColor = 'red'
    issues.push({ sev: 'error', title: 'Server Unavailable (503)', body: 'NetSapiens or the SIP trunk was unreachable. Check the carrier trunk status and NetSapiens server health.' })
  } else if (has408) {
    info.result = 'timeout'; info.resultLabel = 'Request Timeout — 408'; info.resultColor = 'red'
    issues.push({ sev: 'error', title: 'Request Timed Out (408)', body: 'No response was received in time. Could be a network issue, firewall blocking SIP, or the remote device is offline.' })
  } else if (hasCancel) {
    info.result = 'cancelled'; info.resultLabel = 'Call Cancelled'; info.resultColor = 'yellow'
    issues.push({ sev: 'warn', title: 'Call Cancelled Before Answer', body: 'The caller hung up before the destination answered. This may be normal or indicate a ring timeout issue.' })
  } else {
    info.result = 'unknown'; info.resultLabel = 'Outcome Unknown'; info.resultColor = 'yellow'
  }

  // Auth challenge (407) only flag if it didn't lead to success
  if (has407 && !has200 && !has486 && !has404 && !has403) {
    issues.push({ sev: 'error', title: 'Auth Challenge Not Resolved (407)', body: 'NetSapiens challenged the phone for credentials but the call never completed. Check SIP credentials — auth username, password, and realm.' })
  }

  // Codec warning
  if (info.negotiatedCodecs?.length) {
    const top = info.negotiatedCodecs[0].codec.toUpperCase()
    if (top === 'G729') {
      issues.push({ sev: 'warn', title: 'Low Quality Codec Negotiated (G729)', body: 'G729 is a compressed codec that can cause robotic or degraded audio. Check if both endpoints support G722 or G711 (PCMU/PCMA) and prioritize those in your codec settings.' })
    }
  }

  // NAT
  if (info.natDetected) {
    issues.push({ sev: 'info', title: 'Phone Is Behind NAT', body: `Phone internal IP: ${info.internalIP} — External IP: ${info.externalIP}. If one-way audio occurs, verify NetSapiens media proxy (RTPProxy/STUN) is enabled and reachable.` })
  }

  // Build flow steps (only real SIP packets, skip internal diagnostics)
  for (const ev of events) {
    if (!ev.method) continue
    if (!ev.dir && !ev.code) continue

    const isResp = ev.code != null
    const isReq = !isResp && METHODS.includes(ev.method?.split(' ')[0])
    if (!isResp && !isReq) continue

    let from, to
    if (ev.dir === 'in') { from = 'phone'; to = 'ns' }
    else { from = 'ns'; to = ev.fromIP ? 'carrier' : 'phone' }

    let color = 'neutral'
    if (ev.code >= 200 && ev.code < 300) color = 'green'
    else if (ev.code >= 100 && ev.code < 200) color = 'blue'
    else if (ev.code === 407) color = 'orange'
    else if (ev.code >= 400) color = 'red'
    else if (ev.method === 'INVITE') color = 'purple'
    else if (ev.method === 'BYE' || ev.method === 'CANCEL') color = 'red'
    else if (ev.method === 'ACK') color = 'neutral'
    else color = 'blue'

    flow.push({ label: ev.method, from, to, color, delta: ev.delta, ts: ev.ts })
  }

  return { info, issues, flow }
}

// ─── Ladder ───────────────────────────────────────────────────────────────────

const COL = { phone: 0, ns: 1, carrier: 2 }
const COL_LABELS = ['Phone / Ext', 'NetSapiens', 'Carrier / Far End']

const PILL_COLORS = {
  green:   { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  blue:    { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  purple:  { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  orange:  { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  red:     { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  neutral: { bg: 'var(--bg2)', text: 'var(--text1)', border: 'var(--border0)' },
}

function Pill({ label, color }) {
  const c = PILL_COLORS[color] || PILL_COLORS.neutral
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: 'var(--font-mono, monospace)',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function Ladder({ steps }) {
  // Deduplicate consecutive identical steps
  const deduped = steps.filter((s, i) => {
    if (i === 0) return true
    const prev = steps[i - 1]
    return !(s.label === prev.label && s.from === prev.from && s.to === prev.to)
  })

  return (
    <div className="cd-ladder">
      {/* Column headers */}
      <div className="cd-ladder-cols">
        {COL_LABELS.map((l, i) => (
          <div key={i} className="cd-ladder-col-head">{l}</div>
        ))}
      </div>

      {/* Steps */}
      <div className="cd-ladder-steps">
        {deduped.map((step, i) => {
          const fromCol = COL[step.from] ?? 1
          const toCol = COL[step.to] ?? 1
          const goRight = toCol > fromCol

          // Arrow spans: left% and right% within the track
          const leftPct = Math.min(fromCol, toCol) * 33.33 + 4
          const rightPct = 100 - (Math.max(fromCol, toCol) * 33.33 + 4)

          return (
            <div key={i} className="cd-ladder-step">
              <div className="cd-ladder-step-time">
                {step.delta ? `+${step.delta}ms` : step.ts?.split('_')[1] || ''}
              </div>
              <div className="cd-ladder-track">
                {/* Column lines */}
                {COL_LABELS.map((_, ci) => (
                  <div key={ci} className="cd-col-line" style={{ left: `${ci * 33.33 + 16.5}%` }} />
                ))}
                {/* Arrow line */}
                <div
                  className={`cd-arrow-wrap ${goRight ? 'go-right' : 'go-left'}`}
                  style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
                >
                  <div className="cd-arrow-line-inner" />
                  <div className={`cd-arrowhead ${goRight ? 'ah-right' : 'ah-left'}`} />
                  <div className={`cd-arrow-msg ${goRight ? 'msg-right' : 'msg-left'}`}>
                    <Pill label={step.label} color={step.color} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CallDiagnostic() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  function run(text) {
    try {
      const events = parseLog(text)
      if (!events || events.length < 3) {
        setErr('Could not parse this file. Make sure it\'s a NetSapiens Call History CSV export.')
        setResult(null)
        return
      }
      setResult(analyze(events))
      setErr(null)
    } catch (e) {
      setErr('Parse error: ' + e.message)
      setResult(null)
    }
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { const t = ev.target.result; setInput(t); run(t) }
    reader.readAsText(file)
    e.target.value = ''
  }

  function clear() { setInput(''); setResult(null); setErr(null) }

  const { info, issues, flow } = result || {}

  const SEV_COLORS = { error: 'red', warn: 'yellow', info: 'blue' }
  const SEV_ICON = { error: '🔴', warn: '⚠️', info: 'ℹ️' }

  return (
    <section className="cd-root">
      <div className="cd-header">
        <h2 className="cd-title">Call Diagnostic Reader</h2>
        <p className="cd-subtitle">
          In NetSapiens go to Call History → find the call → click Export → upload or paste the CSV here.
        </p>
      </div>

      {!result && (
        <div className="cd-input-area">
          <div className="cd-upload-row">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Upload CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
            <span className="cd-or">or paste the CSV below</span>
          </div>
          <textarea
            className="cd-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste CSV content from NetSapiens Call History → Export…"
            spellCheck={false}
          />
          {err && <div className="cd-error-msg">{err}</div>}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => run(input)}
              disabled={!input.trim()}
            >
              Analyze Call
            </button>
            <button type="button" className="btn btn-secondary" onClick={clear}>Clear</button>
          </div>
        </div>
      )}

      {result && (
        <div className="cd-results">
          <button type="button" className="btn btn-secondary cd-back" onClick={clear}>
            ← New Analysis
          </button>

          {/* Summary */}
          <div className={`cd-summary cd-summary-${info.resultColor}`}>
            <div className="cd-summary-status">{info.resultLabel}</div>
            <div className="cd-summary-grid">
              {info.caller && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">From</span>
                  <span className="cd-sum-val">
                    {info.caller.name ? `${info.caller.name} · ` : ''}Ext {info.caller.user}
                    {info.device ? ` · ${info.device}` : ''}
                  </span>
                </div>
              )}
              {info.callee && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">To</span>
                  <span className="cd-sum-val">{info.callee.user}</span>
                </div>
              )}
              {info.duration && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">Duration</span>
                  <span className="cd-sum-val">{info.duration.talk}s talk · {info.duration.hold}s hold</span>
                </div>
              )}
              {info.negotiatedCodecs?.length > 0 && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">Codec Used</span>
                  <span className="cd-sum-val">
                    {info.negotiatedCodecs[0].codec}/{info.negotiatedCodecs[0].rate}
                    {info.ptime ? ` · ${info.ptime}ms ptime` : ''}
                  </span>
                </div>
              )}
              {info.offeredCodecs?.length > 0 && !info.negotiatedCodecs?.length && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">Codecs Offered</span>
                  <span className="cd-sum-val">{info.offeredCodecs.map(c => c.codec).join(', ')}</span>
                </div>
              )}
              {info.hangupBy && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">Ended By</span>
                  <span className="cd-sum-val">{info.hangupBy}</span>
                </div>
              )}
              {info.callId && (
                <div className="cd-sum-item">
                  <span className="cd-sum-label">Call-ID</span>
                  <span className="cd-sum-val cd-mono">{info.callId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Issues */}
          {issues?.length > 0 && (
            <div className="cd-issues">
              <div className="cd-section-label">Findings</div>
              {issues.map((issue, i) => (
                <div key={i} className={`cd-issue cd-issue-${SEV_COLORS[issue.sev]}`}>
                  <div className="cd-issue-title">{SEV_ICON[issue.sev]} {issue.title}</div>
                  <div className="cd-issue-body">{issue.body}</div>
                </div>
              ))}
            </div>
          )}

          {issues?.length === 0 && info.result === 'connected' && (
            <div className="cd-clean">
              ✅ No issues detected — this call completed normally.
            </div>
          )}

          {/* Flow */}
          {flow?.length > 0 && (
            <div className="cd-section">
              <div className="cd-section-label">Call Flow</div>
              <Ladder steps={flow} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
