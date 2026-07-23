/**
 * sipLadder — parse NetSapiens SIP capture CSV into calls, metrics, findings, narrative.
 * Pure functions; no DOM.
 */

const METHODS = [
  'INVITE', 'ACK', 'BYE', 'CANCEL', 'REGISTER', 'OPTIONS', 'NOTIFY',
  'SUBSCRIBE', 'REFER', 'UPDATE', 'INFO', 'PRACK', 'MESSAGE', 'PUBLISH',
]

const SIP_MEANINGS = {
  400: 'Bad Request — malformed SIP',
  403: 'Forbidden — credentials or policy rejected the call',
  404: 'Not Found — number or extension not found',
  408: 'Request Timeout — no response in time',
  480: 'Temporarily Unavailable — far end unreachable or offline',
  486: 'Busy Here — destination is busy or on DND',
  487: 'Request Terminated — cancelled before answer',
  488: 'Not Acceptable Here — media/codec mismatch',
  500: 'Server Internal Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Server Time-out',
  600: 'Busy Everywhere',
  603: 'Decline — far end rejected the call',
  604: 'Does Not Exist Anywhere',
}

function isPrivateIp(ip) {
  if (!ip) return false
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const n = Number(m[1])
    return n >= 16 && n <= 31
  }
  return ip.startsWith('127.')
}

function parseSipUri(raw) {
  if (!raw) return null
  const m = String(raw).match(/sip:([^@;>]+)@([^;>]+)/i)
  if (!m) return null
  return { user: m[1], host: m[2].split(':')[0], uri: `${m[1]}@${m[2].split(':')[0]}` }
}

function headerValue(raw, name) {
  const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, 'im')
  const m = String(raw).match(re)
  return m ? m[1].trim() : null
}

function formatDelta(ms) {
  if (ms == null || Number.isNaN(ms)) return ''
  if (Math.abs(ms) >= 1000) {
    const s = ms / 1000
    return `+${s.toFixed(s >= 10 ? 1 : 2)}s`
  }
  return `+${Math.round(ms)}ms`
}

/**
 * Parse CSV/TSV with quoted multiline cells.
 * @returns {{ rows: string[][], error?: { line: number, reason: string } }}
 */
export function parseDelimited(rawText) {
  const raw = String(rawText || '')
  if (!raw.trim()) {
    return { rows: [], error: { line: 1, reason: 'Empty input' } }
  }

  const firstLine = raw.split(/\r?\n/, 1)[0] || ''
  const unquoted = firstLine.replace(/"[^"]*"/g, '')
  const delim = (unquoted.match(/\t/g) || []).length > (unquoted.match(/,/g) || []).length ? '\t' : ','

  const rows = []
  let fields = []
  let field = ''
  let i = 0
  let inQuotes = false
  let lineNum = 1
  let rowStartLine = 1
  const n = raw.length

  while (i < n) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      if (ch === '\n') lineNum++
      if (ch === '\r') {
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delim) {
      fields.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      fields.push(field)
      if (fields.some(f => String(f).trim() !== '')) rows.push({ fields, line: rowStartLine })
      fields = []
      field = ''
      lineNum++
      rowStartLine = lineNum
      i++
      continue
    }
    field += ch
    i++
  }

  if (inQuotes) {
    return { rows: [], error: { line: rowStartLine, reason: 'Unclosed quoted field' } }
  }
  fields.push(field)
  if (fields.some(f => String(f).trim() !== '')) rows.push({ fields, line: rowStartLine })

  return { rows: rows.map(r => r.fields), meta: rows.map(r => r.line), delim }
}

function detectHeader(fields) {
  const joined = fields.map(f => String(f).trim().toLowerCase()).join('|')
  return joined.includes('time stamp') || joined.includes('unixtsm') || joined.includes('unix tsm')
}

function mapRow(fields) {
  // Time Stamp, Index, Type, Text, Host, UnixTsm — or positional without header
  if (fields.length >= 6) {
    return {
      timeStamp: fields[0],
      index: fields[1],
      type: String(fields[2] || '').trim().toLowerCase(),
      text: fields[3] || '',
      host: fields[4] || '',
      unixTsm: fields[5],
    }
  }
  if (fields.length >= 4) {
    return {
      timeStamp: fields[0],
      index: fields[1] || '',
      type: String(fields[2] || '').trim().toLowerCase(),
      text: fields[3] || '',
      host: '',
      unixTsm: fields[4] || '',
    }
  }
  return null
}

