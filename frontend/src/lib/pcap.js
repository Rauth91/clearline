/**
 * Classic libpcap parser (VoIP-scoped) + RTP metrics + SIP → sipLadder bridge.
 * Pure functions; safe to run in a Worker.
 */

import { analyze, callsFromSipMessages, parseSipMessage } from './sipLadder.js'

export const PCAP_MAX_BYTES = 100 * 1024 * 1024

const MAGIC_BE_US = 0xa1b2c3d4
const MAGIC_LE_US = 0xd4c3b2a1
const MAGIC_BE_NS = 0xa1b23c4d
const MAGIC_LE_NS = 0x4d3cb2a1
const MAGIC_PCAPNG = 0x0a0d0d0a

const LINKTYPE_ETHERNET = 1
const LINKTYPE_RAW = 101
const LINKTYPE_LINUX_SLL = 113

const SIP_METHODS = [
  'INVITE', 'ACK', 'BYE', 'CANCEL', 'REGISTER', 'OPTIONS', 'NOTIFY',
  'SUBSCRIBE', 'REFER', 'UPDATE', 'INFO', 'PRACK', 'MESSAGE', 'PUBLISH',
]

/** Static RTP payload-type → codec / clock rate (RFC 3551). */
export const STATIC_PT = {
  0: { codec: 'PCMU', rate: 8000 },
  8: { codec: 'PCMA', rate: 8000 },
  9: { codec: 'G722', rate: 8000 }, // timestamps at 8 kHz despite 16 kHz audio
  18: { codec: 'G729', rate: 8000 },
  4: { codec: 'G723', rate: 8000 },
  3: { codec: 'GSM', rate: 8000 },
}

function u32(view, offset, le) {
  return le ? view.getUint32(offset, true) : view.getUint32(offset, false)
}

function u16(view, offset, le) {
  return le ? view.getUint16(offset, true) : view.getUint16(offset, false)
}

