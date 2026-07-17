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

export function analyzeReadiness({ speedtest = EMPTY_SPEEDTEST, visualware = EMPTY_VISUALWARE, phoneCount = '' }) {
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
    {
      section: 'Speedtest',
      rows: [
        {
          metric: 'Download',
          value: speedDown == null ? '-' : `${speedDown} Mbps`,
          label: 'Speedtest download',
          status: speedDown == null ? 'missing' : speedDown >= requiredMbps ? 'pass' : speedDown >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: speedDown == null ? 'Optional if Visualware capacity is present' : `Need >= ${requiredMbps} Mbps`,
        },
        {
          metric: 'Upload',
          value: speedUp == null ? '-' : `${speedUp} Mbps`,
          label: 'Speedtest upload',
          status: speedUp == null ? 'missing' : speedUp >= requiredMbps ? 'pass' : speedUp >= requiredMbps * 0.75 ? 'warn' : 'fail',
          text: speedUp == null ? 'Optional if Visualware capacity is present' : `Need >= ${requiredMbps} Mbps`,
        },
        {
          metric: 'Latency',
          value: speedtest.latencyMs ? `${speedtest.latencyMs} ms` : '-',
          ...gradeLower('Speedtest latency', toNumber(speedtest.latencyMs), 100, 150, ' ms'),
        },
      ],
    },
    {
      section: 'Visualware Test Metrics',
      rows: [
        { metric: 'Jitter (Outgoing)', value: visualware.jitterOut ? `${visualware.jitterOut} ms` : '-', ...gradeLower('Jitter out', toNumber(visualware.jitterOut), 30, 50, ' ms') },
        { metric: 'Jitter (Incoming)', value: visualware.jitterIn ? `${visualware.jitterIn} ms` : '-', ...gradeLower('Jitter in', toNumber(visualware.jitterIn), 30, 50, ' ms') },
        { metric: 'Packet Loss (Outgoing)', value: visualware.lossOut !== '' ? `${visualware.lossOut}%` : '-', ...gradeLower('Loss out', toNumber(visualware.lossOut), 1, 3, '%') },
        { metric: 'Packet Loss (Incoming)', value: visualware.lossIn !== '' ? `${visualware.lossIn}%` : '-', ...gradeLower('Loss in', toNumber(visualware.lossIn), 1, 3, '%') },
        { metric: 'MOS (Outgoing)', value: visualware.mosOut || '-', ...gradeHigher('MOS out', toNumber(visualware.mosOut), 3.6, 3.2, '') },
        { metric: 'MOS (Incoming)', value: visualware.mosIn || '-', ...gradeHigher('MOS in', toNumber(visualware.mosIn), 3.6, 3.2, '') },
        {
          metric: 'SIP ALG',
          value: !visualware.sipAlg ? '-' : visualware.sipAlg === 'clear' ? 'Clear' : 'Detected',
          label: 'SIP ALG',
          status: !visualware.sipAlg ? 'missing' : visualware.sipAlg === 'clear' ? 'pass' : 'fail',
          text: !visualware.sipAlg ? 'Not reported' : visualware.sipAlg === 'clear' ? 'No interference' : 'Disable SIP ALG on the router',
        },
        { metric: 'Round Trip Time', value: visualware.rttMs ? `${visualware.rttMs} ms` : '-', ...gradeLower('RTT', rtt, 100, 150, ' ms') },
      ],
    },
    {
      section: 'Visualware Connection Capacity',
      rows: [
        capacityRow('Downstream Capacity', visualware.downMbps, requiredMbps, phones),
        capacityRow('Upstream Capacity', visualware.upMbps, requiredMbps, phones),
        {
          metric: 'Calls Supported',
          value: supported != null ? `${supported} of ${requested} requested` : '-',
          label: 'Calls supported',
          status: supported == null ? 'missing' : supported >= requested ? 'pass' : supported >= requested * 0.75 ? 'warn' : 'fail',
          text: supported == null ? 'Not reported' : supported >= requested ? `Supports ${supported} concurrent calls` : `Only ${supported} supported vs ${requested} requested`,
        },
      ],
    },
  ]

  const allRows = sections.flatMap(s => s.rows)
  const failures = allRows.filter(r => r.status === 'fail')
  const warnings = allRows.filter(r => r.status === 'warn')
  const visualwareCoreMissing = [
    'jitterOut', 'jitterIn', 'lossOut', 'lossIn', 'mosOut', 'mosIn',
    'rttMs', 'sipAlg', 'downMbps', 'upMbps',
  ].filter(k => !visualware[k] && visualware[k] !== 0).length

  let status = 'ready'
  let title = 'Ready for phone install'
  let detail = visualware.overall
    ? `Visualware overall: ${visualware.overall}. Metrics are within VoIP thresholds.`
    : 'Reported metrics are within recommended VoIP ranges.'

  if (failures.length) {
    status = 'fail'
    title = 'Not ready for install'
    detail = 'One or more metrics failed. Fix these before installing phones.'
  } else if (warnings.length || visualwareCoreMissing > 4) {
    status = 'warn'
    title = visualwareCoreMissing > 4 ? 'Needs Visualware report' : 'Install with caution'
    detail = visualwareCoreMissing > 4
      ? 'Paste the full Visualware report so every VoIP metric can be graded.'
      : 'Network may work, but caution items can affect call quality.'
  }

  const recommendations = []
  if (jitter != null && jitter > 30) recommendations.push('High jitter: test wired Ethernet and check ISP/router congestion.')
  if (loss != null && loss > 1) recommendations.push('Packet loss must be fixed before install.')
  if (rtt != null && rtt > 150) recommendations.push('High RTT: test to closest region and avoid VPN during assessment.')
  if (mos != null && mos < 3.6) recommendations.push('MOS is below target; improve before install.')
  if (visualware.sipAlg === 'detected') recommendations.push('Disable SIP ALG on the customer router/firewall.')
  if (up != null && up < requiredMbps) recommendations.push(`Visualware upstream capacity is below ${requiredMbps} Mbps baseline.`)
  if (speedUp != null && speedUp < requiredMbps) recommendations.push(`Speedtest upload is below ${requiredMbps} Mbps baseline.`)
  if (supported != null && supported < requested) recommendations.push(`Visualware supports ${supported} calls vs ${requested} requested.`)
  if (!recommendations.length && status === 'ready') recommendations.push('Approve install and save this report as the customer pre-install baseline.')
  if (!recommendations.length) recommendations.push('Re-run Visualware on wired Ethernet during business hours and paste the new report.')

  return {
    status,
    title,
    detail,
    sections,
    recommendations,
    requiredMbps,
    phones,
    summary: { jitter, loss, mos, rtt, down, up, speedDown, speedUp, supported, requested },
  }
}
