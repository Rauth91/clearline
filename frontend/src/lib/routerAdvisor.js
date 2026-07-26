/**
 * Router Advisor prescription generator — pure functions.
 */

import {
  CODEC_KBPS,
  PLATFORM_PORTS,
  getProfile,
} from './routerProfiles.js'

/**
 * Priority / LLQ size for voice (kbps), ceil(seats × codecKbps).
 */
export function voicePriorityKbps(seats, codecId = 'g711') {
  const n = Math.max(1, Number(seats) || 1)
  const kbps = CODEC_KBPS[codecId]?.kbps ?? CODEC_KBPS.g711.kbps
  return Math.ceil(n * kbps)
}

export function udpTimeoutSeconds(registrationIntervalSec) {
  const reg = Math.max(60, Number(registrationIntervalSec) || 3600)
  return reg * 2
}

function fillTemplate(text, vars) {
  let out = String(text || '')
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`<${k}>`).join(String(v))
  }
  return out
}

function formatPortList(ports) {
  if (!ports?.length) return '—'
  return ports.join(', ')
}

function formatRtpRange(range) {
  if (!range) return '—'
  return `${range.start}–${range.end}/udp`
}

/**
 * @param {{
 *   profileId: string,
 *   platformId: string,
 *   seats: number|string,
 *   codecId?: string,
 *   phonesOnVlan?: boolean,
 *   onSiteSbc?: boolean,
 *   qosInPlace?: boolean,
 *   customerName?: string,
 * }} input
 */
export function buildPrescription(input = {}) {
  const profile = getProfile(input.profileId)
  const platform = PLATFORM_PORTS[input.platformId] || PLATFORM_PORTS.netsapiens
  const seats = Math.max(1, Number(input.seats) || 1)
  const codecId = input.codecId && CODEC_KBPS[input.codecId] ? input.codecId : 'g711'
  const codec = CODEC_KBPS[codecId]
  const priorityKbps = voicePriorityKbps(seats, codecId)
  const udpTimeout = udpTimeoutSeconds(platform.registrationIntervalSec)
  const vars = {
    PRIORITY_KBPS: String(priorityKbps),
    UDP_TIMEOUT_SEC: String(udpTimeout),
  }

  const items = []

  // 1. SIP ALG — always first
  items.push({
    id: 'sip-alg',
    title: '1. Disable SIP ALG',
    kind: profile.kind,
    body: profile.sipAlg?.how || '',
    snippet: profile.sipAlg?.snippet
      ? fillTemplate(profile.sipAlg.snippet, vars)
      : null,
    steps: (profile.sipAlg?.steps || []).map(s => fillTemplate(s, vars)),
  })

  // 2. QoS
  const qosSteps = (profile.qos?.steps || []).map(s => fillTemplate(s, vars))
  if (input.qosInPlace) {
    qosSteps.unshift('Existing QoS reported in place — review marks/queues against EF/CS3 rather than rebuilding from scratch.')
  }
  items.push({
    id: 'qos',
    title: '2. QoS — DSCP EF (RTP) + CS3 (SIP)',
    kind: profile.kind,
    body: [
      profile.qos?.how || '',
      `Priority / LLQ sizing: ceil(${seats} seats × ${codec.kbps} kbps ${codec.label}) = ${priorityKbps} kbps.`,
      'Mark RTP DSCP EF (46) and SIP DSCP CS3 (24); trust DSCP on the phone access layer when possible.',
    ].filter(Boolean).join(' '),
    snippet: profile.qos?.snippet ? fillTemplate(profile.qos.snippet, vars) : null,
    steps: qosSteps,
    meta: { priorityKbps, seats, codecKbps: codec.kbps, codecLabel: codec.label },
  })

  // 3. Firewall / NAT
  const fwSteps = [
    `Allow outbound UDP/TCP to provider SIP: ${formatPortList(platform.sipUdp)} (UDP)`
      + (platform.sipTcp?.length ? `, TCP ${formatPortList(platform.sipTcp)}` : '')
      + (platform.sipTls?.length ? `, TLS ${formatPortList(platform.sipTls)}` : '')
      + '.',
    `Allow outbound RTP UDP ${formatRtpRange(platform.rtpUdp)} (and return traffic via stateful NAT).`,
    input.onSiteSbc
      ? 'On-site SBC/edge selected: publish only the SBC signaling/media ports the vendor documents — not individual phones.'
      : 'Hosted seats: outbound-only stance — do not create inbound port-forwards to desk phones.',
    profile.portForwardNote || '',
  ].filter(Boolean)
  items.push({
    id: 'firewall',
    title: '3. Firewall / NAT',
    kind: 'gui',
    body: `${platform.label} port expectations (verify TODO markers in platformPorts). ${platform.notes || ''}`,
    snippet: null,
    steps: fwSteps,
    meta: {
      platformId: platform.id,
      sipUdp: platform.sipUdp,
      sipTcp: platform.sipTcp,
      sipTls: platform.sipTls,
      rtpUdp: platform.rtpUdp,
    },
  })

  // 4. UDP timeout
  items.push({
    id: 'udp-timeout',
    title: '4. UDP session timeout',
    kind: profile.kind,
    body: [
      `Rule: UDP/NAT timeout ≥ 2 × registration interval.`,
      `${platform.label} registration interval ≈ ${platform.registrationIntervalSec}s → timeout ≥ ${udpTimeout}s.`,
      profile.udpTimeout?.how || '',
      profile.udpTimeout?.note || '',
    ].filter(Boolean).join(' '),
    snippet: profile.udpTimeout?.snippet
      ? fillTemplate(profile.udpTimeout.snippet, vars)
      : null,
    steps: (profile.udpTimeout?.steps || []).map(s => fillTemplate(s, vars)),
    meta: { udpTimeout, registrationIntervalSec: platform.registrationIntervalSec },
  })

  // 5. VLAN / DHCP (conditional)
  if (input.phonesOnVlan) {
    items.push({
      id: 'vlan-dhcp',
      title: '5. VLAN / DHCP',
      kind: 'gui',
      body: 'Phones on their own VLAN — isolate broadcast domain and apply provisioning DHCP options.',
      snippet: null,
      steps: [
        'Put phones on a dedicated voice VLAN / SSID with DHCP.',
        profile.dhcpOptionNote || 'Add DHCP provisioning options (e.g. 66/160) for Yealink as required.',
        'Trunk/access ports: trust DSCP toward the WAN QoS policy.',
        'Do not hairpin RTP through guest Wi-Fi.',
      ],
    })
  }

  // 6. Caveats
  items.push({
    id: 'caveats',
    title: input.phonesOnVlan ? '6. Vendor caveats' : '5. Vendor caveats',
    kind: 'gui',
    body: 'Read before changing production firewalls.',
    snippet: null,
    steps: [...(profile.caveats || [])],
  })

  return {
    profile,
    platform,
    seats,
    codec,
    priorityKbps,
    udpTimeout,
    customerName: input.customerName || '',
    onSiteSbc: Boolean(input.onSiteSbc),
    phonesOnVlan: Boolean(input.phonesOnVlan),
    qosInPlace: Boolean(input.qosInPlace),
    items,
  }
}