function parseSipMessage(text, unixMs) {
  const raw = String(text || '').replace(/\r\n/g, '\n')
  const lines = raw.split('\n')
  const msg = {
    raw,
    unixMs,
    direction: null, // 'in' | 'out' relative to NetSapiens
    peer: null,
    peerIp: null,
    peerPort: null,
    startLine: null,
    method: null,
    code: null,
    reason: null,
    callId: null,
    cseq: null,
    cseqNum: null,
    cseqMethod: null,
    from: null,
    to: null,
    userAgent: null,
    contact: null,
    contactIp: null,
    viaIp: null,
    sdp: null,
    codecs: [],
    ptime: null,
    mediaIp: null,
    mediaPort: null,
    isRequest: false,
    isResponse: false,
  }

  for (const line of lines) {
    const rcv = line.match(/^Received Packet from\s+(\d+\.\d+\.\d+\.\d+):(\d+)/i)
    if (rcv) {
      msg.direction = 'in'
      msg.peer = `${rcv[1]}:${rcv[2]}`
      msg.peerIp = rcv[1]
      msg.peerPort = rcv[2]
      continue
    }
    const snd = line.match(/^Sending(?: Packet)? to\s+(\d+\.\d+\.\d+\.\d+):(\d+)/i)
    if (snd) {
      msg.direction = 'out'
      msg.peer = `${snd[1]}:${snd[2]}`
      msg.peerIp = snd[1]
      msg.peerPort = snd[2]
      continue
    }
  }

  // Find SIP start line (skip transport prefix lines)
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^Received Packet/i.test(line) || /^Sending/i.test(line)) continue
    const req = line.match(/^([A-Z]+)\s+sip:/i)
    if (req && METHODS.includes(req[1].toUpperCase())) {
      msg.startLine = line
      msg.method = req[1].toUpperCase()
      msg.isRequest = true
      startIdx = i
      break
    }
    const resp = line.match(/^SIP\/2\.0\s+(\d{3})\s+(.*)$/i)
    if (resp) {
      msg.startLine = line
      msg.code = Number(resp[1])
      msg.reason = (resp[2] || '').trim()
      msg.method = `${resp[1]} ${msg.reason}`.trim()
      msg.isResponse = true
      startIdx = i
      break
    }
  }

  if (startIdx < 0) return null

  const headerBlock = lines.slice(startIdx).join('\n')
  msg.callId = headerValue(headerBlock, 'Call-ID') || headerValue(headerBlock, 'i')
  const cseq = headerValue(headerBlock, 'CSeq')
  if (cseq) {
    msg.cseq = cseq
    const cm = cseq.match(/^(\d+)\s+(\S+)/)
    if (cm) {
      msg.cseqNum = Number(cm[1])
      msg.cseqMethod = cm[2].toUpperCase()
      if (msg.isResponse) msg.method = `${msg.code} ${msg.reason}`.trim()
    }
  }

  const fromH = headerValue(headerBlock, 'From') || headerValue(headerBlock, 'f')
  const toH = headerValue(headerBlock, 'To') || headerValue(headerBlock, 't')
  msg.from = parseSipUri(fromH)
  if (msg.from && fromH) {
    const name = fromH.match(/^"?([^"<]*)"?\s*</)
    if (name) msg.from.display = name[1].trim()
  }
  msg.to = parseSipUri(toH)
  msg.userAgent = headerValue(headerBlock, 'User-Agent')
  msg.contact = headerValue(headerBlock, 'Contact') || headerValue(headerBlock, 'm')
  if (msg.contact) {
    const cip = msg.contact.match(/@(\d+\.\d+\.\d+\.\d+)/)
    if (cip) msg.contactIp = cip[1]
  }
  const via = headerValue(headerBlock, 'Via') || headerValue(headerBlock, 'v')
  if (via) {
    const vip = via.match(/(\d+\.\d+\.\d+\.\d+)/)
    if (vip) msg.viaIp = vip[1]
  }

  const sdpIdx = headerBlock.search(/\n\n/)
  if (sdpIdx >= 0) {
    const body = headerBlock.slice(sdpIdx + 2).trim()
    if (/^v=0/m.test(body) || /m=audio/i.test(body)) {
      msg.sdp = body
      const codecs = []
      for (const line of body.split('\n')) {
        const rtp = line.match(/^a=rtpmap:(\d+)\s+([^\s/]+)(?:\/(\d+))?/i)
        if (rtp) {
          codecs.push({
            pt: rtp[1],
            codec: rtp[2],
            rate: rtp[3] || null,
            label: rtp[3] ? `${rtp[2]}/${rtp[3]}` : rtp[2],
          })
        }
        const pt = line.match(/^a=ptime:(\d+)/i)
        if (pt) msg.ptime = Number(pt[1])
        const c = line.match(/^c=IN IP4 (\d+\.\d+\.\d+\.\d+)/i)
        if (c) msg.mediaIp = c[1]
        const m = line.match(/^m=audio\s+(\d+)/i)
        if (m) msg.mediaPort = Number(m[1])
      }
      msg.codecs = codecs.filter(c => !/telephone-event/i.test(c.codec))
    }
  }

  return msg
}

