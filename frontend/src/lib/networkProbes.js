/**
 * Connection-identity probes for Network Check (STUN / NAT only).
 * No browser-to-CDN latency probes — those are not the voice path.
 */

/** Default STUN servers for public IP / NAT checks. */
export const STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
]

/** Same Visualware VoIP assessment URL used by Site Survey. */
export const VISUALWARE_VOIP_TEST_URL =
  'https://myconnectionserver.visualware.com/portals/voip-test/voip-assessment-test'

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function parseCandidate(cand) {
  const m = String(cand || '').match(/candidate:(\S+)\s+(\d+)\s+\S+\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)/i)
  if (!m) return null
  return {
    foundation: m[1],
    component: Number(m[2]),
    ip: m[3],
    port: Number(m[4]),
    type: m[5].toLowerCase(),
  }
}

async function gatherSrflx(stunUrl, timeoutMs = 4000) {
  if (typeof RTCPeerConnection === 'undefined') {
    return { error: 'WebRTC unavailable', srflx: [] }
  }
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] })
  const srflx = []
  try {
    pc.createDataChannel('nc')
    const done = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), timeoutMs)
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          clearTimeout(timer)
          resolve()
          return
        }
        const parsed = parseCandidate(ev.candidate.candidate)
        if (parsed?.type === 'srflx') srflx.push(parsed)
      }
    })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await done
  } catch (err) {
    try { pc.close() } catch { /* ignore */ }
    return { error: err?.message || String(err), srflx: [] }
  }
  try { pc.close() } catch { /* ignore */ }
  return { srflx }
}

/**
 * STUN-based public IP + symmetric-NAT suspicion.
 */
export async function probeNat(opts = {}) {
  if (isBrowserOffline()) {
    return { offline: true }
  }
  if (typeof RTCPeerConnection === 'undefined') {
    return { offline: false, error: 'WebRTC / RTCPeerConnection not available in this browser.' }
  }

  const urls = opts.stunUrls || STUN_URLS
  const results = []
  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop
    const r = await gatherSrflx(url)
    results.push({ url, ...r })
  }

  const allSrflx = results.flatMap(r => r.srflx || [])
  const publicIps = [...new Set(allSrflx.map(c => c.ip))]
  const bindings = allSrflx.map(c => `${c.ip}:${c.port}`)
  const uniqueBindings = [...new Set(bindings)]

  let symmetricSuspect = false
  if (results.length >= 2) {
    const portsByServer = results.map(r => new Set((r.srflx || []).map(c => `${c.ip}:${c.port}`)))
    if (portsByServer[0].size && portsByServer[1].size) {
      const overlap = [...portsByServer[0]].some(b => portsByServer[1].has(b))
      if (!overlap) symmetricSuspect = true
    }
  }
  if (publicIps.length > 1) symmetricSuspect = true

  return {
    offline: false,
    hasSrflx: allSrflx.length > 0,
    publicIp: publicIps[0] || null,
    publicIps,
    bindingCount: uniqueBindings.length,
    symmetricSuspect,
    stunErrors: results.filter(r => r.error).map(r => r.error),
  }
}

export function formatNatSummary(nat) {
  if (!nat) return ''
  if (nat.offline) return 'Offline — connection identity unavailable.'
  const lines = []
  if (nat.publicIp) {
    lines.push(`Public IP: ${nat.publicIp}${nat.hasSrflx ? ' · srflx OK' : ''}`)
  } else if (!nat.error) {
    lines.push('No srflx candidates — STUN may be blocked')
  }
  if (nat.symmetricSuspect) lines.push('Symmetric NAT suspected')
  if (nat.error) lines.push(nat.error)
  return lines.join('\n')
}

/**
 * Actionable next steps from a computeVerdict result.
 * @returns {Array<{ reason: string, action: string, href?: string, detail?: string }>}
 */
export function buildVerdictActions(verdict, manual = {}) {
  const actions = []
  if (!verdict) return actions
  const seats = Math.max(1, Number(verdict.callsNeeded) || Number(manual.seats) || 1)
  const reasons = verdict.reasons || []

  for (const reason of reasons) {
    const r = String(reason)
    const lower = r.toLowerCase()

    if (/sip alg/i.test(lower)) {
      actions.push({
        reason: r,
        action: 'Open Router Advisor and disable SIP ALG on the customer firewall.',
        href: '/tools/router?focus=sip-alg',
      })
      continue
    }
    if (/packet loss/i.test(lower) || /loss .+exceeds/i.test(lower)) {
      actions.push({
        reason: r,
        action: 'Capture at the switch to find where loss enters — use Packet Capture.',
        href: '/tools/pcap',
      })
      continue
    }
    if (/jitter/i.test(lower)) {
      actions.push({
        reason: r,
        action: 'Open Router Advisor and apply QoS (EF for RTP, CS3 for SIP).',
        href: '/tools/router?focus=qos',
      })
      continue
    }
    if (/supports .+ calls but need/i.test(lower) || /headroom thin/i.test(lower)) {
      const needKbps = Math.ceil(seats * 87.2)
      const needMbps = Math.ceil((seats * 87.2) / (1000 * 0.8) * 10) / 10
      actions.push({
        reason: r,
        action: `Raise usable bandwidth: need ~${needMbps} Mbps up and down (ceil(${seats} × 87.2 / 0.8 / 1000)), or ~${needKbps} kbps priority voice capacity.`,
        detail: `${needKbps} kbps`,
      })
      continue
    }
    if (/mos/i.test(lower)) {
      actions.push({
        reason: r,
        action: 'Re-run Visualware after fixing loss/jitter/ALG; MOS usually follows those.',
        href: VISUALWARE_VOIP_TEST_URL,
        external: true,
      })
      continue
    }
    if (/rtt/i.test(lower)) {
      actions.push({
        reason: r,
        action: 'Check WAN latency to the voice provider; avoid hairpinning through distant VPN hubs.',
      })
      continue
    }
  }

  return actions
}
