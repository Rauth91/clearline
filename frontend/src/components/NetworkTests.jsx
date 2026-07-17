/**
 * NetworkTests — paste Visualware report → pre-install readiness verdict
 */

import { useMemo, useState } from 'react'

const TOOLS = [
  {
    id: 'speedtest',
    title: 'Speedtest',
    subtitle: 'Optional bandwidth check',
    description:
      'Quick download / upload / latency. Optional when Visualware already reports capacity.',
    url: 'https://www.speedtest.net/',
    note: 'Browser-only — no install required.',
  },
  {
    id: 'mcs',
    title: 'Visualware VoIP Assessment',
    subtitle: 'Jitter · loss · MOS · SIP ALG',
    description:
      'Primary pre-install test. Paste the full report below — the console reads every metric Visualware shows.',
    url: 'https://myconnectionserver.visualware.com/portals/voip-test/voip-assessment-test',
    note: 'Requires the Visualware BCS utility (install once, then re-run from the browser).',
    secondary: {
      label: 'Download BCS utility',
      url: 'https://www.visualware.com/bcs/',
    },
  },
]

const THRESHOLDS = [
  { metric: 'Jitter', good: '< 30 ms', watch: '30–50 ms', bad: '> 50 ms' },
  { metric: 'Latency (RTT)', good: '< 100 ms', watch: '100–150 ms', bad: '> 150 ms' },
  { metric: 'Packet loss', good: '< 1%', watch: '1–3%', bad: '≥ 3%' },
  { metric: 'MOS', good: '≥ 3.6', watch: '3.2–3.5', bad: '< 3.2' },
]

const SAMPLE_REPORT = `Overall Result
Pass
Your connection is well-suited for VoIP and video conferencing. All key metrics are within acceptable thresholds for reliable call quality.

Session: WFH_NOPS_5556  •  Location: Chicago, IL  •  Calls Simulated: 10

Test Metrics
Metric	Value	Status
Jitter (Outgoing)	2.6 ms
Jitter (Incoming)	2.5 ms
Packet Loss (Outgoing)	0%
Packet Loss (Incoming)	0%
MOS (Outgoing)	4.2
MOS (Incoming)	4.2
SIP ALG	Clear
Round Trip Time	37 ms

Connection Capacity
Metric	Value	Status
Downstream Capacity	10.01 Mbps
Upstream Capacity	10.00 Mbps
Calls Supported	73 of 10 requested`

const EMPTY = {
  overall: '',
  session: '',
  location: '',
  callsSimulated: '',
  callsSupported: '',
  jitterOut: '',
  jitterIn: '',
  lossOut: '',
  lossIn: '',
  mosOut: '',
  mosIn: '',
  rttMs: '',
  sipAlg: '',
  downMbps: '',
  upMbps: '',
  phoneCount: '10',
}

function toNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m
  }
  return null
}

function maxOf(...vals) {
  const nums = vals.map(toNumber).filter(v => v != null)
  return nums.length ? Math.max(...nums) : null
}

function minOf(...vals) {
  const nums = vals.map(toNumber).filter(v => v != null)
  return nums.length ? Math.min(...nums) : null
}