function extractSessionId(text) {
  const m = String(text).match(/\((\d{10,})\)/)
  if (m) return m[1]
  const m2 = String(text).match(/(?:CheckDialPolicy|ApplyDialPlan|SetupForwardLeg|UpdateCdr|UpdateRtp|SetAnswer|SetRoute|GetRtp|RestartRtp)[^(]*\((\d+)/)
  return m2 ? m2[1] : null
}

function classifyCodec(name) {
  const n = String(name || '').toUpperCase()
  if (n.includes('G722') && !n.includes('G7221')) return { name: n.split('/')[0], class: 'HD' }
  if (n.includes('G7221')) return { name: n.split('/')[0], class: 'HD' }
  if (n === 'PCMU' || n === 'PCMA' || n.startsWith('PCMU') || n.startsWith('PCMA')) {
    return { name: n.split('/')[0], class: 'standard' }
  }
  if (n.includes('G729')) return { name: 'G729', class: 'low-bandwidth' }
  return { name: n.split('/')[0] || n, class: 'other' }
}

function ratePdd(seconds) {
  if (seconds == null) return null
  if (seconds < 3) return 'good'
  if (seconds <= 6) return 'warn'
  return 'bad'
}

function buildLegs(messages) {
  const byPeer = new Map()
  for (const m of messages) {
    if (!m.peerIp) continue
    if (!byPeer.has(m.peerIp)) {
      byPeer.set(m.peerIp, {
        peerIp: m.peerIp,
        peer: m.peer,
        messages: [],
        cseqs: new Set(),
      })
    }
    const leg = byPeer.get(m.peerIp)
    leg.messages.push(m)
    if (m.cseqNum != null) leg.cseqs.add(`${m.cseqNum}:${m.cseqMethod || ''}`)
  }

  const firstInvite = messages.find(m => m.isRequest && m.method === 'INVITE')
  const origIp = firstInvite?.peerIp || null

  const legs = [...byPeer.values()].map(leg => ({
    ...leg,
    role: leg.peerIp === origIp ? 'orig' : 'term',
  }))

  // Prefer stable order: orig first
  legs.sort((a, b) => {
    if (a.role === 'orig' && b.role !== 'orig') return -1
    if (b.role === 'orig' && a.role !== 'orig') return 1
    return String(a.peerIp).localeCompare(String(b.peerIp))
  })

  return { legs, origIp, firstInvite }
}

function buildRouting(responders) {
  const dialPolicies = []
  const dialPlans = []
  let matchingPlan = null
  let forward = null
  let translation = null

  for (const r of responders) {
    const text = r.text
    const pol = text.match(/CheckDialPolicy\([^)]*\)\s*(\S+)?\s*(?:result=)?(\w+)?/i)
    if (/CheckDialPolicy/i.test(text)) {
      dialPolicies.push(text.trim())
    }
    const plan = text.match(/ApplyDialPlan\(([^)]*)\)\s*<([^>]+)>/i)
    if (plan) {
      const entry = {
        raw: text.trim(),
        index: plan[1],
        name: plan[2],
        match: /MATCH/i.test(text),
      }
      dialPlans.push(entry)
      if (entry.match) matchingPlan = entry.name
    }
    const fwd = text.match(/SetupForwardLeg\([^)]*\)\s*<sip:([^@>]+)@([^>]+)>/i)
    if (fwd) {
      forward = {
        user: fwd[1],
        domain: fwd[2],
        uri: `${fwd[1]}@${fwd[2]}`,
        onNet: true,
        raw: text.trim(),
      }
    }
  }

  return {
    dialPolicies,
    dialPlans,
    matchingPlan,
    forward,
    translation,
    destinationType: forward?.onNet ? 'on-net subscriber' : 'carrier',
  }
}

function buildMedia(responders) {
  const relays = []
  let rtpSession = null
  for (const r of responders) {
    const text = r.text
    if (/UpdateRtpRelay|RestartRtpRelay/i.test(text)) {
      const ports = text.match(/orig=(\d+)\s+term=(\d+)/i)
      relays.push({
        raw: text.trim(),
        kind: /Restart/i.test(text) ? 'restart' : 'update',
        origPort: ports ? ports[1] : null,
        termPort: ports ? ports[2] : null,
      })
    }
    const sess = text.match(/GetRtpSession\(([^)]+)\)/i)
    if (sess) rtpSession = sess[1]
  }
  return {
    relayed: relays.length > 0,
    relays,
    rtpSession,
  }
}

