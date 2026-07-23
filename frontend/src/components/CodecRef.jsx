/**
 * CodecRef — Codec & QoS quick reference
 * Codec bandwidth table, DSCP/QoS values, SIP port reference
 */

import { useState } from 'react'

const TABS = ['Codecs', 'QoS / DSCP', 'SIP Response Codes']

const CODECS = [
  { name: 'G.711 PCMU', type: 'Narrowband', bandwidth: '87.2 kbps', payload: 0, ptime: '20ms', quality: 'Good', notes: 'US standard, widest carrier support. Use for all carrier trunks.' },
  { name: 'G.711 PCMA', type: 'Narrowband', bandwidth: '87.2 kbps', payload: 8, ptime: '20ms', quality: 'Good', notes: 'A-law variant (EU/international). Equivalent quality to PCMU.' },
  { name: 'G.722', type: 'Wideband HD', bandwidth: '87.2 kbps', payload: 9, ptime: '20ms', quality: 'Excellent', notes: 'HD voice at same bandwidth as G.711. Use for internal calls between Yealink phones.' },
  { name: 'G.722.1', type: 'Wideband HD', bandwidth: '32 kbps', payload: '102–127', ptime: '20ms', quality: 'Excellent', notes: 'Also called Siren. Lower bandwidth than G.722. Yealink default. Disable for carrier trunks — most don\'t support it.' },
  { name: 'G.722.1C', type: 'Super Wideband', bandwidth: '48 kbps', payload: '102–127', ptime: '20ms', quality: 'Excellent', notes: 'Siren14 / 14kHz bandwidth. Yealink extension. Internal only.' },
  { name: 'G.729', type: 'Narrowband', bandwidth: '26.4 kbps', payload: 18, ptime: '20ms', quality: 'Fair', notes: 'Low-bandwidth codec. Good for poor connections. Introduces more latency. Requires license on some platforms.' },
  { name: 'G.726-32', type: 'Narrowband', bandwidth: '55.2 kbps', payload: '96–127', ptime: '20ms', quality: 'Good', notes: 'ADPCM codec. Rare in modern deployments. Some Zultys installs use it.' },
  { name: 'Opus', type: 'Wideband/HD', bandwidth: '6–510 kbps', payload: '96–127', ptime: '20ms', quality: 'Excellent', notes: 'Modern, adaptive codec. WebRTC standard. Not widely supported by SIP carriers. Internal/cloud use only.' },
  { name: 'iLBC', type: 'Narrowband', bandwidth: '15.2 / 13.3 kbps', payload: '96–127', ptime: '20/30ms', quality: 'Fair', notes: 'Very low bandwidth. Poor-connection resilient. Rarely used in enterprise.' },
]

const DSCP = [
  { class: 'EF (Expedited Forwarding)', value: '46', hex: '0x2E', binary: '101110', tos: '0xB8', use: 'VoIP RTP (voice media)', critical: true },
  { class: 'CS3 (Class Selector 3)', value: '24', hex: '0x18', binary: '011000', tos: '0x60', use: 'SIP signaling (call control)', critical: true },
  { class: 'AF41', value: '34', hex: '0x22', binary: '100010', tos: '0x88', use: 'Video conferencing media', critical: false },
  { class: 'AF31', value: '26', hex: '0x1A', binary: '011010', tos: '0x68', use: 'Critical business apps', critical: false },
  { class: 'CS2', value: '16', hex: '0x10', binary: '010000', tos: '0x40', use: 'Network management (SNMP, NTP)', critical: false },
  { class: 'BE (Best Effort)', value: '0',  hex: '0x00', binary: '000000', tos: '0x00', use: 'Default — general internet traffic', critical: false },
]

