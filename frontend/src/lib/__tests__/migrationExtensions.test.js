import { describe, expect, it } from 'vitest'
import {
  analyzeMigrationExtensions,
  cleanMigrationName,
  extensionsByDn,
  migrationE911Fields,
  migrationUserFromLine,
  normalizeMigrationExtension,
  splitMigrationName,
} from '../migrationExtensions.js'

describe('migration extension import', () => {
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