function readAscii(bytes, start, end) {
  let s = ''
  const lim = Math.min(end, bytes.length)
  for (let i = start; i < lim; i++) {
    const c = bytes[i]
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function looksLikeSip(text) {
  const t = String(text || '').trimStart()
  if (/^SIP\/2\.0\s+\d{3}/i.test(t)) return true
  for (const m of SIP_METHODS) {
    if (t.startsWith(`${m} `) || t.startsWith(`${m}\t`)) return true
  }
  return false
}

function decodeIpv4(bytes, offset) {
  if (offset + 20 > bytes.length) return null
  const vihl = bytes[offset]
  const version = vihl >> 4
  if (version !== 4) return null
  const ihl = (vihl & 0x0f) * 4
  if (ihl < 20 || offset + ihl > bytes.length) return null
  const totalLen = (bytes[offset + 2] << 8) | bytes[offset + 3]
  const protocol = bytes[offset + 9]
  const src = `${bytes[offset + 12]}.${bytes[offset + 13]}.${bytes[offset + 14]}.${bytes[offset + 15]}`
  const dst = `${bytes[offset + 16]}.${bytes[offset + 17]}.${bytes[offset + 18]}.${bytes[offset + 19]}`
  const payloadOffset = offset + ihl
  const payloadEnd = Math.min(bytes.length, offset + (totalLen || bytes.length - offset))
  return { protocol, src, dst, payloadOffset, payloadEnd, ihl }
}

function decodeUdp(bytes, offset, end) {
  if (offset + 8 > end) return null
  const srcPort = (bytes[offset] << 8) | bytes[offset + 1]
  const dstPort = (bytes[offset + 2] << 8) | bytes[offset + 3]
  const length = (bytes[offset + 4] << 8) | bytes[offset + 5]
  const dataStart = offset + 8
  const dataEnd = length >= 8
    ? Math.min(end, offset + length)
    : end
  return { srcPort, dstPort, dataStart, dataEnd }
}

function parseEthernetFrame(bytes, offset, end) {
  if (offset + 14 > end) return null
  let o = offset
  let ethertype = (bytes[o + 12] << 8) | bytes[o + 13]
  o += 14
  // 802.1Q VLAN (and double-tag)
  while (ethertype === 0x8100 || ethertype === 0x88a8) {
    if (o + 4 > end) return null
    ethertype = (bytes[o + 2] << 8) | bytes[o + 3]
    o += 4
  }
  if (ethertype !== 0x0800) return { skipped: true, reason: 'non-ipv4' }
  return { ipOffset: o }
}

function parseLinuxSll(bytes, offset, end) {
  // Linux cooked capture: 16-byte header
  if (offset + 16 > end) return null
  const protocol = (bytes[offset + 14] << 8) | bytes[offset + 15]
  if (protocol !== 0x0800) return { skipped: true, reason: 'non-ipv4' }
  return { ipOffset: offset + 16 }
}

function parseLink(bytes, offset, end, linktype) {
  if (linktype === LINKTYPE_ETHERNET) return parseEthernetFrame(bytes, offset, end)
  if (linktype === LINKTYPE_LINUX_SLL) return parseLinuxSll(bytes, offset, end)
  if (linktype === LINKTYPE_RAW) return { ipOffset: offset }
  return { skipped: true, reason: `unsupported linktype ${linktype}` }
}

function isRtp(bytes, start, end, evenPortHint) {
  if (end - start < 12) return false
  const b0 = bytes[start]
  const version = b0 >> 6
  if (version !== 2) return false
  // Heuristic: PT < 128 already implied; reject if looks like SIP
  const sample = readAscii(bytes, start, Math.min(end, start + 16))
  if (looksLikeSip(sample)) return false
  if (evenPortHint === false) {
    // still allow if PT is known static audio
    const pt = bytes[start + 1] & 0x7f
    if (!(pt in STATIC_PT) && pt < 96) return false
  }
  return true
}

function parseRtpHeader(bytes, start, end) {
  if (end - start < 12) return null
  const b0 = bytes[start]
  const b1 = bytes[start + 1]
  const cc = b0 & 0x0f
  const marker = (b1 >> 7) & 1
  const pt = b1 & 0x7f
  const seq = (bytes[start + 2] << 8) | bytes[start + 3]
  const timestamp = ((bytes[start + 4] << 24) | (bytes[start + 5] << 16)
    | (bytes[start + 6] << 8) | bytes[start + 7]) >>> 0
  const ssrc = ((bytes[start + 8] << 24) | (bytes[start + 9] << 16)
    | (bytes[start + 10] << 8) | bytes[start + 11]) >>> 0
  const headerLen = 12 + cc * 4
  if (start + headerLen > end) return null
  return { marker, pt, seq, timestamp, ssrc, headerLen }
}

/**
 * RFC 3550 interarrival jitter (in timestamp units → ms via clockRate).
 */
export function computeRtpJitterMs(packets, clockRate) {
  if (!packets?.length || packets.length < 2 || !clockRate) return 0
  let j = 0
  let prev = packets[0]
  for (let i = 1; i < packets.length; i++) {
    const cur = packets[i]
    const arrivalDelta = (cur.arrivalMs - prev.arrivalMs) * (clockRate / 1000)
    const tsDelta = (cur.timestamp - prev.timestamp) | 0 // signed 32 wrap
    const d = Math.abs(arrivalDelta - tsDelta)
    j += (d - j) / 16
    prev = cur
  }
  return (j / clockRate) * 1000
}

/**
 * Wraparound-safe sequence gap loss estimate.
 * @returns {{ expected: number, received: number, lost: number, lossPct: number }}
 */
export function computeRtpLoss(packets) {
  if (!packets?.length) {
    return { expected: 0, received: 0, lost: 0, lossPct: 0 }
  }
  const seqs = packets.map(p => p.seq)
  let min = seqs[0]
  let max = seqs[0]
  // Expand considering wrap: walk in order
  const ordered = [...packets].sort((a, b) => a.arrivalMs - b.arrivalMs)
  let expected = 1
  let prev = ordered[0].seq
  for (let i = 1; i < ordered.length; i++) {
    const cur = ordered[i].seq
    let delta = (cur - prev + 65536) % 65536
    if (delta === 0) delta = 1 // duplicate — count as one expected slot already counted
    else expected += delta
    prev = cur
  }
  // Prefer span from first to last unique seq when no reorder chaos
  const uniq = new Set(seqs)
  const first = ordered[0].seq
  const last = ordered[ordered.length - 1].seq
  const span = ((last - first + 65536) % 65536) + 1
  const expectedFinal = Math.max(expected, span, uniq.size)
  const received = uniq.size
  const lost = Math.max(0, expectedFinal - received)
  const lossPct = expectedFinal > 0 ? (lost / expectedFinal) * 100 : 0
  return { expected: expectedFinal, received, lost, lossPct }
}

function collectSdpPortsAndMaps(sipMessages) {
  const ports = new Set()
  const rtpmap = new Map() // pt -> { codec, rate }
  for (const m of sipMessages) {
    if (m.mediaPort) ports.add(m.mediaPort)
    for (const c of m.codecs || []) {
      const pt = Number(c.pt)
      if (Number.isFinite(pt)) {
        rtpmap.set(pt, {
          codec: c.codec,
          rate: c.rate ? Number(c.rate) : (STATIC_PT[pt]?.rate || 8000),
        })
      }
    }
    if (m.sdp) {
      for (const line of String(m.sdp).split('\n')) {
        const ma = line.match(/^m=audio\s+(\d+)/i)
        if (ma) ports.add(Number(ma[1]))
        const rm = line.match(/^a=rtpmap:(\d+)\s+([^\s/]+)(?:\/(\d+))?/i)
        if (rm) {
          rtpmap.set(Number(rm[1]), {
            codec: rm[2],
            rate: rm[3] ? Number(rm[3]) : 8000,
          })
        }
      }
    }
  }
  return { ports, rtpmap }
}

function streamKey(ssrc, src, sport, dst, dport) {
  return `${ssrc}|${src}:${sport}>${dst}:${dport}`
}

function inferServerIp(sipPackets) {
  // Destination of first INVITE is usually the UAS / SBC / PBX
  for (const p of sipPackets) {
    if (p.msg?.isRequest && p.msg.method === 'INVITE') return p.dstIp
  }
  const counts = new Map()
  for (const p of sipPackets) {
    counts.set(p.srcIp, (counts.get(p.srcIp) || 0) + 1)
    counts.set(p.dstIp, (counts.get(p.dstIp) || 0) + 1)
  }
  let best = null
  let bestN = -1
  for (const [ip, n] of counts) {
    if (n > bestN) {
      best = ip
      bestN = n
    }
  }
  return best
}

function attachDirection(msg, srcIp, srcPort, dstIp, dstPort, serverIp) {
  const next = { ...msg }
  if (srcIp === serverIp) {
    next.direction = 'out'
    next.peerIp = dstIp
    next.peerPort = String(dstPort)
    next.peer = `${dstIp}:${dstPort}`
  } else {
    next.direction = 'in'
    next.peerIp = srcIp
    next.peerPort = String(srcPort)
    next.peer = `${srcIp}:${srcPort}`
  }
  // Prefix raw for ladder expand consistency with NetSapiens captures
  const prefix = next.direction === 'in'
    ? `Received Packet from ${next.peer}\n`
    : `Sending Packet to ${next.peer}\n`
  if (!String(next.raw || '').startsWith('Received') && !String(next.raw || '').startsWith('Sending')) {
    next.raw = `${prefix}${next.raw || ''}`
  }
  return next
}

/**
 * Parse a classic libpcap ArrayBuffer.
 * @param {ArrayBuffer|Uint8Array} input
 * @param {{ onProgress?: (pct: number) => void, maxBytes?: number }} [opts]
 */
export function parsePcap(input, opts = {}) {
  const maxBytes = opts.maxBytes ?? PCAP_MAX_BYTES
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length > maxBytes) {
    return {
      error: {
        code: 'too_large',
        message: `File is ${(bytes.length / (1024 * 1024)).toFixed(0)} MB — over the ${maxBytes / (1024 * 1024)} MB limit. In Wireshark filter with \`udp && (sip || rtp)\`, then File → Export Specified Packets and retry.`,
      },
    }
  }
  if (bytes.length < 24) {
    return { error: { code: 'short', message: 'File is too small to be a pcap.' } }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magicBe = view.getUint32(0, false)

  if (magicBe === MAGIC_PCAPNG) {
    return {
      error: {
        code: 'pcapng',
        message: 'This is a pcapng file — in Wireshark: File → Save As → pcap, then retry.',
      },
    }
  }

  let le = false
  let ns = false
  if (magicBe === MAGIC_BE_US) {
    le = false
    ns = false
  } else if (magicBe === MAGIC_LE_US) {
    le = true
    ns = false
  } else if (magicBe === MAGIC_BE_NS) {
    le = false
    ns = true
  } else if (magicBe === MAGIC_LE_NS) {
    le = true
    ns = true
  } else {
    return {
      error: {
        code: 'magic',
        message: 'Unrecognized file header — expected a classic libpcap capture.',
      },
    }
  }

  const linktype = u32(view, 20, le)
  if (![LINKTYPE_ETHERNET, LINKTYPE_LINUX_SLL, LINKTYPE_RAW].includes(linktype)) {
    return {
      error: {
        code: 'linktype',
        message: `Unsupported link type ${linktype}. Supported: Ethernet, Linux cooked, Raw IP.`,
      },
    }
  }

  let offset = 24
  const udpFrames = []
  let skippedTcpIpv6 = 0
  let packetIndex = 0
  const totalApprox = Math.max(1, bytes.length - 24)

  while (offset + 16 <= bytes.length) {
    const tsSec = u32(view, offset, le)
    const tsFrac = u32(view, offset + 4, le)
    const inclLen = u32(view, offset + 8, le)
    offset += 16
    if (offset + inclLen > bytes.length) break

    const arrivalMs = ns
      ? tsSec * 1000 + tsFrac / 1e6
      : tsSec * 1000 + tsFrac / 1000

    const frameStart = offset
    const frameEnd = offset + inclLen
    offset = frameEnd
    packetIndex++

    if (packetIndex % 500 === 0 && typeof opts.onProgress === 'function') {
      opts.onProgress(Math.min(95, Math.round(((frameStart - 24) / totalApprox) * 100)))
    }

    const link = parseLink(bytes, frameStart, frameEnd, linktype)
    if (!link || link.skipped) continue
    const ip = decodeIpv4(bytes, link.ipOffset)
    if (!ip) {
      // IPv6 or broken
      skippedTcpIpv6++
      continue
    }
    if (ip.protocol === 6) {
      skippedTcpIpv6++
      continue
    }
    if (ip.protocol !== 17) continue // UDP only

    const udp = decodeUdp(bytes, ip.payloadOffset, ip.payloadEnd)
    if (!udp) continue

    udpFrames.push({
      arrivalMs,
      srcIp: ip.src,
      dstIp: ip.dst,
      srcPort: udp.srcPort,
      dstPort: udp.dstPort,
      dataStart: udp.dataStart,
      dataEnd: udp.dataEnd,
    })
  }

  // First pass: SIP
  const sipPackets = []
  for (const f of udpFrames) {
    const text = readAscii(bytes, f.dataStart, f.dataEnd).replace(/\r\n/g, '\n')
    if (!looksLikeSip(text)) continue
    const msg = parseSipMessage(text, f.arrivalMs)
    if (!msg) continue
    sipPackets.push({ ...f, msg, text })
  }

  const serverIp = inferServerIp(sipPackets)
  const sipMessages = sipPackets.map(p => (
    attachDirection(p.msg, p.srcIp, p.srcPort, p.dstIp, p.dstPort, serverIp)
  ))

  const { ports: sdpPorts, rtpmap } = collectSdpPortsAndMaps(sipMessages)

  // Second pass: RTP
  const streams = new Map()
  for (const f of udpFrames) {
    const evenPort = f.srcPort % 2 === 0 || f.dstPort % 2 === 0
    const sdpHit = sdpPorts.has(f.srcPort) || sdpPorts.has(f.dstPort)
    if (!isRtp(bytes, f.dataStart, f.dataEnd, evenPort || sdpHit)) continue
    if (!evenPort && !sdpHit) {
      // require even port unless SDP-referenced
      continue
    }
    const hdr = parseRtpHeader(bytes, f.dataStart, f.dataEnd)
    if (!hdr) continue
    // Skip RTCP-ish: odd ports typically RTCP; also PT 200+ often RTCP
    if (f.srcPort % 2 === 1 && f.dstPort % 2 === 1 && !sdpHit) continue
    if (hdr.pt >= 72 && hdr.pt <= 76) continue // RTCP conflict avoidance range sometimes

    const key = streamKey(hdr.ssrc, f.srcIp, f.srcPort, f.dstIp, f.dstPort)
    if (!streams.has(key)) {
      streams.set(key, {
        key,
        ssrc: hdr.ssrc,
        srcIp: f.srcIp,
        srcPort: f.srcPort,
        dstIp: f.dstIp,
        dstPort: f.dstPort,
        pt: hdr.pt,
        packets: [],
      })
    }
    const stream = streams.get(key)
    stream.packets.push({
      arrivalMs: f.arrivalMs,
      seq: hdr.seq,
      timestamp: hdr.timestamp,
      marker: hdr.marker,
    })
  }

  const rtpStreams = []
  for (const stream of streams.values()) {
    stream.packets.sort((a, b) => a.arrivalMs - b.arrivalMs)
    const map = rtpmap.get(stream.pt) || STATIC_PT[stream.pt] || { codec: `PT${stream.pt}`, rate: 8000 }
    const clockRate = map.rate || 8000
    const loss = computeRtpLoss(stream.packets)
    const jitterMs = computeRtpJitterMs(stream.packets, clockRate)
    const first = stream.packets[0]
    const last = stream.packets[stream.packets.length - 1]
    rtpStreams.push({
      key: stream.key,
      ssrc: stream.ssrc,
      srcIp: stream.srcIp,
      srcPort: stream.srcPort,
      dstIp: stream.dstIp,
      dstPort: stream.dstPort,
      pt: stream.pt,
      codec: map.codec,
      clockRate,
      packetCount: stream.packets.length,
      durationMs: last && first ? last.arrivalMs - first.arrivalMs : 0,
      lossPct: loss.lossPct,
      lost: loss.lost,
      expected: loss.expected,
      jitterMs,
      firstMs: first?.arrivalMs ?? null,
      lastMs: last?.arrivalMs ?? null,
      hasMarker: stream.packets.some(p => p.marker),
    })
  }

  if (typeof opts.onProgress === 'function') opts.onProgress(100)

  return {
    linktype,
    endian: le ? 'le' : 'be',
    nanosecond: ns,
    serverIp,
    sipMessages,
    sipPacketCount: sipPackets.length,
    rtpStreams,
    skippedTcpIpv6,
    udpFrameCount: udpFrames.length,
  }
}

function directionLabel(stream, phoneIp, farIp) {
  if (phoneIp && stream.srcIp === phoneIp) return 'phone → far'
  if (phoneIp && stream.dstIp === phoneIp) return 'far → phone'
  if (farIp && stream.srcIp === farIp) return 'far → phone'
  if (farIp && stream.dstIp === farIp) return 'phone → far'
  return `${stream.srcIp} → ${stream.dstIp}`
}

/**
 * Merge RTP / capture findings into enriched sipLadder calls.
 */
export function analyzePcapCapture(parsed) {
  if (parsed?.error) return parsed

  const { calls } = callsFromSipMessages(parsed.sipMessages || [])
  const streams = parsed.rtpStreams || []
  const sdpIps = new Set()
  for (const m of parsed.sipMessages || []) {
    if (m.mediaIp) sdpIps.add(m.mediaIp)
  }

  const tlsHint = parsed.skippedTcpIpv6 > 0
    && (parsed.sipMessages || []).length === 0
    && streams.length > 0

  for (const call of calls) {
    call.serverLabel = 'Server'
    const phoneIp = call.origIp
    const farIp = (call.legs || []).find(l => l.role === 'term')?.peerIp || null

    // Attach stream table rows for this call's timeframe (±2s)
    const start = call.startMs ?? 0
    const end = call.messages?.[call.messages.length - 1]?.unixMs ?? start
    const related = streams.filter(s => {
      if (s.firstMs == null) return true
      return s.firstMs <= end + 2000 && s.lastMs >= start - 2000
    })

    call.audioStreams = related.map(s => ({
      ...s,
      direction: directionLabel(s, phoneIp, farIp),
    }))

    const extra = []

    for (const s of related) {
      if (s.lossPct > 1) {
        extra.push({
          severity: 'error',
          title: 'Packet loss on audio stream',
          body: `Packet loss ${s.lossPct.toFixed(1)}% on the ${directionLabel(s, phoneIp, farIp)} audio stream (${s.codec}, SSRC ${s.ssrc.toString(16)}).`,
        })
      }
      if (s.jitterMs > 30) {
        extra.push({
          severity: 'warn',
          title: 'High jitter',
          body: `Jitter ${s.jitterMs.toFixed(1)} ms on ${directionLabel(s, phoneIp, farIp)} (${s.codec}). Target under 20 ms for clean VoIP.`,
        })
      } else if (s.jitterMs > 20) {
        extra.push({
          severity: 'info',
          title: 'Elevated jitter',
          body: `Jitter ${s.jitterMs.toFixed(1)} ms on ${directionLabel(s, phoneIp, farIp)} — watch for choppy audio.`,
        })
      }

      if (sdpIps.size && !sdpIps.has(s.srcIp) && !sdpIps.has(s.dstIp)) {
        extra.push({
          severity: 'warn',
          title: 'Audio path differs from signaling',
          body: `RTP ${s.srcIp} ↔ ${s.dstIp} is not in any SDP c= line — possible ALG rewrite. See Reference → SIP ALG / firewall notes.`,
        })
      }
    }

    // One-way audio: answered dialog + RTP only one direction between SDP media endpoints
    const answered = call.metrics?.answered
    const offerIp = (call.messages || []).find(m => m.isRequest && m.method === 'INVITE' && m.mediaIp)?.mediaIp
      || [...sdpIps][0]
    const answerIp = (call.messages || []).find(m => m.code === 200 && m.cseqMethod === 'INVITE' && m.mediaIp)?.mediaIp
      || [...sdpIps].find(ip => ip !== offerIp)
      || farIp
      || null

    if (answered && offerIp && answerIp && offerIp !== answerIp) {
      const offerToAnswer = related.filter(s => s.srcIp === offerIp && s.dstIp === answerIp)
      const answerToOffer = related.filter(s => s.srcIp === answerIp && s.dstIp === offerIp)
      if (offerToAnswer.length && !answerToOffer.length) {
        extra.push({
          severity: 'error',
          title: 'One-way audio',
          body: `SIP dialog established but RTP is only flowing offer → answer (${offerIp} → ${answerIp}) — return path is silent. Common causes: NAT, SIP ALG, or firewall blocking the RTP port range. See Reference → Codec & QoS / ports.`,
        })
      } else if (answerToOffer.length && !offerToAnswer.length) {
        extra.push({
          severity: 'error',
          title: 'One-way audio',
          body: `SIP dialog established but RTP is only flowing answer → offer (${answerIp} → ${offerIp}) — outbound from the phone is silent. Common causes: NAT, SIP ALG, or firewall blocking the RTP port range. See Reference → Codec & QoS / ports.`,
        })
      } else if (related.length === 0) {
        extra.push({
          severity: 'warn',
          title: 'No RTP observed',
          body: 'Call was answered in SIP but no RTP streams were found in this capture (filtered or encrypted media).',
        })
      }
    } else if (answered && related.length === 0) {
      extra.push({
        severity: 'warn',
        title: 'No RTP observed',
        body: 'Call was answered in SIP but no RTP streams were found in this capture (filtered or encrypted media).',
      })
    }

    if (tlsHint) {
      extra.push({
        severity: 'info',
        title: 'Encrypted signaling likely',
        body: 'No parseable SIP over UDP, but RTP is present and TCP/IPv6 frames were skipped — signaling may be TLS (5061). Audio metrics below are still analyzable.',
      })
    }

    const baseFindings = analyze(call)
    const merged = [...baseFindings, ...extra]
    const rank = { error: 0, warn: 1, info: 2 }
    merged.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
    // dedupe by title+body
    const seen = new Set()
    call.findings = merged.filter(f => {
      const k = `${f.title}|${f.body}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    if (parsed.skippedTcpIpv6 > 0) {
      call.pcapNote = `${parsed.skippedTcpIpv6} packets skipped (TCP/IPv6).`
    }
  }

  // No SIP but RTP only
  if (!calls.length && streams.length) {
    const synthetic = {
      callId: 'rtp-only',
      messages: [],
      responders: [],
      li: [],
      legs: [],
      phoneLabel: 'Endpoint A',
      farEndLabel: 'Endpoint B',
      serverLabel: 'Server',
      metrics: {},
      codecs: {},
      narrative: 'No SIP messages found in this capture — showing RTP streams only.',
      ladder: [],
      routing: { dialPolicies: [], dialPlans: [], matchingPlan: null, forward: null, translation: null },
      media: { relayed: false, relays: [] },
      audioStreams: streams.map(s => ({ ...s, direction: `${s.srcIp} → ${s.dstIp}` })),
      findings: [],
      result: { label: 'RTP only', tone: 'warn' },
      pcapNote: parsed.skippedTcpIpv6
        ? `${parsed.skippedTcpIpv6} packets skipped (TCP/IPv6).`
        : null,
    }
    if (tlsHint) {
      synthetic.findings.push({
        severity: 'info',
        title: 'Encrypted signaling likely',
        body: 'No parseable SIP over UDP, but RTP is present — signaling may be TLS (5061). Audio metrics are still analyzable.',
      })
    }
    for (const s of streams) {
      if (s.lossPct > 1) {
        synthetic.findings.push({
          severity: 'error',
          title: 'Packet loss on audio stream',
          body: `Packet loss ${s.lossPct.toFixed(1)}% on ${s.srcIp} → ${s.dstIp} (${s.codec}).`,
        })
      }
    }
    calls.push(synthetic)
  }

  return {
    calls,
    rtpStreams: streams,
    skippedTcpIpv6: parsed.skippedTcpIpv6 || 0,
    serverIp: parsed.serverIp,
    sipPacketCount: parsed.sipPacketCount || 0,
  }
}

/**
 * Full pipeline: bytes → calls + streams.
 */
export function parsePcapFile(buffer, opts = {}) {
  const parsed = parsePcap(buffer, opts)
  if (parsed.error) return parsed
  return analyzePcapCapture(parsed)
}