function parseCdrDuration(responders) {
  for (const r of responders) {
    const m = r.text.match(/UpdateCdrDuration[^\n]*Duration=(\d+)s\s+Hold=(\d+)s\s+Talk=(\d+)s/i)
    if (m) {
      return { durationSec: Number(m[1]), holdSec: Number(m[2]), talkSec: Number(m[3]) }
    }
  }
  return null
}

function parseCdrMedia(responders) {
  for (const r of responders) {
    const m = r.text.match(/UpdateCdrMedia[^\n]*Media='([^']+)'/i)
    if (m) return m[1]
  }
  return null
}

export function computeMetrics(call) {
  const messages = call.messages || []
  const responders = call.responders || []
  const t0 = messages[0]?.unixMs ?? call.startMs ?? 0

  const origIp = call.legs?.find(l => l.role === 'orig')?.peerIp
  const origMsgs = messages.filter(m => m.peerIp === origIp)
  const termMsgs = messages.filter(m => call.legs?.some(l => l.role === 'term' && l.peerIp === m.peerIp))

  const firstInvite = messages.find(m => m.isRequest && m.method === 'INVITE')
  const firstProgressOrig = origMsgs.find(m => m.code === 180 || m.code === 183)
  const first180 = messages.find(m => m.code === 180)
  const answer200 = messages.find(m => m.code === 200 && (m.cseqMethod === 'INVITE' || /INVITE/i.test(m.cseq || '')))

  let postDialDelayMs = null
  if (firstInvite && firstProgressOrig) {
    postDialDelayMs = firstProgressOrig.unixMs - firstInvite.unixMs
  } else if (firstInvite && first180) {
    postDialDelayMs = first180.unixMs - firstInvite.unixMs
  }

  let ringBeforeAnswerMs = null
  if (first180 && answer200) {
    ringBeforeAnswerMs = answer200.unixMs - first180.unixMs
  }

  const cdr = parseCdrDuration(responders)
  let talkSec = cdr?.talkSec ?? null
  let holdSec = cdr?.holdSec ?? null
  let durationSec = cdr?.durationSec ?? null

  if (talkSec == null && answer200) {
    const bye = messages.find(m => m.isRequest && m.method === 'BYE')
    if (bye) talkSec = Math.round((bye.unixMs - answer200.unixMs) / 1000)
  }

  const bye = messages.find(m => m.isRequest && m.method === 'BYE')
  const cancel = messages.find(m => m.isRequest && m.method === 'CANCEL')
  let endedBy = null
  let endedByRole = null
  if (cancel && !answer200) {
    endedBy = 'caller abandoned (CANCEL)'
    endedByRole = 'orig'
  } else if (bye) {
    const termIps = new Set((call.legs || []).filter(l => l.role === 'term').map(l => l.peerIp))
    if (bye.direction === 'in' && termIps.has(bye.peerIp)) {
      endedBy = 'far end'
      endedByRole = 'term'
    } else if (bye.direction === 'in' && bye.peerIp === origIp) {
      endedBy = 'caller'
      endedByRole = 'orig'
    } else if (bye.direction === 'out' && bye.peerIp === origIp) {
      // NS sending BYE to phone — originated from far
      endedBy = 'far end'
      endedByRole = 'term'
    } else if (bye.direction === 'out' && termIps.has(bye.peerIp)) {
      endedBy = 'caller'
      endedByRole = 'orig'
    } else {
      endedBy = bye.direction === 'in' ? 'far end' : 'caller'
      endedByRole = bye.direction === 'in' ? 'term' : 'orig'
    }
  }

  const pddSec = postDialDelayMs != null ? postDialDelayMs / 1000 : null

  return {
    t0,
    postDialDelayMs,
    postDialDelaySec: pddSec,
    postDialRating: ratePdd(pddSec),
    ringBeforeAnswerMs,
    ringBeforeAnswerSec: ringBeforeAnswerMs != null ? ringBeforeAnswerMs / 1000 : null,
    talkSec,
    holdSec,
    durationSec,
    endedBy,
    endedByRole,
    answered: Boolean(answer200),
    cancelled: Boolean(cancel && !answer200),
  }
}

