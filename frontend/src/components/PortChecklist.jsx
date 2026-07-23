/**
 * PortChecklist — VoIP firewall & port reference
 * Per-platform checklists with toggleable check states
 */

import { useState } from 'react'

const PLATFORMS = [
  {
    id: 'netsapiens',
    label: 'NetSapiens',
    description: 'Ports required between phones, SBC, and carrier',
    sections: [
      {
        heading: 'SIP Signaling',
        rows: [
          { proto: 'UDP', port: '5060',        direction: 'Both',     desc: 'SIP — phones to proxy, proxy to carrier' },
          { proto: 'TCP', port: '5060',        direction: 'Both',     desc: 'SIP over TCP (optional, some carriers)' },
          { proto: 'TLS', port: '5061',        direction: 'Both',     desc: 'SIP over TLS (encrypted signaling)' },
        ],
      },
      {
        heading: 'Media (RTP/SRTP)',
        rows: [
          { proto: 'UDP', port: '10000–20000', direction: 'Both',     desc: 'RTP media — voice/fax audio streams' },
          { proto: 'UDP', port: '10000–20000', direction: 'Both',     desc: 'SRTP (encrypted) — same range as RTP' },
        ],
      },
      {
        heading: 'Provisioning',
        rows: [
          { proto: 'HTTP',  port: '80',   direction: 'Outbound', desc: 'Phone auto-provisioning (HTTP)' },
          { proto: 'HTTPS', port: '443',  direction: 'Outbound', desc: 'Phone auto-provisioning (HTTPS) + portal' },
        ],
      },
      {
        heading: 'Multicast Paging',
        rows: [
          { proto: 'UDP', port: '10000',  direction: 'Inbound',  desc: 'Multicast paging — Yealink default group port' },
          { proto: 'UDP', port: '224.1.1.1', direction: 'LAN',   desc: 'Multicast group address — must not be blocked by switch IGMP' },
        ],
      },
    ],
  },
  {
    id: 'meta',
    label: 'Meta',
    description: 'Ports required for Meta hosted voice platform',
    sections: [
      {
        heading: 'SIP Signaling',
        rows: [
          { proto: 'UDP', port: '5060',  direction: 'Both',     desc: 'SIP — phones to Meta proxy' },
          { proto: 'TLS', port: '5061',  direction: 'Both',     desc: 'SIP over TLS — required for some Meta deployments' },
        ],
      },
      {
        heading: 'Media (RTP)',
        rows: [
          { proto: 'UDP', port: '10000–20000', direction: 'Both', desc: 'RTP audio streams' },
          { proto: 'UDP', port: '16384–32767', direction: 'Both', desc: 'Alternate RTP range (confirm with Meta)' },
        ],
      },
      {
        heading: 'Provisioning & Portal',
        rows: [
          { proto: 'HTTPS', port: '443', direction: 'Outbound', desc: 'Meta admin portal + phone provisioning' },
          { proto: 'HTTP',  port: '80',  direction: 'Outbound', desc: 'Redirect to HTTPS (provisioning bootstrap)' },
        ],
      },
    ],
  },
  {
    id: 'zultys',
    label: 'Zultys MX',
    description: 'Ports for Zultys MX on-prem or hosted deployments',
    sections: [
      {
        heading: 'SIP Signaling',
        rows: [
          { proto: 'UDP', port: '5060', direction: 'Both',    desc: 'SIP — Yealink phones to MX server' },
          { proto: 'TCP', port: '5060', direction: 'Both',    desc: 'SIP over TCP — some Zultys configs' },
          { proto: 'TLS', port: '5061', direction: 'Both',    desc: 'SIP over TLS (if enabled on MX)' },
        ],
      },
      {
        heading: 'Media (RTP)',
        rows: [
          { proto: 'UDP', port: '8000–8200', direction: 'Both', desc: 'RTP — default Zultys MX media port range' },
          { proto: 'UDP', port: '10000–20000', direction: 'Both', desc: 'Alternate RTP range (configurable in MX Admin)' },
        ],
      },
      {
        heading: 'MX Admin & MXIE',
        rows: [
          { proto: 'TCP',   port: '7505',  direction: 'Both',    desc: 'MXIE client connection to MX server' },
          { proto: 'HTTPS', port: '443',   direction: 'Outbound', desc: 'MX web admin panel' },
          { proto: 'TCP',   port: '7500',  direction: 'Inbound',  desc: 'MX admin tool (MXAdministrator)' },
        ],
      },
      {
        heading: 'SIP Trunk to Carrier',
        rows: [
          { proto: 'UDP', port: '5060',        direction: 'Both', desc: 'SIP trunk from MX to carrier SBC' },
          { proto: 'UDP', port: '10000–20000', direction: 'Both', desc: 'RTP media from MX to carrier' },
        ],
      },
    ],
  },
  {
    id: 'yealink',
    label: 'Yealink Phones',
    description: 'Ports needed on the phone VLAN / LAN segment',
    sections: [
      {
        heading: 'Registration & Signaling',
        rows: [
          { proto: 'UDP', port: '5060',  direction: 'Outbound', desc: 'SIP REGISTER and INVITE to proxy' },
          { proto: 'TLS', port: '5061',  direction: 'Outbound', desc: 'SIP over TLS (if configured)' },
        ],
      },
      {
        heading: 'Audio (RTP)',
        rows: [
          { proto: 'UDP', port: '11780–11800', direction: 'Both', desc: 'Default Yealink RTP port range (configurable)' },
          { proto: 'UDP', port: '10000–20000', direction: 'Both', desc: 'Broader RTP range to cover server media ports' },
        ],
      },
      {
        heading: 'Provisioning',
        rows: [
          { proto: 'HTTP',  port: '80',  direction: 'Outbound', desc: 'Config server (http:// provisioning URL)' },
          { proto: 'HTTPS', port: '443', direction: 'Outbound', desc: 'Config server (https:// provisioning URL)' },
          { proto: 'TFTP',  port: '69',  direction: 'Outbound', desc: 'TFTP provisioning (legacy — avoid if possible)' },
        ],
      },
      {
        heading: 'Yealink Management',
        rows: [
          { proto: 'HTTP',  port: '80',  direction: 'Inbound', desc: 'Yealink phone web UI (HTTP)' },
          { proto: 'HTTPS', port: '443', direction: 'Inbound', desc: 'Yealink phone web UI (HTTPS)' },
        ],
      },
      {
        heading: 'Multicast Paging (Sending)',
        rows: [
          { proto: 'UDP', port: '10000', direction: 'LAN', desc: 'Multicast page send — default group 224.1.1.1:10000' },
        ],
      },
    ],
  },
  {
    id: 'algo',
    label: 'Algo Paging',
    description: 'Network requirements for Algo paging units',
    sections: [
      {
        heading: 'SIP Registration',
        rows: [
          { proto: 'UDP', port: '5060', direction: 'Outbound', desc: 'Algo SIP REGISTER to proxy (NetSapiens or Zultys)' },
        ],
      },
      {
        heading: 'Audio',
        rows: [
          { proto: 'UDP', port: '5004',        direction: 'Both', desc: 'RTP audio — Algo default media port' },
          { proto: 'UDP', port: '10000–20000', direction: 'Both', desc: 'RTP range from SIP server media' },
        ],
      },
      {
        heading: 'Multicast Receive',
        rows: [
          { proto: 'UDP', port: '10000', direction: 'Inbound', desc: 'Multicast group port (must match Yealink paging key)' },
        ],
      },
      {
        heading: 'Web Management',
        rows: [
          { proto: 'HTTP',  port: '80',  direction: 'Inbound', desc: 'Algo web UI' },
          { proto: 'HTTPS', port: '443', direction: 'Inbound', desc: 'Algo web UI (HTTPS)' },
        ],
      },
    ],
  },
]

