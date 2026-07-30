import { describe, expect, it } from 'vitest'
import {
  analyzeDeviceExtensionAssignments,
  analyzeMigrationExtensions,
  cleanImportedField,
  cleanMigrationName,
  extensionsByDn,
  migrationE911Fields,
  migrationUserFromLine,
  normalizeMigrationExtension,
  splitMigrationName,
} from '../migrationExtensions.js'

describe('migration extension import', () => {
  it('removes wrapping quotes from fields without changing internal apostrophes', () => {
    expect(cleanImportedField("'2255551234'")).toBe('2255551234')
    expect(cleanImportedField('"Sales"')).toBe('Sales')
    expect(cleanImportedField("'O'Brien'")).toBe("O'Brien")
    expect(cleanImportedField("30' cable")).toBe("30' cable")
  })

  it('leaves the extension blank instead of deriving it from the DID', () => {
    const user = migrationUserFromLine({
      'Directory number': '1 (225) 555-1234',
      Name: "'Jane Doe'",
      Department: 'Sales',
    }, { id:'user-1', defaultPin:'2468' })

    expect(user).toMatchObject({
      id:'user-1',
      dn:'2255551234',
      did:'2255551234',
      ext:'',
      firstName:'Jane',
      lastName:'Doe',
      vmPin:'2468',
    })
  })

  it('removes wrapping quotes and supplies a dash for a blank last name', () => {
    expect(cleanMigrationName("  'Jane Smith'  ")).toBe('Jane Smith')
    expect(splitMigrationName("'Jane'")).toEqual(['Jane', '-'])
    expect(splitMigrationName('"Doe, Jane"')).toEqual(['Jane', 'Doe'])
    expect(splitMigrationName('')).toEqual(['', '-'])
  })
})

describe('migration E911 address', () => {
  it('maps structured address fields for the NetSapiens export', () => {
    expect(migrationE911Fields({
      e911Address1:'123 Main St',
      e911Address2:'Suite 200',
      e911City:'Baton Rouge',
      e911State:'la',
      e911Zip:'70801',
    })).toEqual({
      addressLine1:'123 Main St',
      addressLine2:'Suite 200',
      city:'Baton Rouge',
      state:'LA',
      zip:'70801',
    })
  })

  it('keeps the legacy one-line address as address 1', () => {
    expect(migrationE911Fields({ e911Address:'456 Legacy Rd' }).addressLine1)
      .toBe('456 Legacy Rd')
  })
})

describe('custom migration extensions', () => {
  it('normalizes manual extensions and never falls back to a DID', () => {
    expect(normalizeMigrationExtension(' ext. 10-01 ')).toBe('1001')
    expect(extensionsByDn([
      { dn:'2255551000', ext:'1001' },
      { dn:'2255552000', ext:'' },
    ])).toEqual({ '2255551000':'1001' })
  })

  it('reports missing and duplicate custom extensions separately', () => {
    const result = analyzeMigrationExtensions([
      { id:'a', ext:'' },
      { id:'b', ext:'1001' },
      { id:'c', ext:'1001' },
      { id:'d', ext:'1002' },
    ])

    expect([...result.missingIds]).toEqual(['a'])
    expect([...result.collisions]).toEqual(['1001'])
  })
})

describe('device extension assignments', () => {
  it('finds an extension assigned to multiple MAC addresses', () => {
    const result = analyzeDeviceExtensionAssignments([
      { id:'a', mac:'AA:BB:CC:DD:EE:01', dn:'2255551000', line1:'' },
      { id:'b', mac:'AA:BB:CC:DD:EE:02', dn:'2255551000', line1:'' },
      { id:'c', mac:'AA:BB:CC:DD:EE:03', dn:'2255552000', line1:'' },
    ], {
      '2255551000':'1001',
      '2255552000':'1002',
    })

    expect([...result.duplicateExtensions]).toEqual(['1001'])
    expect(result.deviceCounts).toEqual({ '1001':2, '1002':1 })
  })

  it('does not count a repeated row for the same MAC as multiple devices', () => {
    const result = analyzeDeviceExtensionAssignments([
      { id:'a', mac:'aabbccddee01', line1:'1001' },
      { id:'b', mac:'aabbccddee01', line1:'1001' },
    ])

    expect([...result.duplicateExtensions]).toEqual([])
    expect(result.deviceCounts['1001']).toBe(1)
  })
})
