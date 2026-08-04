/**
 * Rules shared by the migration Users, Devices, and Build steps.
 * Extensions are always explicit; a DID is never used as a fallback.
 */

export function cleanImportedField(value) {
  let field = String(value ?? '').trim()
  while (field.length >= 2) {
    const first = field[0]
    const last = field[field.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      field = field.slice(1, -1).trim()
    } else {
      break
    }
  }
  return field
}

export function cleanMigrationName(value) {
  let name = cleanImportedField(value)
  name = name.replace(/^['"]+|['"]+$/g, '').trim()
  return name.replace(/\s+/g, ' ')
}

export function splitMigrationName(value) {
  const name = cleanMigrationName(value)
  if (!name) return ['', '-']

  if (name.includes(',')) {
    const comma = name.indexOf(',')
    const firstName = cleanMigrationName(name.slice(comma + 1))
    const lastName = cleanMigrationName(name.slice(0, comma))
    return [firstName, lastName || '-']
  }

  const parts = name.split(/\s+/).map(cleanMigrationName).filter(Boolean)
  if (parts.length === 1) return [parts[0], '-']
  return [parts[0], cleanMigrationName(parts.slice(1).join(' ')) || '-']
}

export function migrationUserFromLine(row, { id, defaultPin = '' } = {}) {
  let dn = cleanImportedField(row?.['Directory number']).replace(/\D/g, '')
  if (dn.length === 11 && dn.startsWith('1')) dn = dn.slice(1)
  if (!dn) return null

  const [firstName, lastName] = splitMigrationName(row?.Name)
  return {
    id,
    dn,
    ext: '',
    firstName,
    lastName,
    email: '',
    vmPin: defaultPin,
    dept: '',
    site: '',
    did: dn,
  }
}

export function normalizeMigrationExtension(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 8)
}

export function parseBulkExtensions(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(line => normalizeMigrationExtension(line))
    .filter(Boolean)
}

export function previewBulkExtensionApply(users = [], extensions = []) {
  const userCount = users.length
  const extensionCount = extensions.length
  const countMatches = userCount > 0 && userCount === extensionCount
  const preview = users.map((user, index) => ({
    id: user.id,
    dn: user.dn || '',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—',
    currentExt: normalizeMigrationExtension(user.ext),
    nextExt: extensions[index] || '',
  }))
  return {
    userCount,
    extensionCount,
    countMatches,
    canApply: countMatches,
    warning: !userCount
      ? 'Import users before applying extensions.'
      : !extensionCount
        ? 'Paste one extension per line.'
        : countMatches
          ? ''
          : `Count mismatch: ${extensionCount} extension${extensionCount === 1 ? '' : 's'} for ${userCount} user${userCount === 1 ? '' : 's'}. Fix the list before applying.`,
    preview,
  }
}

export function applyBulkExtensions(users = [], extensions = []) {
  const preview = previewBulkExtensionApply(users, extensions)
  if (!preview.canApply) return users
  return users.map((user, index) => ({
    ...user,
    ext: extensions[index] || '',
  }))
}

export function normalizeMigrationMac(value) {
  return String(value ?? '').replace(/[^0-9A-Fa-f]/g, '').toLowerCase()
}

export function netSapiensPhoneModel(value) {
  const raw = cleanImportedField(value)
  const candidate = raw
    .toUpperCase()
    .replace(/^YEALINK[\s-]*/, '')
    .replace(/^SIP[\s-]*/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
  return /^T\d+[A-Z0-9_]*$/.test(candidate)
    ? `Yealink SIP-${candidate}`
    : raw
}

export function analyzeMigrationExtensions(users = []) {
  const missingIds = new Set()
  const byExtension = new Map()

  for (const user of users) {
    const extension = normalizeMigrationExtension(user.ext)
    if (!extension) {
      missingIds.add(user.id)
      continue
    }
    const ids = byExtension.get(extension) || []
    ids.push(user.id)
    byExtension.set(extension, ids)
  }

  const collisions = new Set(
    [...byExtension.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([extension]) => extension),
  )

  return { missingIds, collisions }
}

export function extensionsByDn(users = []) {
  const result = {}
  for (const user of users) {
    const dn = String(user.dn ?? '')
    const extension = normalizeMigrationExtension(user.ext)
    if (dn && extension) result[dn] = extension
  }
  return result
}

export function analyzeDeviceExtensionAssignments(devices = [], extByDn = {}) {
  const devicesByExtension = new Map()

  for (const device of devices) {
    const extension = normalizeMigrationExtension(
      device.line1 || extByDn[device.dn] || '',
    )
    if (!extension) continue

    const mac = normalizeMigrationMac(device.mac)
    const deviceKey = mac || String(device.id ?? '')
    if (!deviceKey) continue

    const deviceKeys = devicesByExtension.get(extension) || new Set()
    deviceKeys.add(deviceKey)
    devicesByExtension.set(extension, deviceKeys)
  }

  const duplicateExtensions = new Set()
  const deviceCounts = {}
  const approvalKeys = {}
  for (const [extension, deviceKeys] of devicesByExtension) {
    deviceCounts[extension] = deviceKeys.size
    if (deviceKeys.size > 1) {
      duplicateExtensions.add(extension)
      approvalKeys[extension] = sharedExtensionApprovalKey(extension, deviceKeys)
    }
  }

  return { duplicateExtensions, deviceCounts, approvalKeys }
}

export function sharedExtensionApprovalKey(extension, deviceKeys = []) {
  return `${normalizeMigrationExtension(extension)}:${[...deviceKeys].sort().join(',')}`
}

export const YEALINK_AUDIT_LABELS = {
  ready:'Ready',
  verify:'Verify before cutover',
  investigate:'Investigate missing device',
  cleanup:'Cleanup candidate',
  strongCleanup:'Strong cleanup candidate',
}

export function yealinkServerDeviceFromRow(row, { id } = {}) {
  const mac = normalizeMigrationMac(row?.MAC)
  if (!mac) return null

  const accounts = [1, 2].map(index => ({
    type:cleanImportedField(row?.[`Account Type ${index}`]),
    info:cleanImportedField(row?.[`Account Info ${index}`]),
    status:cleanImportedField(row?.[`Account Status ${index}`]).toLowerCase(),
  })).filter(account => account.info)

  return {
    id,
    mac,
    serial:cleanImportedField(row?.['Machine ID(Serial Number)']),
    model:cleanImportedField(row?.Model),
    deviceName:cleanImportedField(row?.['Device Name']),
    site:cleanImportedField(row?.Site),
    status:cleanImportedField(row?.['Device Status']).toLowerCase(),
    validStatus:cleanImportedField(row?.['Valid Status']).toLowerCase(),
    lastReport:cleanImportedField(row?.['Last Report Time']),
    firmwareVersion:cleanImportedField(row?.['Firmware Version']),
    accounts,
  }
}

function normalizedAccount(value) {
  return cleanImportedField(value).replace(/\s+/g, '').toLowerCase()
}

export function buildYealinkServerAudit(serverDevices = [], migrationDevices = []) {
  const migrationMacs = new Set(
    migrationDevices.map(device => normalizeMigrationMac(device.mac)).filter(Boolean),
  )
  const accountMacs = new Map()

  for (const device of serverDevices) {
    const mac = normalizeMigrationMac(device.mac)
    for (const account of device.accounts || []) {
      const key = normalizedAccount(account.info)
      if (!key || !mac) continue
      const macs = accountMacs.get(key) || new Set()
      macs.add(mac)
      accountMacs.set(key, macs)
    }
  }

  return serverDevices.map(device => {
    const mac = normalizeMigrationMac(device.mac)
    const inMigration = migrationMacs.has(mac)
    const online = String(device.status || '').toLowerCase() === 'online'
    const offline = String(device.status || '').toLowerCase() === 'offline'
    const hasAccount = (device.accounts || []).some(account => normalizedAccount(account.info))

    let category
    let action
    if (inMigration && online) {
      category = 'ready'
      action = 'Keep — present in the migration and online.'
    } else if (inMigration) {
      category = 'verify'
      action = 'Verify power, network, and assignment before cutover.'
    } else if (online || !offline) {
      category = 'investigate'
      action = 'Investigate — active on the server but missing from the migration device list.'
    } else if (!hasAccount) {
      category = 'strongCleanup'
      action = 'Strong cleanup candidate — offline, not migrating, and no SIP account is assigned.'
    } else {
      category = 'cleanup'
      action = 'Cleanup candidate — verify ownership and last report before removing from the server.'
    }

    const duplicateAccounts = (device.accounts || [])
      .map(account => account.info)
      .filter(info => {
        const owners = accountMacs.get(normalizedAccount(info))
        return owners && owners.size > 1
      })

    return {
      ...device,
      mac,
      inMigration,
      category,
      categoryLabel:YEALINK_AUDIT_LABELS[category],
      action,
      duplicateAccounts,
    }
  })
}

export function yealinkAuditExceptions(rows = []) {
  return rows.filter(row => row.category !== 'ready' || row.duplicateAccounts?.length)
}

export function migrationE911Fields(data = {}) {
  return {
    addressLine1:String(data.e911Address1 ?? data.e911Address ?? '').trim(),
    addressLine2:String(data.e911Address2 ?? '').trim(),
    city:String(data.e911City ?? '').trim(),
    state:String(data.e911State ?? '').trim().toUpperCase(),
    zip:String(data.e911Zip ?? '').trim(),
  }
}

/** Side-by-side Meta/NetSapiens build checklist — replaces duplicate System Config forms. */
export const SYSTEM_CONFIG_CHECKS = [
  { key: 'reviewMeta', label: 'Review Meta auto attendants, hunt groups, and schedules' },
  { key: 'rebuildAA', label: 'Rebuild auto attendants in NetSapiens' },
  { key: 'rebuildHG', label: 'Rebuild hunt groups / queues in NetSapiens' },
  { key: 'rebuildICM', label: 'Rebuild inbound routing (ICM) in NetSapiens' },
  { key: 'confirmButtons', label: 'Confirm button layouts / BLF assignments in NetSapiens' },
  { key: 'validateHours', label: 'Validate business hours and after-hours routing' },
]

export function systemConfigChecklistComplete(values = {}) {
  return SYSTEM_CONFIG_CHECKS.every(item => !!values[item.key])
}
