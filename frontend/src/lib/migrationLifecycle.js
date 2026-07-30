import { normalizeMigrationMac } from './migrationExtensions.js'

export const RESEARCH_CHECKS = [
  { key:'scopeConfirmed', label:'Customer scope, sites, contacts, and target date confirmed' },
  { key:'metaExported', label:'Current Meta programming/configuration exported or documented' },
  { key:'numbersReviewed', label:'Telephone number and porting inventory reviewed' },
  { key:'routingReviewed', label:'Auto attendants, schedules, call flows, and hunt groups reviewed' },
  { key:'devicesReviewed', label:'Users, phones, sidecars, and special button programming reviewed' },
  { key:'networkReviewed', label:'Network, firewall, QoS, VLAN, and E911 dependencies reviewed' },
  { key:'firmwareReviewed', label:'Device firmware and end-of-life findings reviewed' },
]

export const PLANNING_CHECKS = [
  { key:'firmwarePlan', label:'Firmware upgrade requirements and pilot/rollback plan documented' },
  { key:'replacementPlan', label:'End-of-life equipment replacements selected and assigned' },
  { key:'networkPlan', label:'Customer network instructions delivered with owner and due date' },
  { key:'portingPlan', label:'Porting, cutover window, communications, and dependencies planned' },
  { key:'rollbackPlan', label:'Rollback criteria and responsible technician documented' },
  { key:'goNoGo', label:'Customer and internal go/no-go approval recorded' },
]

export const RPP_CHECKS = [
  { key:'accountVerified', label:'Correct customer account opened and verified in RPP' },
  { key:'accountPushed', label:'Customer account pushed/created on the new platform' },
  { key:'numbersPushed', label:'All migrating telephone numbers pushed/assigned to the account' },
  { key:'countsVerified', label:'Expected and resulting number lists/counts match' },
]

export const INSTALL_CHECKS = [
  { key:'equipmentStaged', label:'Phones, replacements, and accessories staged' },
  { key:'firmwareComplete', label:'Required firmware updates completed' },
  { key:'networkReady', label:'Customer network prerequisites confirmed' },
  { key:'portComplete', label:'Number port/routing activation completed' },
  { key:'phonesDeployed', label:'Phones installed and assigned to the correct users' },
  { key:'registrationVerified', label:'All expected devices registered on the new platform' },
  { key:'rollbackReady', label:'Rollback path remains available during cutover' },
]

export const QC_CHECKS = [
  { key:'test_inbound', label:'Inbound calls complete successfully' },
  { key:'test_outbound', label:'Outbound calls complete successfully' },
  { key:'test_main', label:'Main number rings correctly' },
  { key:'test_aa', label:'Auto attendant keys route correctly' },
  { key:'test_hg', label:'Hunt groups ring all members' },
  { key:'test_vm', label:'Voicemail accessible (*97 or *98)' },
  { key:'test_night', label:'Night mode / after-hours toggles correctly' },
  { key:'test_callerid', label:'Outbound caller ID name and number are correct' },
  { key:'test_e911', label:'E911 address and callback number confirmed' },
  { key:'test_devices', label:'Expected phones are online and registered' },
  { key:'test_customer', label:'Customer acceptance test completed' },
]

export const FOLLOWUP_CHECKS = [
  { key:'issuesReviewed', label:'Open issues reviewed and assigned' },
  { key:'trainingComplete', label:'Customer training completed' },
  { key:'docsDelivered', label:'Updated instructions and documentation delivered' },
  { key:'billingReviewed', label:'New platform services and billing reviewed' },
  { key:'customerConfirmed', label:'Customer confirms production service is stable' },
]

export const DECOMMISSION_CHECKS = [
  { key:'metaArchived', label:'Meta configuration and customer records archived' },
  { key:'rollbackExpired', label:'Approved rollback window has expired' },
  { key:'trafficClear', label:'No production calls or numbers remain on Meta' },
  { key:'usersReviewed', label:'Meta users, devices, and accounts reviewed for removal' },
  { key:'licensesReviewed', label:'Licenses and billing changes confirmed' },
  { key:'customerApproved', label:'Customer approval to decommission recorded' },
  { key:'oldSystemRemoved', label:'Old system removed from Meta' },
]

export function checklistComplete(items, values = {}) {
  return items.length > 0 && items.every(item => Boolean(values[item.key]))
}