const QOS_TIPS = [
  { tip: 'Mark SIP at DSCP CS3 (24) on the router/firewall — not the phone VLAN switch.', platform: 'All' },
  { tip: 'Mark RTP at DSCP EF (46). Most Yealink phones do this by default — verify in web UI → Network → Advanced.', platform: 'Yealink' },
  { tip: 'Enable DSCP trust on the phone-side switch ports (trust cos or trust dscp).', platform: 'Cisco / Meraki' },
  { tip: 'On Meraki MX: Security & SD-WAN → Traffic Shaping → set VoIP to "High Priority" and use DSCP EF for RTP.', platform: 'Meraki' },
  { tip: 'On Cisco ISR: use MQC with class-map matching DSCP EF → priority queue; CS3 → queue with bandwidth guarantee.', platform: 'Cisco' },
  { tip: 'Allocate at minimum 85–90 kbps per concurrent G.711 call. Add headroom for SIP signaling overhead.', platform: 'All' },
  { tip: 'G.711 with ptime=20ms = 50 packets/sec per call. Each packet ~214 bytes. Plan bandwidth accordingly.', platform: 'All' },
  { tip: 'Target jitter < 20ms, latency < 150ms one-way, packet loss < 1% for acceptable quality.', platform: 'All' },
]

const SIP_CODES = [
  { code: '100', class: '1xx', label: 'Trying', desc: 'Request received, processing. No action needed.', severity: 'info' },
  { code: '180', class: '1xx', label: 'Ringing', desc: 'Destination phone is ringing.', severity: 'info' },
  { code: '183', class: '1xx', label: 'Session Progress', desc: 'Early media (ringback from carrier). Normal.', severity: 'info' },
  { code: '200', class: '2xx', label: 'OK', desc: 'Call connected / request accepted.', severity: 'ok' },
  { code: '202', class: '2xx', label: 'Accepted', desc: 'REFER or SUBSCRIBE accepted.', severity: 'ok' },
  { code: '301', class: '3xx', label: 'Moved Permanently', desc: 'Extension has a permanent forward. Follow redirect.', severity: 'warn' },
  { code: '302', class: '3xx', label: 'Moved Temporarily', desc: 'Extension has a temporary forward (Follow Me/Find Me).', severity: 'warn' },
  { code: '400', class: '4xx', label: 'Bad Request', desc: 'Malformed SIP message. Check phone config / firmware.', severity: 'error' },
  { code: '401', class: '4xx', label: 'Unauthorized', desc: 'Auth required from registrar. Phone should retry with credentials.', severity: 'warn' },
  { code: '403', class: '4xx', label: 'Forbidden', desc: 'Carrier rejecting call — check caller ID whitelist or IP whitelist.', severity: 'error' },
  { code: '404', class: '4xx', label: 'Not Found', desc: 'Dialed number doesn\'t exist. Check extension/DID mapping.', severity: 'error' },
  { code: '405', class: '4xx', label: 'Method Not Allowed', desc: 'Server doesn\'t support that SIP method. Config mismatch.', severity: 'error' },
  { code: '407', class: '4xx', label: 'Proxy Auth Required', desc: 'Proxy challenge — normal, phone/server must respond with credentials.', severity: 'warn' },
  { code: '408', class: '4xx', label: 'Request Timeout', desc: 'No response from server. Network issue or server unreachable.', severity: 'error' },
  { code: '480', class: '4xx', label: 'Temporarily Unavailable', desc: 'User exists but is unavailable (DND, all lines busy, offline).', severity: 'warn' },
  { code: '481', class: '4xx', label: 'Call Leg Does Not Exist', desc: 'Server has no record of this call. Usually a retransmit after BYE.', severity: 'warn' },
  { code: '486', class: '4xx', label: 'Busy Here', desc: 'Extension is busy. Expected behavior.', severity: 'warn' },
  { code: '487', class: '4xx', label: 'Request Terminated', desc: 'Call was cancelled before answer (CANCEL received).', severity: 'info' },
  { code: '488', class: '4xx', label: 'Not Acceptable Here', desc: 'Codec mismatch — no common codec agreed on. Check codec config.', severity: 'error' },
  { code: '491', class: '4xx', label: 'Request Pending', desc: 'A re-INVITE is pending. Retry after a short delay.', severity: 'warn' },
  { code: '500', class: '5xx', label: 'Server Internal Error', desc: 'Server-side error. Check NetSapiens/Zultys server logs.', severity: 'error' },
  { code: '503', class: '5xx', label: 'Service Unavailable', desc: 'Server overloaded or trunk down. Check carrier status.', severity: 'error' },
  { code: '504', class: '5xx', label: 'Server Timeout', desc: 'Upstream server didn\'t respond. Check SBC/carrier connectivity.', severity: 'error' },
  { code: '603', class: '6xx', label: 'Decline', desc: 'Far end explicitly rejected the call. DND or blocked number.', severity: 'error' },
]

