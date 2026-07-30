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

export function migrationUserFromLine(row, { id, defaultPin = '1234' } = {}) {
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
    dept:cleanImportedField(row?.Department),
    site: '',
    did: dn,
  }
}

export function normalizeMigrationExtension(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 8)
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

    const mac = String(device.mac ?? '').replace(/[^0-9A-Fa-f]/g, '').toLowerCase()
    const deviceKey = mac || String(device.id ?? '')
    if (!deviceKey) continue

    const deviceKeys = devicesByExtension.get(extension) || new Set()
    deviceKeys.add(deviceKey)
    devicesByExtension.set(extension, deviceKeys)
  }

  const duplicateExtensions = new Set()
  const deviceCounts = {}
  for (const [extension, deviceKeys] of devicesByExtension) {
    deviceCounts[extension] = deviceKeys.size
    if (deviceKeys.size > 1) duplicateExtensions.add(extension)
  }

  return { duplicateExtensions, deviceCounts }
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
