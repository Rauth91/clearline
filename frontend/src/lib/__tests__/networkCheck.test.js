import { describe, expect, it } from 'vitest'
import { computeVerdict } from '../networkReadiness.js'
import { buildVerdictActions, VISUALWARE_VOIP_TEST_URL } from '../networkProbes.js'
import { buildNetworkSummaryText } from '../../components/NetworkShared.jsx'

describe('Network Check verdict parity', () => {
  it('matches Site Survey computeVerdict for identical inputs', () => {
    const input = {
      upMbps: 10,
      downMbps: 10,
      loss: 0,
      jitter: 2.6,
      mos: 4.2,
      sipAlg: 'clear',
    }
    const v = computeVerdict(input, 14)
    expect(v.status).toBe('pass')
    expect(v.callsSupported).toBe(91)
    expect(v.callsNeeded).toBe(14)
  })
})

describe('buildVerdictActions', () => {
  it('maps ALG / loss / jitter / capacity to tools', () => {
    const v = computeVerdict({
      upMbps: 1,
      downMbps: 1,
      loss: 2,
      jitter: 35,
      mos: 4.2,
      sipAlg: 'detected',
    }, 20)
    const actions = buildVerdictActions(v, { seats: 20 })
    expect(actions.some(a => /Router Advisor/i.test(a.action) && a.href?.includes('sip-alg'))).toBe(true)
    expect(actions.some(a => a.href === '/tools/callanalysis')).toBe(true)
    expect(actions.some(a => a.href?.includes('focus=qos'))).toBe(true)
    expect(actions.some(a => /kbps/i.test(a.action))).toBe(true)
  })
})

describe('buildNetworkSummaryText', () => {
  it('includes verdict, seats, and recommended actions', () => {
    const verdict = computeVerdict({
      upMbps: 1, downMbps: 1, loss: 0, jitter: 5, mos: 4.2, sipAlg: 'clear',
    }, 20)
    const text = buildNetworkSummaryText({
      manual: { downMbps: '1', upMbps: '1', seats: '20', sipAlg: 'clear' },
      verdict,
      actions: buildVerdictActions(verdict, { seats: 20 }),
    })
    expect(text).toMatch(/Network Check summary/)
    expect(text).toMatch(/Seats: 20/)
    expect(text).toMatch(/FAIL/i)
    expect(text).toMatch(/Recommended actions/)
    expect(text).toMatch(/kbps/)
  })
})

describe('Visualware URL', () => {
  it('points at the VoIP assessment portal', () => {
    expect(VISUALWARE_VOIP_TEST_URL).toMatch(/visualware\.com.*voip-assessment-test/)
  })
})