const SEVERITY_CLS = { ok: 'cr-sev-ok', warn: 'cr-sev-warn', error: 'cr-sev-error', info: 'cr-sev-info' }

export default function CodecRef() {
  const [tab, setTab] = useState('Codecs')
  const [codeFilter, setCodeFilter] = useState('')

  const filteredCodes = SIP_CODES.filter(c =>
    !codeFilter ||
    c.code.includes(codeFilter) ||
    c.label.toLowerCase().includes(codeFilter.toLowerCase()) ||
    c.desc.toLowerCase().includes(codeFilter.toLowerCase())
  )

  return (
    <div className="cr-root">
      <div className="cr-header">
        <div className="cr-title">Codec &amp; QoS Reference</div>
        <div className="cr-subtitle">Codec specs, DSCP values, and SIP response code lookup</div>
      </div>

      <div className="cr-tabs">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            className={`cr-tab${tab === t ? ' cr-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Codecs' && (
        <div className="cr-table-wrap">
          <div className="cr-codec-table">
            <div className="cr-codec-head">
              <span>Codec</span>
              <span>Type</span>
              <span>Bandwidth</span>
              <span>Payload</span>
              <span>Quality</span>
              <span>Notes</span>
            </div>
            {CODECS.map(c => (
              <div key={c.name} className="cr-codec-row">
                <span className="cr-codec-name">{c.name}</span>
                <span className="cr-codec-type">{c.type}</span>
                <span className="cr-codec-bw">{c.bandwidth}</span>
                <span className="cr-codec-pt">{c.payload}</span>
                <span className={`cr-codec-q cr-q-${c.quality.toLowerCase()}`}>{c.quality}</span>
                <span className="cr-codec-notes">{c.notes}</span>
              </div>
            ))}
          </div>
          <div className="cr-footer-note">
            Bandwidth shown is total UDP/IP per stream including headers (RTP + UDP + IP). ptime = packet interval. Double for full-duplex.
          </div>
        </div>
      )}

      {tab === 'QoS / DSCP' && (
        <div>
          <div className="cr-table-wrap">
            <div className="cr-dscp-table">
              <div className="cr-dscp-head">
                <span>Class</span>
                <span>DSCP Value</span>
                <span>Hex</span>
                <span>ToS Byte</span>
                <span>Use Case</span>
              </div>
              {DSCP.map(d => (
                <div key={d.class} className={`cr-dscp-row${d.critical ? ' cr-dscp-critical' : ''}`}>
                  <span className="cr-dscp-class">{d.class}</span>
                  <span className="cr-dscp-val">{d.value}</span>
                  <span className="cr-dscp-hex">{d.hex}</span>
                  <span className="cr-dscp-tos">{d.tos}</span>
                  <span className="cr-dscp-use">{d.use}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cr-tips-heading">QoS Best Practices</div>
          <div className="cr-tips">
            {QOS_TIPS.map((t, i) => (
              <div key={i} className="cr-tip">
                <span className="cr-tip-platform">{t.platform}</span>
                <span className="cr-tip-text">{t.tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'SIP Response Codes' && (
        <div>
          <div className="cr-search-wrap">
            <input
              className="cr-search"
              type="text"
              placeholder="Search by code, name, or description…"
              value={codeFilter}
              onChange={e => setCodeFilter(e.target.value)}
            />
          </div>
          <div className="cr-table-wrap">
            <div className="cr-sip-table">
              <div className="cr-sip-head">
                <span>Code</span>
                <span>Name</span>
                <span>What it means</span>
              </div>
              {filteredCodes.map(c => (
                <div key={c.code} className={`cr-sip-row ${SEVERITY_CLS[c.severity]}`}>
                  <span className="cr-sip-code">{c.code}</span>
                  <span className="cr-sip-label">{c.label}</span>
                  <span className="cr-sip-desc">{c.desc}</span>
                </div>
              ))}
              {filteredCodes.length === 0 && (
                <div className="cr-sip-empty">No matching codes</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