export function compareMigrationNumberLists(expectedValue, resultingValue) {
  const parse = value => [...new Set(
    String(value || '')
      .split(/[\n,;]+/)
      .map(item => item.replace(/\D/g, ''))
      .filter(Boolean),
  )]
  const expected = parse(expectedValue)
  const resulting = parse(resultingValue)
  const expectedSet = new Set(expected)
  const resultingSet = new Set(resulting)
  return {
    expected,
    resulting,
    missing:expected.filter(number => !resultingSet.has(number)),
    unexpected:resulting.filter(number => !expectedSet.has(number)),
    matches:expected.length > 0
      && resulting.length > 0
      && expected.length === resulting.length
      && expected.every(number => resultingSet.has(number)),
  }
}

export function normalizeFirmwareModel(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^YEALINK[\s-]*/, '')
    .replace(/^SIP[\s-]*/, '')
    .replace(/[^A-Z0-9]/g, '')
}

export function buildDeviceReadiness(migrationDevices = [], serverDevices = [], firmwareRefs = []) {
  const refs = new Map(
    firmwareRefs.map(ref => [normalizeFirmwareModel(ref.model), ref]).filter(([model]) => model),
  )
  const migrationMacs = new Set(
    migrationDevices.map(device => normalizeMigrationMac(device.mac)).filter(Boolean),
  )
  const byMac = new Map()

  for (const device of migrationDevices) {
    const mac = normalizeMigrationMac(device.mac)
    if (!mac) continue
    byMac.set(mac, {
      mac,
      model:device.model || '',
      firmwareVersion:'',
      inMigration:true,
    })
  }
  for (const device of serverDevices) {
    const mac = normalizeMigrationMac(device.mac)
    if (!mac) continue
    const existing = byMac.get(mac) || {}
    byMac.set(mac, {
      ...existing,
      mac,
      model:device.model || existing.model || '',
      firmwareVersion:device.firmwareVersion || existing.firmwareVersion || '',
      inMigration:migrationMacs.has(mac),
    })
  }

  return [...byMac.values()].map(device => {
    const modelKey = normalizeFirmwareModel(device.model)
    const ref = refs.get(modelKey) || null
    const certified = String(ref?.certified_version || '').trim()
    const reported = String(device.firmwareVersion || '').trim()
    let status = 'ready'
    let finding = 'Model is supported; no certified firmware version is configured.'

    if (!ref) {
      status = 'unknownModel'
      finding = 'Model is not in Firmware References — verify support before migration.'
    } else if (ref.eol) {
      status = 'eol'
      finding = 'End of life — plan replacement before migration.'
    } else if (!reported) {
      status = 'versionMissing'
      finding = 'Firmware version was not reported — verify it on the phone or server.'
    } else if (!certified) {
      status = 'uncertified'
      finding = 'No certified target version is configured for this model.'
    } else if (reported !== certified) {
      status = 'mismatch'
      finding = `Firmware ${reported} does not match certified ${certified}.`
    } else {
      finding = `Firmware ${reported} matches certified ${certified}.`
    }

    return { ...device, modelKey, ref, certifiedVersion:certified, status, finding }
  })
}

function programmingKeys(data) {
  return [
    'usersImported',
    'phonesImported',
    'e911Imported',
    ...(data.autoAttendants || []).map(item => `aa_${item.id}`),
    ...(data.callFlows || []).map(item => `cf_${item.id}`),
    ...(data.huntGroups || []).map(item => `hg_${item.id}`),
    ...(data.buttonLayouts || []).map(item => `bl_${item.id}`),
  ]
}

export function migrationPhaseCompletion(data = {}) {
  const research = checklistComplete(RESEARCH_CHECKS, data.research?.checks)
    && Boolean(data.research?.feasibility)
  const planning = checklistComplete(PLANNING_CHECKS, data.planning?.checks)
  const rpp = checklistComplete(RPP_CHECKS, data.rpp?.checks)
  const collection = Boolean(data.domain)
    && (data.users || []).length > 0
    && (data.devices || []).length > 0
    && rpp
  const programming = programmingKeys(data).every(key => Boolean(data.build?.[key]))
  const install = checklistComplete(INSTALL_CHECKS, data.install?.checks)
  const qc = checklistComplete(QC_CHECKS, data.build)
  const followup = checklistComplete(FOLLOWUP_CHECKS, data.followup?.checks)
    && Boolean(data.followup?.customerApproved)
  const decommission = checklistComplete(DECOMMISSION_CHECKS, data.decommission?.checks)

  return { research, planning, collection, programming, install, qc, followup, decommission, rpp }
}

export function canCompleteMetaDecommission(data = {}) {
  const checks = data.decommission?.checks || {}
  const prerequisites = DECOMMISSION_CHECKS.filter(item => item.key !== 'oldSystemRemoved')
  return Boolean(data.followup?.customerApproved)
    && checklistComplete(prerequisites, checks)
}