export function extractCodecs(call) {
  const messages = call.messages || []
  const inviteWithSdp = messages.find(m => m.isRequest && m.method === 'INVITE' && m.codecs?.length)
  const okWithSdp = messages.find(m => m.code === 200 && m.cseqMethod === 'INVITE' && m.codecs?.length)
  const offered = inviteWithSdp?.codecs?.map(c => c.codec) || []
  const negotiatedList = okWithSdp?.codecs?.map(c => c.codec) || []
  const cdrMedia = parseCdrMedia(call.responders || [])
  let negotiated = negotiatedList[0] || null
  if (cdrMedia) {
    const name = cdrMedia.split('/')[0]
    if (!negotiated || negotiated.toUpperCase() !== name.toUpperCase()) {
      // Prefer SDP answer; keep CDR as cross-check
      if (!negotiated) negotiated = name
    }
  }
  const classified = negotiated ? classifyCodec(negotiated) : null
  return {
    offered,
    offeredDetailed: inviteWithSdp?.codecs || [],
    negotiated,
    negotiatedList,
    negotiatedClass: classified?.class || null,
    ptime: okWithSdp?.ptime ?? inviteWithSdp?.ptime ?? null,
    cdrMedia,
  }
}

function failureCodeMeaning(code) {
  return SIP_MEANINGS[code] || `SIP ${code}`
}

