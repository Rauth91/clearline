import { describe, expect, it } from 'vitest'
import {
  computeRtpJitterMs,
  computeRtpLoss,
  parsePcap,
  parsePcapFile,
} from '../pcap.js'

function u16be(n) {
  return [(n >> 8) & 0xff, n & 0xff]
}
function u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}
function u32le(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

function concat(...parts) {
  const arrays = parts.map(p => (typeof p === 'string'
    ? Uint8Array.from([...p].map(c => c.charCodeAt(0)))
    : p instanceof Uint8Array ? p : Uint8Array.from(p)))
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of arrays) {
    out.set(a, o)
    o += a.length
  }
  return out
}

/** Little-endian classic pcap global header, Ethernet. */
function pcapHeaderLe() {
  return Uint8Array.from([
    ...u32le(0xa1b2c3d4),
    0x02, 0x00, // major 2
    0x04, 0x00, // minor 4
    0, 0, 0, 0, // thiszone
    0, 0, 0, 0, // sigfigs
    ...u32le(65535),
    ...u32le(1), // LINKTYPE_ETHERNET
  ])
}

function ethIpv4Udp({ srcMac = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55], dstMac = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff], srcIp, dstIp, srcPort, dstPort, payload }) {
  const ipPayload = concat(
    u16be(srcPort),
    u16be(dstPort),
    u16be(8 + payload.length),
    u16be(0), // checksum
    payload,
  )
  const totalLen = 20 + ipPayload.length
  const ip = concat(
    [0x45, 0x00],
    u16be(totalLen),
    u16be(0),
    u16be(0x4000),
    [64, 17], // TTL, UDP
    u16be(0),
    srcIp,
    dstIp,
    ipPayload,
  )
  return concat(dstMac, srcMac, [0x08, 0x00], ip)
}

function pkt(tsSec, tsUsec, frame) {
  return concat(
    u32le(tsSec),
    u32le(tsUsec),
    u32le(frame.length),
    u32le(frame.length),
    frame,
  )
}

function ip4(a, b, c, d) {
  return [a, b, c, d]
}

function rtpPacket({ pt = 0, seq, timestamp, ssrc, marker = 0 }) {
  return concat(
    [(2 << 6), (marker ? 0x80 : 0) | (pt & 0x7f)],
    u16be(seq),
    u32be(timestamp >>> 0),
    u32be(ssrc >>> 0),
    [0, 0, 0, 0], // 4 bytes payload
  )
}

const PHONE = ip4(192, 168, 1, 10)
const SERVER = ip4(10, 0, 0, 5)
const PHONE_IP = '192.168.1.10'
const SERVER_IP = '10.0.0.5'

function sipText(startLine, headers, body = '') {
  const h = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')
  return `${startLine}\r\n${h}\r\n\r\n${body}`
}

const SDP_PHONE = [
  'v=0',
  'o=- 0 0 IN IP4 192.168.1.10',
  's=-',
  'c=IN IP4 192.168.1.10',
  't=0 0',
  'm=audio 10000 RTP/AVP 0',
  'a=rtpmap:0 PCMU/8000',
].join('\r\n')

const SDP_SERVER = [
  'v=0',
  'o=- 0 0 IN IP4 10.0.0.5',
  's=-',
  'c=IN IP4 10.0.0.5',
  't=0 0',
  'm=audio 20000 RTP/AVP 0',
  'a=rtpmap:0 PCMU/8000',
].join('\r\n')

