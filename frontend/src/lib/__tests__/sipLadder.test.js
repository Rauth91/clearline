import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  analyze,
  computeMetrics,
  describeCall,
  extractCodecs,
  parseCapture,
} from '../sipLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, 'fixtures/netsapiens-call.csv'), 'utf8')

describe('parseCapture (NetSapiens fixture)', () => {
  const { calls, error } = parseCapture(fixture)
  const call = calls[0]

  it('parses without error and yields one call', () => {
    expect(error).toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('parses 18 SIP messages and two legs', () => {
    expect(call.messages).toHaveLength(18)
    expect(call.legs).toHaveLength(2)
  })

  it('classifies far end on-net as 2150@GAGE-22704', () => {
    expect(call.onNet).toBe(true)
    expect(call.farEndUri).toBe('2150@GAGE-22704')
    expect(call.farEndLabel).toMatch(/2150@GAGE-22704/)
  })

  it('negotiates G722 from the expected offer list', () => {
    const codecs = extractCodecs(call)
    expect(codecs.offered).toEqual([
      'G7221', 'G7221', 'G7221', 'G722', 'PCMU', 'PCMA', 'G729',
    ])
    expect(codecs.negotiated).toMatch(/^G722$/i)
  })

  it('computes ring, talk, hold, and ended-by', () => {
    const m = computeMetrics(call)
    expect(m.ringBeforeAnswerSec).toBeGreaterThanOrEqual(7.7)
    expect(m.ringBeforeAnswerSec).toBeLessThanOrEqual(8.0)
    expect(m.talkSec).toBe(59)
    expect(m.holdSec).toBe(0)
    expect(m.endedBy).toBe('far end')
    expect(m.endedByRole).toBe('term')
  })

  it('detects recording on two servers', () => {
    const findings = analyze(call)
    const rec = findings.find(f => /recording/i.test(f.title) || /captured/i.test(f.body))
    expect(rec).toBeTruthy()
    expect(rec.severity).toBe('info')
    expect(rec.body).toMatch(/rec-a\.example\.com/)
    expect(rec.body).toMatch(/rec-b\.example\.com/)
  })

  it('has auth challenge but not as a finding', () => {
    expect(call.authChallenge).toBe(true)
    const findings = analyze(call)
    expect(findings.some(f => f.sipCode === 407 || f.sipCode === 401)).toBe(false)
    expect(findings.some(f => /auth/i.test(f.title) && f.severity === 'error')).toBe(false)
  })

  it('NAT finding is info when RTP relay is present', () => {
    const findings = analyze(call)
    const nat = findings.find(f => /NAT/i.test(f.title))
    expect(nat).toBeTruthy()
    expect(nat.severity).toBe('info')
  })

  it('routing includes DID Table match and translation', () => {
    expect(call.routing.matchingPlan).toMatch(/DID Table/i)
    expect(call.routing.dialPlans.some(p => /DID Table/i.test(p.name) && p.match)).toBe(true)
    expect(call.routing.translation.summary).toBe('2252152150 → 2150@GAGE-22704')
  })

  it('describeCall narrates the healthy fixture', () => {
    const text = describeCall(call)
    expect(text).toMatch(/2140/)
    expect(text).toMatch(/authenticate/i)
    expect(text).toMatch(/2150@GAGE-22704/)
    expect(text).toMatch(/G722/i)
    expect(text).toMatch(/59/)
    expect(text).toMatch(/far end hung up/i)
  })
})

describe('describeCall synthetic outcomes', () => {
  function synth(messages, extras = {}) {
    const call = {
      messages,
      responders: extras.responders || [],
      li: [],
      legs: extras.legs || [
        { role: 'orig', peerIp: '1.1.1.1', messages },
        { role: 'term', peerIp: '2.2.2.2', messages: [] },
      ],
      from: { user: '1001' },
      to: { user: '2002' },
      dialed: '2002',
      routing: extras.routing || {},
      authChallenge: false,
      ...extras,
    }
    call.metrics = computeMetrics(call)
    call.codecs = extractCodecs(call)
    return call
  }

  const baseInvite = {
    isRequest: true,
    method: 'INVITE',
    unixMs: 1000,
    peerIp: '1.1.1.1',
    direction: 'in',
    from: { user: '1001' },
    to: { user: '2002' },
    cseqMethod: 'INVITE',
  }

  it('describes 486 busy', () => {
    const call = synth([
      baseInvite,
      {
        isResponse: true,
        code: 486,
        reason: 'Busy Here',
        unixMs: 2200,
        peerIp: '1.1.1.1',
        direction: 'out',
        cseqMethod: 'INVITE',
      },
    ])
    expect(describeCall(call)).toMatch(/486 Busy/i)
  })

  it('describes 480 unavailable', () => {
    const call = synth([
      baseInvite,
      {
        isResponse: true,
        code: 480,
        reason: 'Temporarily Unavailable',
        unixMs: 3000,
        peerIp: '1.1.1.1',
        direction: 'out',
        cseqMethod: 'INVITE',
      },
    ])
    expect(describeCall(call)).toMatch(/480/i)
  })

  it('describes 403 reject', () => {
    const call = synth([
      baseInvite,
      {
        isResponse: true,
        code: 403,
        reason: 'Forbidden',
        unixMs: 1500,
        peerIp: '1.1.1.1',
        direction: 'out',
        cseqMethod: 'INVITE',
      },
    ])
    expect(describeCall(call)).toMatch(/403/i)
  })

  it('describes CANCEL before answer', () => {
    const call = synth([
      baseInvite,
      {
        isRequest: true,
        method: 'CANCEL',
        unixMs: 4000,
        peerIp: '1.1.1.1',
        direction: 'in',
        cseqMethod: 'CANCEL',
      },
    ])
    expect(describeCall(call)).toMatch(/CANCEL/i)
  })

  it('describes timeout / no response', () => {
    const call = synth([baseInvite])
    expect(describeCall(call)).toMatch(/no final response|timeout/i)
  })
})