function parseVisualwareReport(text) {
  if (!text?.trim()) return { data: {}, matched: 0 }

  const data = {}
  let matched = 0
  const n = '([\\d.]+)'

  const set = (key, value) => {
    if (value == null || value === '') return
    data[key] = String(value)
    matched++
  }

  const overall = firstMatch(text, [/Overall Result\s*(Pass|Fail|Warning|Marginal)/i])
  if (overall) set('overall', overall[1])

  const session = firstMatch(text, [/Session:\s*([^\s•]+)/i])
  if (session) set('session', session[1])

  const location = firstMatch(text, [/Location:\s*([^•\n]+?)(?:\s*•|\s*Calls|\n|$)/i])
  if (location) set('location', location[1].trim())

  const simulated = firstMatch(text, [/Calls Simulated:\s*(\d+)/i])
  if (simulated) {
    set('callsSimulated', simulated[1])
    set('phoneCount', simulated[1])
  }

  const jOut = firstMatch(text, [new RegExp(`Jitter\\s*\\(Outgoing\\)\\s*${n}`, 'i')])
  const jIn = firstMatch(text, [new RegExp(`Jitter\\s*\\(Incoming\\)\\s*${n}`, 'i')])
  if (jOut) set('jitterOut', jOut[1])
  if (jIn) set('jitterIn', jIn[1])

  const lOut = firstMatch(text, [new RegExp(`Packet Loss\\s*\\(Outgoing\\)\\s*${n}`, 'i')])
  const lIn = firstMatch(text, [new RegExp(`Packet Loss\\s*\\(Incoming\\)\\s*${n}`, 'i')])
  if (lOut) set('lossOut', lOut[1])
  if (lIn) set('lossIn', lIn[1])

  const mOut = firstMatch(text, [new RegExp(`MOS\\s*\\(Outgoing\\)\\s*${n}`, 'i')])
  const mIn = firstMatch(text, [new RegExp(`MOS\\s*\\(Incoming\\)\\s*${n}`, 'i')])
  if (mOut) set('mosOut', mOut[1])
  if (mIn) set('mosIn', mIn[1])

  const rtt = firstMatch(text, [new RegExp(`Round\\s*Trip\\s*Time\\s*${n}`, 'i')])
  if (rtt) set('rttMs', rtt[1])

  const down = firstMatch(text, [new RegExp(`Downstream\\s*Capacity\\s*${n}`, 'i')])
  if (down) set('downMbps', down[1])

  const up = firstMatch(text, [new RegExp(`Upstream\\s*Capacity\\s*${n}`, 'i')])
  if (up) set('upMbps', up[1])

  const calls = firstMatch(text, [/Calls Supported\s*(\d+)\s*of\s*(\d+)/i])
  if (calls) {
    set('callsSupported', calls[1])
    if (!data.callsSimulated) set('callsSimulated', calls[2])
    if (!data.phoneCount) set('phoneCount', calls[2])
  }

  const alg = firstMatch(text, [/SIP ALG\s*(Clear|No Interference|Detected|Interference|Present)/i])
  if (alg) {
    set('sipAlg', /clear|no interference/i.test(alg[1]) ? 'clear' : 'detected')
  } else if (/no sip alg interference/i.test(text)) {
    set('sipAlg', 'clear')
  }

  return { data, matched }
}

function gradeLower(label, value, good, watch, unit) {
  if (value == null) return { label, status: 'missing', valueText: '—', text: `${label} missing` }
  if (value <= good) return { label, status: 'pass', valueText: `${value}${unit}`, text: 'Within excellent range' }
  if (value <= watch) return { label, status: 'warn', valueText: `${value}${unit}`, text: 'Usable but watch closely' }
  return { label, status: 'fail', valueText: `${value}${unit}`, text: 'Outside VoIP range' }
}

function gradeHigher(label, value, good, watch, unit) {
  if (value == null) return { label, status: 'missing', valueText: '—', text: `${label} missing` }
  if (value >= good) return { label, status: 'pass', valueText: `${value}${unit}`, text: 'Strong for VoIP' }
  if (value >= watch) return { label, status: 'warn', valueText: `${value}${unit}`, text: 'Marginal quality' }
  return { label, status: 'fail', valueText: `${value}${unit}`, text: 'Below VoIP target' }
}

