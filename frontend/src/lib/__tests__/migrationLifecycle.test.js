import { describe, expect, it } from 'vitest'
import {
  DECOMMISSION_CHECKS,
  FOLLOWUP_CHECKS,
  INSTALL_CHECKS,
  PLANNING_CHECKS,
  QC_CHECKS,
  RESEARCH_CHECKS,
  RPP_CHECKS,
  buildDeviceReadiness,
  canCompleteMetaDecommission,
  compareMigrationNumberLists,
  migrationPhaseCompletion,
  normalizeFirmwareModel,
} from '../migrationLifecycle.js'

const complete = items => Object.fromEntries(items.map(item => [item.key, true]))

describe('migration firmware readiness', () => {
  it('normalizes server and migration model names', () => {
    expect(normalizeFirmwareModel('SIP-T53W')).toBe('T53W')
    expect(normalizeFirmwareModel('Yealink T54W')).toBe('T54W')
  })

  it('identifies ready, mismatched, EOL, and unknown devices', () => {
    const rows = buildDeviceReadiness([], [
      { mac:'000000000001', model:'SIP-T53W', firmwareVersion:'96.86.0.70' },
      { mac:'000000000002', model:'SIP-T54W', firmwareVersion:'96.86.0.45' },
      { mac:'000000000003', model:'SIP-T52S', firmwareVersion:'1.0' },
      { mac:'000000000004', model:'SIP-UNKNOWN', firmwareVersion:'1.0' },
    ], [
      { model:'T53W', certified_version:'96.86.0.70', eol:false },
      { model:'T54W', certified_version:'96.86.0.70', eol:false },
      { model:'T52S', certified_version:'', eol:true },
    ])

    expect(rows.map(row => row.status)).toEqual(['ready', 'mismatch', 'eol', 'unknownModel'])
  })
})

describe('migration lifecycle completion', () => {
  it('compares the actual RPP number lists, not only their counts', () => {
    expect(compareMigrationNumberLists(
      '225-555-1000\n225-555-1001',
      '2255551000, 2255559999',
    )).toMatchObject({
      missing:['2255551001'],
      unexpected:['2255559999'],
      matches:false,
    })
    expect(compareMigrationNumberLists(
      '2255551000\n2255551001',
      '2255551001;2255551000',
    ).matches).toBe(true)
  })

  it('preserves old build keys while calculating the new phase state', () => {
    const data = {
      domain:'customer',
      users:[{ id:'u1' }],
      devices:[{ id:'d1' }],
      autoAttendants:[],
      callFlows:[],
      huntGroups:[],
      buttonLayouts:[],
      research:{ feasibility:'good', checks:complete(RESEARCH_CHECKS) },
      planning:{ checks:complete(PLANNING_CHECKS) },
      rpp:{ checks:complete(RPP_CHECKS) },
      install:{ checks:complete(INSTALL_CHECKS) },
      followup:{ checks:complete(FOLLOWUP_CHECKS), customerApproved:true },
      decommission:{ checks:complete(DECOMMISSION_CHECKS) },
      build:{
        usersImported:true,
        phonesImported:true,
        e911Imported:true,
        ...complete(QC_CHECKS),
      },
    }

    expect(migrationPhaseCompletion(data)).toMatchObject({
      research:true,
      planning:true,
      collection:true,
      programming:true,
      install:true,
      qc:true,
      followup:true,
      decommission:true,
      rpp:true,
    })
  })

  it('locks final Meta removal until follow-up and safety checks are complete', () => {
    const prerequisiteChecks = complete(
      DECOMMISSION_CHECKS.filter(item => item.key !== 'oldSystemRemoved'),
    )
    const data = {
      followup:{ customerApproved:true },
      decommission:{ checks:prerequisiteChecks },
    }

    expect(canCompleteMetaDecommission(data)).toBe(true)
    expect(canCompleteMetaDecommission({
      ...data,
      followup:{ customerApproved:false },
    })).toBe(false)
  })
})
