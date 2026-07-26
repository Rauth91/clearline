import { describe, expect, it } from 'vitest'
import {
  buildPrescription,
  prescriptionToText,
  udpTimeoutSeconds,
  voicePriorityKbps,
} from '../routerAdvisor.js'
import { PLATFORM_PORTS, ROUTER_PROFILES } from '../routerProfiles.js'

describe('voicePriorityKbps', () => {
  it('ceils seats × 87.2 for G.711', () => {
    expect(voicePriorityKbps(10, 'g711')).toBe(Math.ceil(10 * 87.2))
    expect(voicePriorityKbps(1, 'g711')).toBe(88)
  })

  it('uses G.729 kbps when selected', () => {
    expect(voicePriorityKbps(10, 'g729')).toBe(Math.ceil(10 * 26.4))
  })
})

describe('udpTimeoutSeconds', () => {
  it('is 2× registration interval', () => {
    expect(udpTimeoutSeconds(3600)).toBe(7200)
  })
})

describe('buildPrescription', () => {
  it('puts SIP ALG first for every profile', () => {
    for (const p of ROUTER_PROFILES) {
      const rx = buildPrescription({
        profileId: p.id,
        platformId: 'netsapiens',
        seats: 8,
      })
      expect(rx.items[0].id).toBe('sip-alg')
      expect(rx.items[0].title).toMatch(/SIP ALG/i)
      expect(rx.items[0].body || rx.items[0].steps?.length || rx.items[0].snippet).toBeTruthy()
    }
  })

  it('injects platform port table into firewall item', () => {
    const rx = buildPrescription({
      profileId: 'cisco-ios',
      platformId: 'zultys',
      seats: 5,
    })
    const fw = rx.items.find(i => i.id === 'firewall')
    expect(fw).toBeTruthy()
    expect(fw.meta.platformId).toBe('zultys')
    expect(fw.steps.join(' ')).toMatch(/5060/)
    expect(fw.steps.join(' ')).toMatch(/10000/)
    expect(fw.body).toMatch(/Zultys/)
  })

  it('states UDP timeout rule text', () => {
    const rx = buildPrescription({
      profileId: 'generic',
      platformId: 'netsapiens',
      seats: 3,
    })
    const udp = rx.items.find(i => i.id === 'udp-timeout')
    expect(udp.body).toMatch(/2\s*×/i)
    expect(udp.body).toMatch(/7200/)
    expect(udp.meta.udpTimeout).toBe(7200)
  })

  it('includes VLAN section only when checked', () => {
    const off = buildPrescription({ profileId: 'meraki-mx', seats: 2, phonesOnVlan: false })
    const on = buildPrescription({ profileId: 'meraki-mx', seats: 2, phonesOnVlan: true })
    expect(off.items.some(i => i.id === 'vlan-dhcp')).toBe(false)
    expect(on.items.some(i => i.id === 'vlan-dhcp')).toBe(true)
  })

  it('exports text with ALG heading', () => {
    const rx = buildPrescription({ profileId: 'mikrotik', platformId: 'meta', seats: 12 })
    const text = prescriptionToText(rx)
    expect(text).toMatch(/Disable SIP ALG/)
    expect(text).toMatch(/MikroTik/)
  })

  it('exposes platformPorts for all three platforms', () => {
    expect(Object.keys(PLATFORM_PORTS).sort()).toEqual(['meta', 'netsapiens', 'zultys'])
  })
})