function analyzeReadiness(form) {
  const phones = Math.max(1, toNumber(form.phoneCount) || toNumber(form.callsSimulated) || 1)
  const requiredMbps = Math.max(1, Number((phones * 0.15 + 1).toFixed(1)))

  const jitter = maxOf(form.jitterOut, form.jitterIn)
  const loss = maxOf(form.lossOut, form.lossIn)
  const mos = minOf(form.mosOut, form.mosIn)
  const rtt = toNumber(form.rttMs)
  const down = toNumber(form.downMbps)
  const up = toNumber(form.upMbps)
  const supported = toNumber(form.callsSupported)
  const requested = toNumber(form.callsSimulated) || phones

  const metrics = [
    {
      section: 'Test Metrics',
      rows: [
        {
          metric: 'Jitter (Outgoing)',
          value: form.jitterOut ? `${form.jitterOut} ms` : '—',
          ...gradeLower('Jitter out', toNumber(form.jitterOut), 30, 50, ' ms'),
        },
        {
          metric: 'Jitter (Incoming)',
          value: form.jitterIn ? `${form.jitterIn} ms` : '—',
          ...gradeLower('Jitter in', toNumber(form.jitterIn), 30, 50, ' ms'),
        },
        {
          metric: 'Packet Loss (Outgoing)',
          value: form.lossOut !== '' ? `${form.lossOut}%` : '—',
          ...gradeLower('Loss out', toNumber(form.lossOut), 1, 3, '%'),
        },
        {
          metric: 'Packet Loss (Incoming)',
          value: form.lossIn !== '' ? `${form.lossIn}%` : '—',
          ...gradeLower('Loss in', toNumber(form.lossIn), 1, 3, '%'),
        },
        {
          metric: 'MOS (Outgoing)',
          value: form.mosOut || '—',
          ...gradeHigher('MOS out', toNumber(form.mosOut), 3.6, 3.2, ''),
        },
        {
          metric: 'MOS (Incoming)',
          value: form.mosIn || '—',
          ...gradeHigher('MOS in', toNumber(form.mosIn), 3.6, 3.2, ''),
        },
        {
          metric: 'SIP ALG',
          value: !form.sipAlg ? '—' : form.sipAlg === 'clear' ? 'Clear' : 'Detected',
          label: 'SIP ALG',
          status: !form.sipAlg ? 'missing' : form.sipAlg === 'clear' ? 'pass' : 'fail',
          text: !form.sipAlg
            ? 'Not reported'
            : form.sipAlg === 'clear'
            ? 'No interference'
            : 'Disable SIP ALG on the router',
        },
        {
          metric: 'Round Trip Time',
          value: form.rttMs ? `${form.rttMs} ms` : '—',
          ...gradeLower('RTT', rtt, 100, 150, ' ms'),
        },
      ],
    },
    {
      section: 'Connection Capacity',
      rows: [
        {
          metric: 'Downstream Capacity',
          value: form.downMbps ? `${form.downMbps} Mbps` : '—',
          label: 'Downstream',
          status: down == null ? 'missing' : down >= requiredMbps ? 'pass' : down >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: down == null ? 'Not reported' : `Need ≥ ${requiredMbps} Mbps for ${phones} phone(s)`,
        },
        {
          metric: 'Upstream Capacity',
          value: form.upMbps ? `${form.upMbps} Mbps` : '—',
          label: 'Upstream',
          status: up == null ? 'missing' : up >= requiredMbps ? 'pass' : up >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: up == null ? 'Not reported' : `Need ≥ ${requiredMbps} Mbps for ${phones} phone(s)`,
        },
        {
          metric: 'Calls Supported',
          value: supported != null
            ? `${supported} of ${requested} requested`
            : '—',
          label: 'Calls supported',
          status: supported == null
            ? 'missing'
            : supported >= requested
            ? 'pass'
            : supported >= requested * 0.75
            ? 'warn'
            : 'fail',
          text: supported == null
            ? 'Not reported'
            : supported >= requested
            ? `Supports ${supported} concurrent calls (requested ${requested})`
            : `Only ${supported} calls supported — below the ${requested} requested`,
        },
      ],
    },
  ]

  const allRows = metrics.flatMap(s => s.rows)
  const failures = allRows.filter(r => r.status === 'fail')
  const warnings = allRows.filter(r => r.status === 'warn')
  const missing = allRows.filter(r => r.status === 'missing')

  // Core Visualware metrics present?
  const coreMissing = ['jitterOut', 'jitterIn', 'lossOut', 'lossIn', 'mosOut', 'mosIn', 'rttMs', 'sipAlg', 'downMbps', 'upMbps']
    .filter(k => !form[k] && form[k] !== 0).length

  let status = 'ready'
  let title = 'Ready for phone install'
  let detail = form.overall
    ? `Visualware overall: ${form.overall}. Metrics are within VoIP thresholds.`
    : 'All reported metrics are within recommended VoIP ranges.'

  if (failures.length) {
    status = 'fail'
    title = 'Not ready for install'
    detail = 'One or more Visualware metrics failed. Fix these before installing phones.'
  } else if (warnings.length || (missing.length && coreMissing > 4)) {
    status = 'warn'
    title = coreMissing > 4 ? 'Needs a Visualware report' : 'Install with caution'
    detail = coreMissing > 4
      ? 'Paste the full Visualware report so every metric can be graded.'
      : 'Network may work, but caution items can affect call quality.'
  }

  const recommendations = []
  if (jitter != null && jitter > 30) {
    recommendations.push('High jitter: test on wired Ethernet and check ISP/router congestion.')
  }
  if (loss != null && loss > 1) {
    recommendations.push('Packet loss must be fixed before install (cabling, firewall, ISP, WAN load).')
  }
  if (rtt != null && rtt > 150) {
    recommendations.push('High RTT: test to the closest region and avoid VPN during the assessment.')
  }
  if (mos != null && mos < 3.6) {
    recommendations.push('MOS is below target — do not install until the Visualware score improves.')
  }
  if (form.sipAlg === 'detected') {
    recommendations.push('Disable SIP ALG on the customer router/firewall before going live.')
  }
  if (up != null && up < requiredMbps) {
    recommendations.push(`Upstream capacity is below the ${requiredMbps} Mbps baseline for ${phones} phones.`)
  }
  if (supported != null && supported < requested) {
    recommendations.push(`Visualware only supports ${supported} concurrent calls vs ${requested} requested.`)
  }
  if (!recommendations.length && status === 'ready') {
    recommendations.push('Approve install and save this report as the customer pre-install baseline.')
  }
  if (!recommendations.length) {
    recommendations.push('Re-run Visualware on wired Ethernet during business hours and paste the new report.')
  }

  return {
    status,
    title,
    detail,
    metrics,
    recommendations,
    requiredMbps,
    phones,
    summary: {
      jitter,
      loss,
      mos,
      rtt,
      down,
      up,
      supported,
      requested,
    },
  }
}