const DIR_LABELS = {
  Both: { label: 'In + Out', cls: 'pc-dir-both' },
  Inbound: { label: 'Inbound', cls: 'pc-dir-in' },
  Outbound: { label: 'Outbound', cls: 'pc-dir-out' },
  LAN: { label: 'LAN', cls: 'pc-dir-lan' },
}

export default function PortChecklist() {
  const [activePlatform, setActivePlatform] = useState('netsapiens')
  const [checked, setChecked] = useState({})

  const platform = PLATFORMS.find(p => p.id === activePlatform)

  function toggle(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function resetChecks() {
    setChecked({})
  }

  const totalRows = platform.sections.reduce((sum, s) => sum + s.rows.length, 0)
  const checkedCount = platform.sections.reduce((sum, s) =>
    sum + s.rows.filter((_, i) => checked[`${activePlatform}-${s.heading}-${i}`]).length, 0)

  return (
    <div className="pc-root">
      <div className="pc-header">
        <div className="pc-title">Port &amp; Firewall Checklist</div>
        <div className="pc-subtitle">Required ports by platform — check off as you verify</div>
      </div>

      <div className="pc-platform-tabs">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`pc-tab${activePlatform === p.id ? ' pc-tab-active' : ''}`}
            onClick={() => setActivePlatform(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="pc-platform-desc">{platform.description}</div>

      <div className="pc-progress-row">
        <div className="pc-progress-bar">
          <div
            className="pc-progress-fill"
            style={{ width: `${totalRows ? (checkedCount / totalRows) * 100 : 0}%` }}
          />
        </div>
        <span className="pc-progress-label">{checkedCount} / {totalRows} verified</span>
        {checkedCount > 0 && (
          <button type="button" className="pc-reset-btn" onClick={resetChecks}>Reset</button>
        )}
      </div>

      {platform.sections.map(section => (
        <div key={section.heading} className="pc-section">
          <div className="pc-section-heading">{section.heading}</div>
          <div className="pc-table">
            <div className="pc-table-head">
              <span>Protocol</span>
              <span>Port / Address</span>
              <span>Direction</span>
              <span>Purpose</span>
              <span>Verified</span>
            </div>
            {section.rows.map((row, i) => {
              const key = `${activePlatform}-${section.heading}-${i}`
              const isChecked = !!checked[key]
              const dir = DIR_LABELS[row.direction] || { label: row.direction, cls: '' }
              return (
                <label key={i} className={`pc-row${isChecked ? ' pc-row-checked' : ''}`}>
                  <span className="pc-proto">{row.proto}</span>
                  <span className="pc-port">{row.port}</span>
                  <span className={`pc-dir ${dir.cls}`}>{dir.label}</span>
                  <span className="pc-desc">{row.desc}</span>
                  <span className="pc-check-wrap">
                    <input
                      type="checkbox"
                      className="pc-checkbox"
                      checked={isChecked}
                      onChange={() => toggle(key)}
                    />
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
