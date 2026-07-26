import { describe, expect, it } from 'vitest'
import {
  designCompleteness,
  goLiveCompleteness,
  jobNextActions,
  surveyCompleteness,
  focChipStatus,
  describeDay,
  pickHomeUrgent,
  greetingForHour,
} from './jobHealth.js'
import { computeVerdict } from './networkReadiness.js'

describe('computeVerdict', () => {
  it('passes acceptance case: 10/10 Mbps, 0 loss, 2.6 jitter, MOS 4.2, 14 seats', () => {
    const v = computeVerdict({
      upMbps: 10,
      downMbps: 10,
      loss: 0,
      jitter: 2.6,
      mos: 4.2,
      rttMs: 37,
      sipAlg: 'clear',
    }, 14)

    // floor(min(10,10)*1000*0.8/87.2) = floor(8000/87.2) = floor(91.74) = 91
    expect(v.callsSupported).toBe(91)
    expect(v.callsNeeded).toBe(14)
    expect(v.status).toBe('pass')
  })

  it('fails when callsSupported < seats', () => {
    const v = computeVerdict({
      upMbps: 1,
      downMbps: 1,
      loss: 0,
      jitter: 5,
      mos: 4.2,
      sipAlg: 'clear',
    }, 20)
    expect(v.status).toBe('fail')
    expect(v.callsSupported).toBeLessThan(20)
  })

  it('fails on SIP ALG detected', () => {
    const v = computeVerdict({
      upMbps: 20,
      downMbps: 20,
      loss: 0,
      jitter: 5,
      mos: 4.2,
      sipAlg: 'detected',
    }, 5)
    expect(v.status).toBe('fail')
  })

  it('warns on jitter > 20 when otherwise ok', () => {
    const v = computeVerdict({
      upMbps: 20,
      downMbps: 20,
      loss: 0,
      jitter: 25,
      mos: 4.2,
      sipAlg: 'clear',
    }, 5)
    expect(v.status).toBe('warn')
  })
})

describe('jobHealth', () => {
  it('surveyCompleteness flags missing company and users', () => {
    const result = surveyCompleteness({
      customer: { company: '' },
      mainNumbers: [],
      users: [],
      photos: [],
      e911Locations: [],
    }, 'job-1')
    expect(result.pct).toBeLessThan(100)
    expect(result.missing.some(m => m.id === 'survey-company')).toBe(true)
    expect(result.missing.some(m => m.route.includes('/job/job-1/survey'))).toBe(true)
  })

  it('designCompleteness requires hours and AA', () => {
    const result = designCompleteness({
      hours: { weekdayOpen: '8:00', weekdayClose: '17:00' },
      autoAttendant: { greeting: 'Hello' },
      nightButton: {},
    }, 'abc')
    expect(result.missing.some(m => m.id === 'design-hours')).toBe(false)
    expect(result.missing.some(m => m.id === 'design-aa')).toBe(false)
  })

  it('goLiveCompleteness requires FOC confirm when focDate set', () => {
    const result = goLiveCompleteness({}, {
      port: { focDate: '2030-01-15', focConfirmed: false },
      jobId: 'j1',
    })
    expect(result.missing.some(m => m.id === 'golive-foc')).toBe(true)
  })

  it('jobNextActions merges blockers first', () => {
    const next = jobNextActions(
      { customer: {}, mainNumbers: [], users: [], photos: [], e911Locations: [] },
      {},
      null,
      { jobId: 'x' },
    )
    expect(next.actions.length).toBeGreaterThan(0)
    const ranks = { blocker: 0, warn: 1, info: 2 }
    for (let i = 1; i < next.actions.length; i += 1) {
      expect(ranks[next.actions[i].severity]).toBeGreaterThanOrEqual(ranks[next.actions[i - 1].severity])
    }
  })

  it('focChipStatus warns within 3 days unconfirmed', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 2)
    const iso = soon.toISOString().slice(0, 10)
    const chip = focChipStatus({ focDate: iso, focConfirmed: false })
    expect(chip.status).toBe('warn')
  })
})

describe('describeDay', () => {
  const now = new Date('2026-07-22T15:00:00') // Wednesday

  it('empty state', () => {
    expect(describeDay([], null, { now })).toBe('nothing due — all quiet.')
  })

  it('blocker present', () => {
    const friday = '2026-07-24'
    const sentence = describeDay([
      {
        id: '1',
        customer: 'Acme Dental',
        cutover_date: friday,
        blockerCount: 1,
      },
      { id: '2', customer: 'Other', foc_date: '2026-07-25', blockerCount: 0 },
    ], { display_name: 'Ryan' }, { now })
    expect(sentence).toMatch(/2 jobs this week/i)
    expect(sentence).toMatch(/Acme Dental cuts over Friday/i)
    expect(sentence).toMatch(/1 blocker/i)
  })

  it('cutover this week without blockers', () => {
    const sentence = describeDay([
      { id: '1', customer: 'Acme Dental', cutover_date: '2026-07-24', blockerCount: 0 },
      { id: '2', customer: 'Beta Shop', foc_date: '2026-07-25', blockerCount: 0 },
    ], null, { now })
    expect(sentence).toMatch(/2 jobs this week/i)
    expect(sentence).toMatch(/Acme Dental cuts over Friday/i)
    expect(sentence).not.toMatch(/blocker/i)
  })

  it('multiple jobs no blockers and nothing due this week', () => {
    const sentence = describeDay([
      { id: '1', customer: 'Far Out', cutover_date: '2026-08-20', blockerCount: 0 },
      { id: '2', customer: 'Later Co', foc_date: '2026-09-01', blockerCount: 0 },
    ], null, { now })
    expect(sentence).toMatch(/2 jobs in flight/i)
    expect(sentence).toMatch(/nothing urgent due this week/i)
  })
})

describe('greetingForHour', () => {
  it('returns time-of-day greeting without a name', () => {
    expect(greetingForHour(9)).toBe('Good morning')
    expect(greetingForHour(14)).toBe('Good afternoon')
    expect(greetingForHour(20)).toBe('Good evening')
  })
})

describe('pickHomeUrgent', () => {
  const now = new Date('2026-07-22T15:00:00')

  it('returns null when there are no jobs', () => {
    expect(pickHomeUrgent([], [])).toBeNull()
  })

  it('prefers a blocker over nearest cutover', () => {
    const jobs = [
      { id: 'a', customer: 'Acme', cutover_date: '2026-07-23' },
      { id: 'b', customer: 'Blocked Co', cutover_date: '2026-07-28' },
    ]
    const urgent = pickHomeUrgent(jobs, [
      { job: jobs[0], actions: [{ severity: 'warn', label: 'Fill survey', route: '/job/a/survey' }] },
      {
        job: jobs[1],
        actions: [{ severity: 'blocker', label: 'Confirm FOC', route: '/job/b' }],
      },
    ], { now })
    expect(urgent.label).toMatch(/Blocked Co/)
    expect(urgent.label).toMatch(/Confirm FOC/)
    expect(urgent.route).toBe('/job/b')
  })

  it('falls back to nearest cutover/FOC', () => {
    const jobs = [
      { id: 'a', customer: 'Acme', cutover_date: '2026-07-24' },
      { id: 'b', customer: 'Beta', foc_date: '2026-07-30' },
    ]
    const urgent = pickHomeUrgent(jobs, [
      { job: jobs[0], actions: [] },
      { job: jobs[1], actions: [] },
    ], { now })
    expect(urgent.label).toMatch(/Acme/)
    expect(urgent.label).toMatch(/Cutover/)
    expect(urgent.route).toBe('/job/a')
  })
})