export function analyze(call) {
  const findings = []
  const messages = call.messages || []
  const responders = call.responders || []
  const li = call.li || []

  const skipAsError = new Set([401, 407, 486, 487])
  const failureCodes = messages.filter(m => m.code && m.code >= 400)
  for (const m of failureCodes) {
    if (m.code === 401 || m.code === 407) continue // auth — not a finding
    if (m.code === 487) {
      findings.push({
        severity: 'info',
        title: `Request terminated (${m.code})`,
        body: failureCodeMeaning(m.code),
        sipCode: m.code,
      })
      continue
    }
    if (m.code === 486) {
      findings.push({
        severity: 'error',
        title: `Busy (${m.code})`,
        body: failureCodeMeaning(m.code),
        sipCode: m.code,
      })
      continue
    }
    // 4xx (except context-dependent), 5xx, 6xx
    if (m.code >= 400 && m.code < 500 && skipAsError.has(m.code)) continue
    if (m.code >= 400) {
      const sev = m.code >= 500 || m.code >= 600 || (m.code >= 400 && ![401, 407, 486, 487].includes(m.code))
        ? 'error'
        : 'warn'
      findings.push({
        severity: sev,
        title: `SIP ${m.code}${m.reason ? ` ${m.reason}` : ''}`,
        body: failureCodeMeaning(m.code),
        sipCode: m.code,
      })
    }
  }

  // Retransmissions: identical method/response on one leg within 2s
  for (const leg of call.legs || []) {
    const list = leg.messages || []
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      const labelA = a.isResponse ? String(a.code) : a.method
      const labelB = b.isResponse ? String(b.code) : b.method
      if (labelA && labelA === labelB && Math.abs(b.unixMs - a.unixMs) <= 2000 && a.cseq === b.cseq) {
        findings.push({
          severity: 'warn',
          title: 'Possible packet loss',
          body: `Retransmission of ${labelA} on ${leg.peerIp} within 2s.`,
          sipCode: a.code || null,
        })
      }
    }
  }

  // NAT
  const invite = messages.find(m => m.isRequest && m.method === 'INVITE' && m.contactIp)
  if (invite?.contactIp && invite.peerIp && invite.contactIp !== invite.peerIp) {
    const contactPrivate = isPrivateIp(invite.contactIp)
    const peerPublic = !isPrivateIp(invite.peerIp)
    if (contactPrivate && peerPublic) {
      if (call.media?.relayed) {
        findings.push({
          severity: 'info',
          title: 'Phone behind NAT',
          body: 'Phone behind NAT; server relays media, one-way-audio risk mitigated.',
        })
      } else {
        findings.push({
          severity: 'warn',
          title: 'Phone behind NAT',
          body: 'Contact/Via private IP differs from packet source. Verify RTPProxy/STUN so media can flow.',
        })
      }
    }
  }

  // Recording
  const servers = []
  for (const row of li) {
    const m = String(row.text).match(/server[=:\s]+([^\s,]+)/i)
      || String(row.text).match(/([\w.-]*rec[\w.-]*\.[\w.-]+)/i)
      || String(row.text).match(/([\w.-]+\.(?:example\.)?com)/i)
    if (m) servers.push(m[1].replace(/,$/, ''))
  }
  const uniqueServers = [...new Set(servers)]
  if (uniqueServers.length) {
    findings.push({
      severity: 'info',
      title: 'Call recording',
      body: `Call captured by ${uniqueServers.join(', ')}.`,
    })
  } else if (li.length) {
    findings.push({
      severity: 'info',
      title: 'Call recording',
      body: 'Call captured by recording servers.',
    })
  }

  // Timeouts
  for (const r of responders) {
    const ans = r.text.match(/SetAnswerTimeout[^\n]*to\s+(\d+)s/i)
    if (ans) {
      findings.push({
        severity: 'info',
        title: 'Answer timeout policy',
        body: `No-answer handling would trigger at ${ans[1]}s.`,
      })
    }
    const route = r.text.match(/SetRouteTimeout[^\n]*to\s+(\d+)s/i)
    if (route) {
      findings.push({
        severity: 'info',
        title: 'Route timeout policy',
        body: `Route timeout set to ${route[1]}s.`,
      })
    }
  }

  const rank = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))

  // Dedupe identical titles
  const seen = new Set()
  return findings.filter(f => {
    const key = `${f.severity}|${f.title}|${f.body}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function describeCall(call) {
  const messages = call.messages || []
  const metrics = call.metrics || computeMetrics(call)
  const codecs = call.codecs || extractCodecs(call)
  const routing = call.routing || {}

  const fromUser = call.from?.user || messages.find(m => m.from)?.from?.user || 'someone'
  const dialed = call.dialed || call.to?.user || messages.find(m => m.to)?.to?.user || 'the destination'

  const fail = messages.find(m => m.code && m.code >= 400 && ![401, 407].includes(m.code)
    && !(m.code === 487))
  const cancel = messages.find(m => m.isRequest && m.method === 'CANCEL')
  const answered = metrics.answered
  const auth = call.authChallenge

  if (fail && !answered) {
    const t = fail.unixMs != null && messages[0]
      ? ((fail.unixMs - messages[0].unixMs) / 1000).toFixed(1)
      : null
    const meaning = failureCodeMeaning(fail.code)
    if (fail.code === 486) {
      return `Extension ${fromUser} dialed ${dialed}; the far end rejected the call with 486 Busy${t ? ` after ${t}s` : ''}.`
    }
    if (fail.code === 480) {
      return `Extension ${fromUser} dialed ${dialed}; the far end was unavailable (480)${t ? ` after ${t}s` : ''}.`
    }
    if (fail.code === 403) {
      return `Extension ${fromUser} dialed ${dialed}; the call was rejected with 403 Forbidden${t ? ` after ${t}s` : ''}.`
    }
    return `Extension ${fromUser} dialed ${dialed}; the call failed with ${fail.code}${t ? ` after ${t}s` : ''} — ${meaning}.`
  }

  if (cancel && !answered) {
    return `Extension ${fromUser} dialed ${dialed} but cancelled (CANCEL) before answer.`
  }

  if (!answered && !fail) {
    return `Extension ${fromUser} dialed ${dialed}; no final response was received (timeout / incomplete capture).`
  }

  const parts = []
  parts.push(`Extension ${fromUser} dialed ${dialed}`)
  if (auth) parts.push('the server asked the phone to authenticate — normal')

  if (routing.forward?.onNet) {
    parts.push(`routed on-net to subscriber ${routing.forward.uri}`)
  } else if (routing.destinationType === 'carrier') {
    parts.push('routed to the carrier')
  }

  if (metrics.ringBeforeAnswerSec != null) {
    parts.push(`rang for ${metrics.ringBeforeAnswerSec.toFixed(1)}s`)
  }
  if (answered) parts.push('was answered')
  if (codecs.negotiated) {
    const cls = codecs.negotiatedClass === 'HD' ? ' (HD)' : codecs.negotiatedClass === 'low-bandwidth' ? ' (low-bandwidth)' : ''
    parts.push(`negotiated ${codecs.negotiated}${cls}`)
  }
  if (metrics.talkSec != null) parts.push(`talked ${metrics.talkSec}s`)
  if (metrics.holdSec) parts.push(`held ${metrics.holdSec}s`)
  if (metrics.endedBy) {
    parts.push(metrics.endedBy === 'far end' ? 'far end hung up' : metrics.endedBy === 'caller' ? 'caller hung up' : metrics.endedBy)
  }

  // Join into readable sentence(s)
  if (parts.length <= 2) return `${parts.join('; ')}.`
  const head = parts[0]
  const rest = parts.slice(1)
  return `${head}: ${rest.join(', ')}.`
}

function enrichCall(base) {
  const { legs, origIp, firstInvite } = buildLegs(base.messages)
  const routing = buildRouting(base.responders)
  const media = buildMedia(base.responders)

  // Dialed number from first INVITE Request-URI or To
  let dialed = firstInvite?.to?.user || null
  const reqUri = firstInvite?.startLine?.match(/sip:([^@;>\s]+)/i)
  if (reqUri) dialed = reqUri[1]

  if (routing.forward && dialed) {
    routing.translation = {
      from: dialed,
      to: routing.forward.uri,
      summary: `${dialed} → ${routing.forward.uri}`,
    }
  }

  // Far-end label
  let farEndLabel = 'Carrier'
  if (routing.forward?.onNet) {
    farEndLabel = `Subscriber ${routing.forward.uri}`
  } else {
    const term = legs.find(l => l.role === 'term')
    if (term) farEndLabel = `Peer ${term.peerIp}`
  }

  const from = firstInvite?.from || base.messages.find(m => m.from)?.from || null
  const phoneExt = from?.user || '—'
  const phoneLabel = `Phone ext ${phoneExt}`

  const call = {
    ...base,
    legs,
    origIp,
    routing,
    media,
    from,
    to: firstInvite?.to || null,
    dialed,
    phoneLabel,
    farEndLabel,
    farEndUri: routing.forward?.uri || null,
    onNet: Boolean(routing.forward?.onNet),
    authChallenge: base.messages.some(m => m.code === 401 || m.code === 407),
  }

  call.metrics = computeMetrics(call)
  call.codecs = extractCodecs(call)
  call.findings = analyze(call)
  call.narrative = describeCall(call)

  // Result badge for picker
  const fail = base.messages.find(m => m.code >= 400 && ![401, 407].includes(m.code))
  if (call.metrics.answered) call.result = { label: 'Connected', tone: 'ok' }
  else if (base.messages.some(m => m.method === 'CANCEL')) call.result = { label: 'Cancelled', tone: 'warn' }
  else if (fail) call.result = { label: String(fail.code), tone: 'err' }
  else call.result = { label: 'Incomplete', tone: 'warn' }

  call.startMs = base.messages[0]?.unixMs || null
  call.startTime = base.messages[0]?.timeStamp || null

  // Ladder events with annotations
  call.ladder = buildLadderEvents(call)

  return call
}

function buildLadderEvents(call) {
  const t0 = call.messages[0]?.unixMs || 0
  const origIp = call.origIp
  const termIps = new Set((call.legs || []).filter(l => l.role === 'term').map(l => l.peerIp))
  const events = []

  for (const m of call.messages) {
    const deltaMs = m.unixMs - t0
    let fromLane = 'ns'
    let toLane = 'ns'
    if (m.direction === 'in') {
      fromLane = m.peerIp === origIp ? 'phone' : 'far'
      toLane = 'ns'
    } else if (m.direction === 'out') {
      fromLane = 'ns'
      toLane = m.peerIp === origIp ? 'phone' : 'far'
    }

    const label = m.isResponse
      ? `${m.code}${m.reason ? ` ${m.reason.split(' ').slice(0, 3).join(' ')}` : ''}`
      : m.method

    let tone = 'request'
    if (m.code) {
      if (m.code < 200) tone = 'provisional'
      else if (m.code < 300) tone = 'success'
      else if (m.code < 400) tone = 'redirect'
      else if (m.code === 401 || m.code === 407) tone = 'auth'
      else if (m.code < 500) tone = 'client-err'
      else tone = 'server-err'
    } else if (m.method === 'ACK') {
      tone = 'ack'
    } else if (m.method === 'BYE' || m.method === 'CANCEL') {
      tone = 'bye'
    }

    const annotations = []
    if (m.code === 401 || m.code === 407) {
      annotations.push('normal — phone must sign in')
    }
    if (m.code === 183) annotations.push('early media')
    if (m.isRequest && m.method === 'BYE') {
      annotations.push(
        m.peerIp === origIp || (m.direction === 'out' && termIps.has(m.peerIp))
          ? (call.metrics?.endedByRole === 'orig' ? 'caller hung up' : 'far end hung up')
          : (call.metrics?.endedBy === 'far end' ? 'far end hung up' : 'caller hung up'),
      )
    }

    // Retransmit annotation
    const legMsgs = (call.legs || []).find(l => l.peerIp === m.peerIp)?.messages || []
    const idx = legMsgs.indexOf(m)
    if (idx > 0) {
      const prev = legMsgs[idx - 1]
      const la = prev.isResponse ? String(prev.code) : prev.method
      const lb = m.isResponse ? String(m.code) : m.method
      if (la === lb && prev.cseq === m.cseq && Math.abs(m.unixMs - prev.unixMs) <= 2000) {
        annotations.push('retransmission')
      }
    }

    const isAnswer = m.code === 200 && m.cseqMethod === 'INVITE'

    events.push({
      deltaMs,
      deltaLabel: formatDelta(deltaMs),
      fromLane,
      toLane,
      label: label.trim(),
      tone,
      annotations,
      isAnswer,
      raw: m.raw,
      code: m.code,
      method: m.method,
      message: m,
    })
  }

  return events
}

/**
 * @param {string} rawText
 * @returns {{ calls: object[], error?: { line: number, reason: string } }}
 */
export function parseCapture(rawText) {
  const parsed = parseDelimited(rawText)
  if (parsed.error) return { calls: [], error: parsed.error }

  const rows = parsed.rows
  if (!rows.length) {
    return { calls: [], error: { line: 1, reason: 'No rows found' } }
  }

  let start = 0
  if (detectHeader(rows[0])) start = 1

  const records = []
  for (let i = start; i < rows.length; i++) {
    const lineNo = (parsed.meta && parsed.meta[i]) || i + 1
    const mapped = mapRow(rows[i])
    if (!mapped) {
      return { calls: [], error: { line: lineNo, reason: `Expected at least 4 columns, found ${rows[i].length}` } }
    }
    if (!mapped.type && !mapped.text) continue
    const unixMs = Number(mapped.unixTsm)
    if (mapped.type === 'info' || mapped.type === 'responder' || mapped.type === 'li') {
      if (!Number.isFinite(unixMs) && mapped.type === 'info') {
        // allow missing unix for non-critical; still try
      }
      records.push({
        ...mapped,
        unixMs: Number.isFinite(unixMs) ? unixMs : 0,
        line: lineNo,
      })
    } else if (mapped.text && /INVITE |SIP\/2\.0 /.test(mapped.text)) {
      // typeless but looks like SIP
      records.push({
        ...mapped,
        type: 'info',
        unixMs: Number.isFinite(unixMs) ? unixMs : 0,
        line: lineNo,
      })
    }
  }

  if (!records.length) {
    return { calls: [], error: { line: start + 1, reason: 'No NetSapiens info/responder/li rows found' } }
  }

  // Extract SIP messages and group
  const sipByCall = new Map()
  const responders = []
  const liRows = []

  for (const rec of records) {
    if (rec.type === 'responder') {
      responders.push(rec)
      continue
    }
    if (rec.type === 'li') {
      liRows.push(rec)
      continue
    }
    if (rec.type !== 'info') continue

    const msg = parseSipMessage(rec.text, rec.unixMs)
    if (!msg) continue
    msg.timeStamp = rec.timeStamp
    msg.line = rec.line
    const cid = msg.callId || 'unknown'
    if (!sipByCall.has(cid)) sipByCall.set(cid, [])
    sipByCall.get(cid).push(msg)
  }

  // Attach responders by session id overlap with messages' timeframe / shared session
  const sessionToCall = new Map()
  for (const r of responders) {
    const sid = extractSessionId(r.text)
    if (!sid) continue
    // Prefer call whose messages surround this timestamp
    let best = null
    let bestDist = Infinity
    for (const [cid, msgs] of sipByCall) {
      if (!msgs.length) continue
      const start = msgs[0].unixMs
      const end = msgs[msgs.length - 1].unixMs
      if (r.unixMs >= start - 5000 && r.unixMs <= end + 5000) {
        const dist = Math.min(Math.abs(r.unixMs - start), Math.abs(r.unixMs - end))
        if (dist < bestDist) {
          bestDist = dist
          best = cid
        }
      }
    }
    if (best) sessionToCall.set(sid, best)
  }

  const respondersByCall = new Map()
  const liByCall = new Map()
  for (const cid of sipByCall.keys()) {
    respondersByCall.set(cid, [])
    liByCall.set(cid, [])
  }

  for (const r of responders) {
    const sid = extractSessionId(r.text)
    let cid = sid && sessionToCall.get(sid)
    if (!cid && sipByCall.size === 1) cid = [...sipByCall.keys()][0]
    if (!cid) {
      // fallback: nearest call by time
      let best = null
      let bestDist = Infinity
      for (const [id, msgs] of sipByCall) {
        const mid = msgs[0]?.unixMs || 0
        const d = Math.abs(r.unixMs - mid)
        if (d < bestDist) {
          bestDist = d
          best = id
        }
      }
      cid = best
    }
    if (cid && respondersByCall.has(cid)) respondersByCall.get(cid).push(r)
  }

  for (const r of liRows) {
    const sid = extractSessionId(r.text)
    let cid = sid && sessionToCall.get(sid)
    if (!cid && sipByCall.size === 1) cid = [...sipByCall.keys()][0]
    if (!cid) {
      let best = null
      let bestDist = Infinity
      for (const [id, msgs] of sipByCall) {
        const mid = msgs[0]?.unixMs || 0
        const d = Math.abs(r.unixMs - mid)
        if (d < bestDist) {
          bestDist = d
          best = id
        }
      }
      cid = best
    }
    if (cid && liByCall.has(cid)) liByCall.get(cid).push(r)
  }

  const calls = []
  for (const [callId, messages] of sipByCall) {
    messages.sort((a, b) => a.unixMs - b.unixMs)
    const base = {
      callId,
      messages,
      responders: respondersByCall.get(callId) || [],
      li: liByCall.get(callId) || [],
    }
    calls.push(enrichCall(base))
  }

  calls.sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
  return { calls }
}

export { formatDelta, failureCodeMeaning, classifyCodec }