export function prescriptionToText(rx) {
  if (!rx) return ''
  const lines = [
    'ClearLine — Router Advisor prescription',
    '=====================================',
    `Vendor: ${rx.profile.vendor}`,
    `Platform: ${rx.platform.label}`,
    `Seats: ${rx.seats} · Codec: ${rx.codec.label} (${rx.codec.kbps} kbps)`,
    `Voice priority size: ${rx.priorityKbps} kbps`,
    '',
  ]
  for (const item of rx.items) {
    lines.push(item.title)
    lines.push('-'.repeat(Math.min(48, item.title.length)))
    if (item.body) lines.push(item.body)
    if (item.steps?.length) {
      for (const s of item.steps) lines.push(`  • ${s}`)
    }
    if (item.snippet) {
      lines.push('')
      lines.push('```')
      lines.push(item.snippet.trim())
      lines.push('```')
    }
    lines.push('')
  }
  lines.push('Verify all CLI/GUI against current vendor firmware documentation before applying.')
  return lines.join('\n')
}

export function prescriptionCustomerHtml(rx) {
  const title = rx.customerName
    ? `Network readiness checklist — ${escapeHtml(rx.customerName)}`
    : 'Network readiness checklist — VoIP phones'
  const intro = `Please apply the following router/firewall changes to support hosted VoIP (${escapeHtml(rx.platform.label)}) for approximately ${rx.seats} seat(s). Prefer verifying each step in your vendor’s current documentation. ClearLine generated this checklist for IT handoff — it is guidance, not a change window authorization.`

  const blocks = rx.items.map(item => {
    const steps = (item.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')
    const snip = item.snippet
      ? `<pre class="ra-print-pre">${escapeHtml(item.snippet.trim())}</pre>`
      : ''
    return `
      <section class="ra-print-item">
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.body || '')}</p>
        ${steps ? `<ol>${steps}</ol>` : ''}
        ${snip}
      </section>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; background: #fff; margin: 24px; line-height: 1.45; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  .ra-print-intro { color: #333; margin-bottom: 24px; max-width: 40rem; }
  .ra-print-meta { font-size: 0.9rem; color: #444; margin-bottom: 20px; }
  .ra-print-item { break-inside: avoid; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #ccc; }
  .ra-print-item h2 { font-size: 1.1rem; margin: 0 0 6px; }
  .ra-print-pre { background: #f4f4f4; border: 1px solid #ccc; padding: 10px; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.8rem; }
  @media print {
    body { margin: 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="ra-print-intro">${intro}</p>
  <p class="ra-print-meta">
    Router: ${escapeHtml(rx.profile.vendor)} ·
    Codec: ${escapeHtml(rx.codec.label)} ·
    Voice queue ≈ ${rx.priorityKbps} kbps ·
    UDP timeout ≥ ${rx.udpTimeout}s
  </p>
  ${blocks}
  <p class="ra-print-meta">Generated by ClearLine Router Advisor. Confirm port ranges and ALG commands with current vendor docs.</p>
</body>
</html>`
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
