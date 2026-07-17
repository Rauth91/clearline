export const VISUALWARE_SAMPLE_REPORT = `Overall Result
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

export const EMPTY_VISUALWARE = {
  rawPaste: '',
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
}

export const EMPTY_SPEEDTEST = {
  downloadMbps: '',
  uploadMbps: '',
  latencyMs: '',
  server: '',
  testedAt: '',
  notes: '',
}

/** Field techs typically run three of each. */
export const NETWORK_RUN_COUNT = 3

export function emptySpeedtestRuns() {
  return Array.from({ length: NETWORK_RUN_COUNT }, () => ({ ...EMPTY_SPEEDTEST }))
}

export function emptyVisualwareRuns() {
  return Array.from({ length: NETWORK_RUN_COUNT }, () => ({ ...EMPTY_VISUALWARE }))
}

function padRuns(runs, emptyFactory) {
  const next = Array.isArray(runs) ? runs.map(r => ({ ...emptyFactory(), ...r })) : []
  while (next.length < NETWORK_RUN_COUNT) next.push(emptyFactory())
  return next.slice(0, NETWORK_RUN_COUNT)
}

function speedtestHasData(st) {
  return Boolean(
    String(st?.downloadMbps ?? '').trim()
    || String(st?.uploadMbps ?? '').trim()
    || String(st?.latencyMs ?? '').trim(),
  )
}

function visualwareHasData(vw) {
  return Boolean(
    String(vw?.rawPaste ?? '').trim()
    || String(vw?.jitterOut ?? '').trim()
    || String(vw?.mosOut ?? '').trim()
    || String(vw?.overall ?? '').trim(),
  )
}

export function aggregateSpeedtests(runs) {
  const filled = (runs || []).filter(speedtestHasData)
  if (!filled.length) return { ...EMPTY_SPEEDTEST }
  return {
    downloadMbps: minNumericField(filled, 'downloadMbps'),
    uploadMbps: minNumericField(filled, 'uploadMbps'),
    latencyMs: maxNumericField(filled, 'latencyMs'),
    server: filled.map(r => r.server).filter(Boolean).join(' · '),
    testedAt: filled.map(r => r.testedAt).filter(Boolean).join(' · '),
    notes: filled.map((r, i) => (r.notes ? `Run ${i + 1}: ${r.notes}` : '')).filter(Boolean).join(' | '),
  }
}

export function aggregateVisualwareRuns(runs) {
  const filled = (runs || []).filter(visualwareHasData)
  if (!filled.length) return { ...EMPTY_VISUALWARE }
  const overalls = filled.map(r => r.overall).filter(Boolean)
  const fail = overalls.find(o => /fail/i.test(o))
  const warn = overalls.find(o => /warn|marginal/i.test(o))
  return {
    rawPaste: filled.map(r => r.rawPaste).filter(Boolean).join('\n\n---\n\n'),
    overall: fail || warn || overalls[0] || '',
    session: filled.map(r => r.session).filter(Boolean).join(' · '),
    location: filled.find(r => r.location)?.location || '',
    callsSimulated: maxNumericField(filled, 'callsSimulated'),
    callsSupported: minNumericField(filled, 'callsSupported'),
    jitterOut: maxNumericField(filled, 'jitterOut'),
    jitterIn: maxNumericField(filled, 'jitterIn'),
    lossOut: maxNumericField(filled, 'lossOut'),
    lossIn: maxNumericField(filled, 'lossIn'),
    mosOut: minNumericField(filled, 'mosOut'),
    mosIn: minNumericField(filled, 'mosIn'),
    rttMs: maxNumericField(filled, 'rttMs'),
    sipAlg: filled.some(r => r.sipAlg === 'detected') ? 'detected' : (filled.find(r => r.sipAlg)?.sipAlg || ''),
    downMbps: minNumericField(filled, 'downMbps'),
    upMbps: minNumericField(filled, 'upMbps'),
  }
}

function minNumericField(rows, key) {
  const nums = rows.map(r => toNumber(r[key])).filter(v => v != null)
  return nums.length ? String(Math.min(...nums)) : ''
}

function maxNumericField(rows, key) {
  const nums = rows.map(r => toNumber(r[key])).filter(v => v != null)
  return nums.length ? String(Math.max(...nums)) : ''
}

/**
 * Ensure survey has 3 Speedtest + 3 MyConnection slots.
 * Migrates legacy single speedtest / visualware objects.
 */
export function normalizeNetworkSurvey(survey = {}) {
  let speedtests = Array.isArray(survey.speedtests)
    ? padRuns(survey.speedtests, () => ({ ...EMPTY_SPEEDTEST }))
    : emptySpeedtestRuns()
  let visualwareRuns = Array.isArray(survey.visualwareRuns)
    ? padRuns(survey.visualwareRuns, () => ({ ...EMPTY_VISUALWARE }))
    : emptyVisualwareRuns()

  if (!Array.isArray(survey.speedtests) && survey.speedtest && speedtestHasData(survey.speedtest)) {
    speedtests = padRuns([{ ...EMPTY_SPEEDTEST, ...survey.speedtest }], () => ({ ...EMPTY_SPEEDTEST }))
  }
  if (!Array.isArray(survey.visualwareRuns) && survey.visualware && visualwareHasData(survey.visualware)) {
    visualwareRuns = padRuns([{ ...EMPTY_VISUALWARE, ...survey.visualware }], () => ({ ...EMPTY_VISUALWARE }))
  }

  const speedtest = aggregateSpeedtests(speedtests)
  const visualware = aggregateVisualwareRuns(visualwareRuns)
  return {
    ...survey,
    speedtests,
    visualwareRuns,
    speedtest,
    visualware,
  }
}

export function networkRunProgress(survey) {
  const n = normalizeNetworkSurvey(survey)
  const speedFilled = n.speedtests.filter(speedtestHasData).length
  const vwFilled = n.visualwareRuns.filter(visualwareHasData).length
  const filled = speedFilled + vwFilled
  const total = NETWORK_RUN_COUNT * 2
  return { filled, total, speedFilled, vwFilled, ratio: filled / total }
}

export const QUALITY_THRESHOLDS = [
  { metric: 'Jitter', good: '< 30 ms', watch: '30-50 ms', bad: '> 50 ms' },
  { metric: 'Latency / RTT', good: '< 100 ms', watch: '100-150 ms', bad: '> 150 ms' },
  { metric: 'Packet loss', good: '< 1%', watch: '1-3%', bad: '>= 3%' },
  { metric: 'MOS', good: '>= 3.6', watch: '3.2-3.5', bad: '< 3.2' },
]

export function toNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const match = text.match(re)
    if (match) return match
  }
  return null
}

function maxOf(...values) {
  const nums = values.map(toNumber).filter(v => v != null)
  return nums.length ? Math.max(...nums) : null
}

function minOf(...values) {
  const nums = values.map(toNumber).filter(v => v != null)
  return nums.length ? Math.min(...nums) : null
}

export function parseVisualwareReport(text) {
  if (!text?.trim()) return { data: {}, matched: 0 }

  const data = { rawPaste: text }
  let matched = 0
  const n = '([\\d.]+)'

  const set = (key, value) => {
    if (value == null || value === '') return
    data[key] = String(value)
    matched += 1
  }

  const overall = firstMatch(text, [/Overall Result\s*(Pass|Fail|Warning|Marginal)/i])
  if (overall) set('overall', overall[1])

  const session = firstMatch(text, [/Session:\s*([^\s•]+)/i])
  if (session) set('session', session[1])

  const location = firstMatch(text, [/Location:\s*([^•\n]+?)(?:\s*•|\s*Calls|\n|$)/i])
  if (location) set('location', location[1].trim())

  const simulated = firstMatch(text, [/Calls Simulated:\s*(\d+)/i])
  if (simulated) set('callsSimulated', simulated[1])

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
  if (value == null) return { label, status: 'missing', valueText: '-', text: `${label} missing` }
  if (value <= good) return { label, status: 'pass', valueText: `${value}${unit}`, text: 'Within excellent range' }
  if (value <= watch) return { label, status: 'warn', valueText: `${value}${unit}`, text: 'Usable but watch closely' }
  return { label, status: 'fail', valueText: `${value}${unit}`, text: 'Outside VoIP range' }
}

function gradeHigher(label, value, good, watch, unit) {
  if (value == null) return { label, status: 'missing', valueText: '-', text: `${label} missing` }
  if (value >= good) return { label, status: 'pass', valueText: `${value}${unit}`, text: 'Strong for VoIP' }
  if (value >= watch) return { label, status: 'warn', valueText: `${value}${unit}`, text: 'Marginal quality' }
  return { label, status: 'fail', valueText: `${value}${unit}`, text: 'Below VoIP target' }
}

function capacityRow(metric, value, requiredMbps, phones) {
  const n = toNumber(value)
  return {
    metric,
    value: n == null ? '-' : `${n} Mbps`,
    label: metric,
    status: n == null ? 'missing' : n >= requiredMbps ? 'pass' : n >= requiredMbps * 0.75 ? 'warn' : 'fail',
    text: n == null ? 'Not reported' : `Need >= ${requiredMbps} Mbps for ${phones} phone(s)`,
  }
}

export function analyzeReadiness(input = {}) {
  const survey = normalizeNetworkSurvey(input)
  const speedtests = survey.speedtests
  const visualwareRuns = survey.visualwareRuns
  const speedtest = survey.speedtest
  const visualware = survey.visualware
  const phoneCount = survey.phoneCount || ''

  const phones = Math.max(
    1,
    toNumber(phoneCount) || toNumber(visualware.callsSimulated) || 1,
  )
  const requiredMbps = Math.max(1, Number((phones * 0.15 + 1).toFixed(1)))

  const jitter = maxOf(visualware.jitterOut, visualware.jitterIn)
  const loss = maxOf(visualware.lossOut, visualware.lossIn)
  const mos = minOf(visualware.mosOut, visualware.mosIn)
  const rtt = toNumber(visualware.rttMs)
  const down = toNumber(visualware.downMbps)
  const up = toNumber(visualware.upMbps)
  const supported = toNumber(visualware.callsSupported)
  const requested = toNumber(visualware.callsSimulated) || phones

  const speedDown = toNumber(speedtest.downloadMbps)
  const speedUp = toNumber(speedtest.uploadMbps)

  const sections = [
    ...speedtests.map((run, index) => ({
      section: `Speedtest ${index + 1}`,
      rows: [
        {
          metric: 'Download',
          value: toNumber(run.downloadMbps) == null ? '-' : `${run.downloadMbps} Mbps`,
          label: `Speedtest ${index + 1} download`,
          status: toNumber(run.downloadMbps) == null ? 'missing' : toNumber(run.downloadMbps) >= requiredMbps ? 'pass' : toNumber(run.downloadMbps) >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: toNumber(run.downloadMbps) == null ? 'Run not entered yet' : `Need >= ${requiredMbps} Mbps`,
        },
        {
          metric: 'Upload',
          value: toNumber(run.uploadMbps) == null ? '-' : `${run.uploadMbps} Mbps`,
          label: `Speedtest ${index + 1} upload`,
          status: toNumber(run.uploadMbps) == null ? 'missing' : toNumber(run.uploadMbps) >= requiredMbps ? 'pass' : toNumber(run.uploadMbps) >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: toNumber(run.uploadMbps) == null ? 'Run not entered yet' : `Need >= ${requiredMbps} Mbps`,
        },
        {
          metric: 'Latency',
          value: run.latencyMs ? `${run.latencyMs} ms` : '-',
          ...gradeLower(`Speedtest ${index + 1} latency`, toNumber(run.latencyMs), 100, 150, ' ms'),
        },
      ],
    })),
    ...visualwareRuns.map((run, index) => ({
      section: `MyConnection ${index + 1}`,
      rows: [
        { metric: 'Overall', value: run.overall || '-', label: `MyConnection ${index + 1} overall`, status: !run.overall ? 'missing' : /fail/i.test(run.overall) ? 'fail' : /warn|marginal/i.test(run.overall) ? 'warn' : 'pass', text: run.overall ? `Reported ${run.overall}` : 'Paste report for this run' },
        { metric: 'Jitter (Outgoing)', value: run.jitterOut ? `${run.jitterOut} ms` : '-', ...gradeLower(`MC${index + 1} jitter out`, toNumber(run.jitterOut), 30, 50, ' ms') },
        { metric: 'Jitter (Incoming)', value: run.jitterIn ? `${run.jitterIn} ms` : '-', ...gradeLower(`MC${index + 1} jitter in`, toNumber(run.jitterIn), 30, 50, ' ms') },
        { metric: 'Packet Loss (Outgoing)', value: run.lossOut !== '' && run.lossOut != null ? `${run.lossOut}%` : '-', ...gradeLower(`MC${index + 1} loss out`, toNumber(run.lossOut), 1, 3, '%') },
        { metric: 'Packet Loss (Incoming)', value: run.lossIn !== '' && run.lossIn != null ? `${run.lossIn}%` : '-', ...gradeLower(`MC${index + 1} loss in`, toNumber(run.lossIn), 1, 3, '%') },
        { metric: 'MOS (Outgoing)', value: run.mosOut || '-', ...gradeHigher(`MC${index + 1} MOS out`, toNumber(run.mosOut), 3.6, 3.2, '') },
        { metric: 'MOS (Incoming)', value: run.mosIn || '-', ...gradeHigher(`MC${index + 1} MOS in`, toNumber(run.mosIn), 3.6, 3.2, '') },
        {
          metric: 'SIP ALG',
          value: !run.sipAlg ? '-' : run.sipAlg === 'clear' ? 'Clear' : 'Detected',
          label: `MC${index + 1} SIP ALG`,
          status: !run.sipAlg ? 'missing' : run.sipAlg === 'clear' ? 'pass' : 'fail',
          text: !run.sipAlg ? 'Not reported' : run.sipAlg === 'clear' ? 'No interference' : 'Disable SIP ALG on the router',
        },
        { metric: 'Round Trip Time', value: run.rttMs ? `${run.rttMs} ms` : '-', ...gradeLower(`MC${index + 1} RTT`, toNumber(run.rttMs), 100, 150, ' ms') },
        capacityRow('Downstream Capacity', run.downMbps, requiredMbps, phones),
        capacityRow('Upstream Capacity', run.upMbps, requiredMbps, phones),
      ],
    })),
  ]

  const allRows = sections.flatMap(s => s.rows)
  const failures = allRows.filter(r => r.status === 'fail')
  const warnings = allRows.filter(r => r.status === 'warn')
  const vwFilled = visualwareRuns.filter(visualwareHasData).length
  const speedFilled = speedtests.filter(speedtestHasData).length
  const visualwareCoreMissing = [
    'jitterOut', 'jitterIn', 'lossOut', 'lossIn', 'mosOut', 'mosIn',
    'rttMs', 'sipAlg', 'downMbps', 'upMbps',
  ].filter(k => !visualware[k] && visualware[k] !== 0).length

  let status = 'ready'
  let title = 'Ready for phone install'
  let detail = visualware.overall
    ? `Worst-case across ${vwFilled || 0} MyConnection run(s): ${visualware.overall}.`
    : 'Reported metrics are within recommended VoIP ranges.'

  if (failures.length) {
    status = 'fail'
    title = 'Not ready for install'
    detail = 'One or more metrics failed across the test runs. Fix these before installing phones.'
  } else if (warnings.length || visualwareCoreMissing > 4 || vwFilled < NETWORK_RUN_COUNT || speedFilled < NETWORK_RUN_COUNT) {
    status = 'warn'
    if (vwFilled < NETWORK_RUN_COUNT || speedFilled < NETWORK_RUN_COUNT) {
      title = 'Complete all test runs'
      detail = `Enter ${NETWORK_RUN_COUNT} Speedtests (${speedFilled}/${NETWORK_RUN_COUNT}) and ${NETWORK_RUN_COUNT} MyConnection tests (${vwFilled}/${NETWORK_RUN_COUNT}).`
    } else if (visualwareCoreMissing > 4) {
      title = 'Needs MyConnection report'
      detail = 'Paste the full MyConnection / Visualware report for each run so every VoIP metric can be graded.'
    } else {
      title = 'Install with caution'
      detail = 'Network may work, but caution items can affect call quality.'
    }
  }

  const recommendations = []
  if (speedFilled < NETWORK_RUN_COUNT) recommendations.push(`Run and record ${NETWORK_RUN_COUNT - speedFilled} more Speedtest(s).`)
  if (vwFilled < NETWORK_RUN_COUNT) recommendations.push(`Run and paste ${NETWORK_RUN_COUNT - vwFilled} more MyConnection / Visualware test(s).`)
  if (jitter != null && jitter > 30) recommendations.push('High jitter: test wired Ethernet and check ISP/router congestion.')
  if (loss != null && loss > 1) recommendations.push('Packet loss must be fixed before install.')
  if (rtt != null && rtt > 150) recommendations.push('High RTT: test to closest region and avoid VPN during assessment.')
  if (mos != null && mos < 3.6) recommendations.push('MOS is below target; improve before install.')
  if (visualware.sipAlg === 'detected') recommendations.push('Disable SIP ALG on the customer router/firewall.')
  if (up != null && up < requiredMbps) recommendations.push(`MyConnection upstream capacity is below ${requiredMbps} Mbps baseline.`)
  if (speedUp != null && speedUp < requiredMbps) recommendations.push(`Speedtest upload is below ${requiredMbps} Mbps baseline.`)
  if (supported != null && supported < requested) recommendations.push(`MyConnection supports ${supported} calls vs ${requested} requested.`)
  if (!recommendations.length && status === 'ready') recommendations.push('Approve install and save this report as the customer pre-install baseline.')
  if (!recommendations.length) recommendations.push('Re-run MyConnection on wired Ethernet during business hours and paste the new report.')

  return {
    status,
    title,
    detail,
    sections,
    recommendations,
    requiredMbps,
    phones,
    summary: {
      jitter, loss, mos, rtt, down, up, speedDown, speedUp, supported, requested,
      speedFilled, vwFilled,
    },
  }
}