export default function NetworkTests() {
  const [form, setForm] = useState(EMPTY)
  const [report, setReport] = useState('')
  const [parseNote, setParseNote] = useState(null)
  const assessment = useMemo(() => analyzeReadiness(form), [form])

  function handleParse(text = report) {
    const { data, matched } = parseVisualwareReport(text)
    if (!matched) {
      setParseNote({ type: 'error', text: 'Could not find Visualware metrics in the pasted text.' })
      return
    }
    setForm(prev => ({ ...prev, ...data }))
    setParseNote({
      type: 'ok',
      text: `Parsed ${matched} field(s)${data.overall ? ` · Overall: ${data.overall}` : ''}.`,
    })
  }

  function handleClear() {
    setReport('')
    setForm(EMPTY)
    setParseNote(null)
  }

  function loadSample() {
    setReport(SAMPLE_REPORT)
    handleParse(SAMPLE_REPORT)
  }

  return (
    <section className="network-tests">
      <div className="network-intro">
        <h2 className="network-heading">Pre-install network readiness</h2>
        <p className="network-copy">
          Paste the full Visualware report (every metric it shows). The console
          grades each row and tells you if the customer is ready for phones.
        </p>
      </div>

      <div className="network-grid">
        {TOOLS.map(tool => (
          <article key={tool.id} className="network-card">
            <div className="network-card-kicker">{tool.subtitle}</div>
            <h3 className="network-card-title">{tool.title}</h3>
            <p className="network-card-desc">{tool.description}</p>
            <p className="network-card-note">{tool.note}</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={tool.url} target="_blank" rel="noopener noreferrer">
                Open test
              </a>
              {tool.secondary && (
                <a className="btn btn-secondary" href={tool.secondary.url} target="_blank" rel="noopener noreferrer">
                  {tool.secondary.label}
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Paste Visualware / MCS report</span>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={loadSample}>
              Load sample
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClear}>
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleParse()}
              disabled={!report.trim()}
            >
              Parse &amp; analyze
            </button>
          </div>
        </div>
        <textarea
          className="report-textarea"
          value={report}
          onChange={e => setReport(e.target.value)}
          placeholder="Paste the full Visualware result: Overall Result, Session, Jitter In/Out, Packet Loss In/Out, MOS In/Out, SIP ALG, RTT, Downstream/Upstream Capacity, Calls Supported…"
          spellCheck={false}
        />
        {parseNote && (
          <div className={parseNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
            {parseNote.text}
          </div>
        )}
        {(form.session || form.location || form.overall) && (
          <div className="report-meta">
            {form.overall && (
              <span>
                Overall: <strong className={form.overall.toLowerCase() === 'pass' ? 'ok-cell' : 'err-cell'}>{form.overall}</strong>
              </span>
            )}
            {form.session && <span>Session: <strong>{form.session}</strong></span>}
            {form.location && <span>Location: <strong>{form.location}</strong></span>}
            {form.callsSimulated && <span>Calls simulated: <strong>{form.callsSimulated}</strong></span>}
          </div>
        )}
      </div>

      <div className="readiness-layout">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Parsed Visualware metrics</span>
          </div>
          {assessment.metrics.map(section => (
            <div key={section.section}>
              <div className="metric-section-title">{section.section}</div>
              <div className="threshold-table-wrap">
                <table className="threshold-table metric-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map(row => (
                      <tr key={row.metric}>
                        <td>{row.metric}</td>
                        <td>{row.value}</td>
                        <td>
                          <span className={`status-pill status-${row.status}`}>
                            {row.status === 'pass' ? 'Good' : row.status === 'warn' ? 'Watch' : row.status === 'fail' ? 'Fail' : '—'}
                          </span>
                          <span className="status-note">{row.text}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="readiness-foot">
            Install baseline for {assessment.phones} phone(s): about{' '}
            <strong>{assessment.requiredMbps} Mbps</strong> up and down available for voice.
          </div>
        </div>

        <div className={`readiness-card readiness-${assessment.status}`}>
          <div className="readiness-kicker">Install verdict</div>
          <h3>{assessment.title}</h3>
          <p>{assessment.detail}</p>
          <div className="check-list">
            {[
              ['Worst jitter', assessment.summary.jitter != null ? `${assessment.summary.jitter} ms` : '—'],
              ['Worst packet loss', assessment.summary.loss != null ? `${assessment.summary.loss}%` : '—'],
              ['Lowest MOS', assessment.summary.mos != null ? String(assessment.summary.mos) : '—'],
              ['RTT', assessment.summary.rtt != null ? `${assessment.summary.rtt} ms` : '—'],
              ['Capacity', assessment.summary.down != null ? `${assessment.summary.down}↓ / ${assessment.summary.up}↑ Mbps` : '—'],
              ['Calls', assessment.summary.supported != null ? `${assessment.summary.supported} / ${assessment.summary.requested}` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="check-row">
                <span className="check-dot" style={{ background: 'var(--accent)' }} />
                <div>
                  <div className="check-label">{label}</div>
                  <div className="check-text">{value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="recommendations">
            <div className="recommendations-title">Next steps</div>
            <ul>
              {assessment.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="network-thresholds panel">
        <div className="panel-head">
          <span className="panel-title">VoIP quality guide</span>
        </div>
        <div className="threshold-table-wrap">
          <table className="threshold-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Good</th>
                <th>Watch</th>
                <th>Bad</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map(row => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td className="ok-cell">{row.good}</td>
                  <td className="warn-cell">{row.watch}</td>
                  <td className="err-cell">{row.bad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