function buildCallPcap({ oneWay = false, lossGaps = true } = {}) {
  const frames = []
  let t = 1_700_000_000

  const invite = sipText(
    'INVITE sip:2000@10.0.0.5 SIP/2.0',
    {
      Via: 'SIP/2.0/UDP 192.168.1.10:5060;branch=z9hG4bK1',
      From: '<sip:1000@192.168.1.10>;tag=from1',
      To: '<sip:2000@10.0.0.5>',
      'Call-ID': 'pcap-test-call-1',
      CSeq: '1 INVITE',
      Contact: '<sip:1000@192.168.1.10:5060>',
      'Content-Type': 'application/sdp',
      'Content-Length': String(SDP_PHONE.length),
    },
    SDP_PHONE,
  )
  frames.push(pkt(t, 0, ethIpv4Udp({
    srcIp: PHONE, dstIp: SERVER, srcPort: 5060, dstPort: 5060,
    payload: Uint8Array.from([...invite].map(c => c.charCodeAt(0))),
  })))

  t += 1
  const ok200 = sipText(
    'SIP/2.0 200 OK',
    {
      Via: 'SIP/2.0/UDP 192.168.1.10:5060;branch=z9hG4bK1',
      From: '<sip:1000@192.168.1.10>;tag=from1',
      To: '<sip:2000@10.0.0.5>;tag=to1',
      'Call-ID': 'pcap-test-call-1',
      CSeq: '1 INVITE',
      Contact: '<sip:2000@10.0.0.5:5060>',
      'Content-Type': 'application/sdp',
      'Content-Length': String(SDP_SERVER.length),
    },
    SDP_SERVER,
  )
  frames.push(pkt(t, 0, ethIpv4Udp({
    srcIp: SERVER, dstIp: PHONE, srcPort: 5060, dstPort: 5060,
    payload: Uint8Array.from([...ok200].map(c => c.charCodeAt(0))),
  })))

  t += 1
  const ack = sipText(
    'ACK sip:2000@10.0.0.5 SIP/2.0',
    {
      Via: 'SIP/2.0/UDP 192.168.1.10:5060;branch=z9hG4bK2',
      From: '<sip:1000@192.168.1.10>;tag=from1',
      To: '<sip:2000@10.0.0.5>;tag=to1',
      'Call-ID': 'pcap-test-call-1',
      CSeq: '1 ACK',
      'Content-Length': '0',
    },
  )
  frames.push(pkt(t, 0, ethIpv4Udp({
    srcIp: PHONE, dstIp: SERVER, srcPort: 5060, dstPort: 5060,
    payload: Uint8Array.from([...ack].map(c => c.charCodeAt(0))),
  })))

  // RTP phone → server (100 packets, maybe gaps)
  const ssrcA = 0x11111111
  let seq = 1000
  let tsRtp = 0
  for (let i = 0; i < 100; i++) {
    if (lossGaps && (i === 10 || i === 11)) {
      // skip two sequence numbers → ~2% loss over 100
      seq += 1
      tsRtp += 160
      continue
    }
    t += 0 // advance usec
    const usec = i * 20000
    frames.push(pkt(t + Math.floor(usec / 1e6), usec % 1e6, ethIpv4Udp({
      srcIp: PHONE, dstIp: SERVER, srcPort: 10000, dstPort: 20000,
      payload: rtpPacket({ pt: 0, seq, timestamp: tsRtp, ssrc: ssrcA }),
    })))
    seq += 1
    tsRtp += 160
  }

  if (!oneWay) {
    const ssrcB = 0x22222222
    seq = 2000
    tsRtp = 0
    for (let i = 0; i < 100; i++) {
      const usec = i * 20000
      frames.push(pkt(t + Math.floor(usec / 1e6), usec % 1e6, ethIpv4Udp({
        srcIp: SERVER, dstIp: PHONE, srcPort: 20000, dstPort: 10000,
        payload: rtpPacket({ pt: 0, seq, timestamp: tsRtp, ssrc: ssrcB }),
      })))
      seq += 1
      tsRtp += 160
    }
  }

  t += 3
  const bye = sipText(
    'BYE sip:2000@10.0.0.5 SIP/2.0',
    {
      Via: 'SIP/2.0/UDP 192.168.1.10:5060;branch=z9hG4bK3',
      From: '<sip:1000@192.168.1.10>;tag=from1',
      To: '<sip:2000@10.0.0.5>;tag=to1',
      'Call-ID': 'pcap-test-call-1',
      CSeq: '2 BYE',
      'Content-Length': '0',
    },
  )
  frames.push(pkt(t, 0, ethIpv4Udp({
    srcIp: PHONE, dstIp: SERVER, srcPort: 5060, dstPort: 5060,
    payload: Uint8Array.from([...bye].map(c => c.charCodeAt(0))),
  })))

  return concat(pcapHeaderLe(), ...frames)
}

describe('pcap magic / format', () => {
  it('rejects pcapng with convert guidance', () => {
    const buf = new Uint8Array(32)
    buf[0] = 0x0a
    buf[1] = 0x0d
    buf[2] = 0x0d
    buf[3] = 0x0a
    const r = parsePcap(buf)
    expect(r.error?.code).toBe('pcapng')
    expect(r.error.message).toMatch(/pcapng/i)
    expect(r.error.message).toMatch(/Save As/i)
  })
})

describe('RTP math', () => {
  it('computes ~2% loss from sequence gaps', () => {
    const packets = []
    let seq = 1000
    for (let i = 0; i < 100; i++) {
      if (i === 10 || i === 11) {
        seq += 1
        continue
      }
      packets.push({ arrivalMs: i * 20, seq, timestamp: i * 160 })
      seq += 1
    }
    const loss = computeRtpLoss(packets)
    expect(loss.lossPct).toBeGreaterThan(1.5)
    expect(loss.lossPct).toBeLessThan(3.5)
  })

  it('computes interarrival jitter in ms', () => {
    const packets = []
    for (let i = 0; i < 30; i++) {
      // steady 20ms arrival, 160 ts @ 8kHz
      packets.push({ arrivalMs: i * 20, seq: i, timestamp: i * 160 })
    }
    // inject one late packet
    packets[15].arrivalMs += 40
    const j = computeRtpJitterMs(packets, 8000)
    expect(j).toBeGreaterThan(0)
  })
})

describe('parsePcapFile call fixture', () => {
  it('parses SIP dialog + two RTP streams and flags loss', () => {
    const buf = buildCallPcap({ oneWay: false, lossGaps: true })
    const result = parsePcapFile(buf)
    expect(result.error).toBeUndefined()
    expect(result.calls.length).toBeGreaterThanOrEqual(1)
    const call = result.calls[0]
    expect(call.messages.length).toBeGreaterThanOrEqual(4)
    expect(call.audioStreams?.length).toBeGreaterThanOrEqual(2)
    const lossy = call.audioStreams.find(s => s.lossPct > 1)
    expect(lossy).toBeTruthy()
    expect(call.findings.some(f => /Packet loss/i.test(f.title))).toBe(true)
    expect(call.ladder?.length).toBeGreaterThan(0)
    expect(call.serverLabel).toBe('Server')
  })

  it('detects one-way audio naming the silent direction', () => {
    const buf = buildCallPcap({ oneWay: true, lossGaps: false })
    const result = parsePcapFile(buf)
    const call = result.calls[0]
    const ow = call.findings.find(f => /One-way audio/i.test(f.title))
    expect(ow).toBeTruthy()
    expect(ow.severity).toBe('error')
    expect(ow.body).toMatch(/silent|only flowing/i)
    expect(call.audioStreams.length).toBe(1)
  })
})

void PHONE_IP
void SERVER_IP
