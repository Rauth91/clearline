import { describe, expect, it } from 'vitest'
import {
  analyzeDeviceExtensionAssignments,
  analyzeMigrationExtensions,
  buildYealinkServerAudit,
  cleanImportedField,
  cleanMigrationName,
  extensionsByDn,
  migrationE911Fields,
  migrationUserFromLine,
  netSapiensPhoneModel,
  normalizeMigrationExtension,
  normalizeMigrationMac,
  splitMigrationName,
  yealinkAuditExceptions,
  yealinkServerDeviceFromRow,
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
    expect(migrationUserFromLine({
      'Directory number':'2255551234',
      Name:'Jane Doe',
    }, { id:'user-2' }).vmPin).toBe('')
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
  it('formats Yealink models for the NetSapiens phone import', () => {
    expect(netSapiensPhoneModel('Yealink T53W')).toBe('Yealink SIP-T53W')
    expect(netSapiensPhoneModel('SIP-T53w')).toBe('Yealink SIP-T53W')
    expect(netSapiensPhoneModel('Yealink T54W')).toBe('Yealink SIP-T54W')
    expect(netSapiensPhoneModel('Yealink T46S')).toBe('Yealink SIP-T46S')
    expect(netSapiensPhoneModel('Yealink T21P_E2')).toBe('Yealink SIP-T21P_E2')
    expect(netSapiensPhoneModel('Polycom VVX450')).toBe('Polycom VVX450')
  })

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

  it('changes the approval key when the phones on a shared extension change', () => {
    const first = analyzeDeviceExtensionAssignments([
      { mac:'000000000001', line1:'1001' },
      { mac:'000000000002', line1:'1001' },
    ])
    const reordered = analyzeDeviceExtensionAssignments([
      { mac:'000000000002', line1:'1001' },
      { mac:'000000000001', line1:'1001' },
    ])
    const changed = analyzeDeviceExtensionAssignments([
      { mac:'000000000001', line1:'1001' },
      { mac:'000000000003', line1:'1001' },
    ])

    expect(first.approvalKeys['1001']).toBe(reordered.approvalKeys['1001'])
    expect(first.approvalKeys['1001']).not.toBe(changed.approvalKeys['1001'])
  })
})

describe('Yealink server audit', () => {
  it('parses the optional server export fields', () => {
    const device = yealinkServerDeviceFromRow({
      MAC:' 80:5E:0C:B8:8F:91 ',
      'Machine ID(Serial Number)':'201087E073216500',
      Model:'SIP-T53W',
      'Device Name':'Active 7',
      Site:'Customer/Main',
      'Device Status':'ONLINE',
      'Valid Status':'normal',
      'Last Report Time':'2026-07-30 06:59:43',
      'Firmware Version':'96.86.0.70',
      'Account Type 1':'SIP',
      'Account Info 1':'9853044260',
      'Account Status 1':'registered',
    }, { id:'server-1' })

    expect(device).toMatchObject({
      id:'server-1',
      mac:'805e0cb88f91',
      model:'SIP-T53W',
      status:'online',
      lastReport:'2026-07-30 06:59:43',
      firmwareVersion:'96.86.0.70',
      accounts:[{ type:'SIP', info:'9853044260', status:'registered' }],
    })
    expect(normalizeMigrationMac('80-5E-0C-B8-8F-91')).toBe('805e0cb88f91')
  })

  it('classifies every server-to-migration comparison category', () => {
    const serverDevices = [
      { id:'ready', mac:'000000000001', status:'online', accounts:[{ info:'1001' }] },
      { id:'verify', mac:'000000000002', status:'offline', accounts:[{ info:'1002' }] },
      { id:'investigate', mac:'000000000003', status:'online', accounts:[{ info:'1003' }] },
      { id:'cleanup', mac:'000000000004', status:'offline', accounts:[{ info:'1004' }] },
      { id:'strong', mac:'000000000005', status:'offline', accounts:[] },
    ]
    const rows = buildYealinkServerAudit(serverDevices, [
      { mac:'000000000001' },
      { mac:'000000000002' },
    ])
    const categories = Object.fromEntries(rows.map(row => [row.id, row.category]))

    expect(categories).toEqual({
      ready:'ready',
      verify:'verify',
      investigate:'investigate',
      cleanup:'cleanup',
      strong:'strongCleanup',
    })
    expect(yealinkAuditExceptions(rows).map(row => row.id))
      .toEqual(['verify', 'investigate', 'cleanup', 'strong'])
  })

  it('warns when one SIP account appears on multiple MACs', () => {
    const rows = buildYealinkServerAudit([
      { id:'a', mac:'000000000001', status:'online', accounts:[{ info:'1001' }] },
      { id:'b', mac:'000000000002', status:'offline', accounts:[{ info:'1001' }] },
    ], [{ mac:'000000000001' }])

    expect(rows[0].duplicateAccounts).toEqual(['1001'])
    expect(rows[1].duplicateAccounts).toEqual(['1001'])
    expect(yealinkAuditExceptions(rows).map(row => row.id)).toEqual(['a', 'b'])
  })
})
