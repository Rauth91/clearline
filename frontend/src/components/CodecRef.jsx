/**
 * CodecRef — Codec & QoS quick reference
 * Codec bandwidth table, DSCP/QoS values, SIP port reference
 */

import { useEffect, useState } from 'react'
import { CODECS, DSCP, QOS_TIPS, SIP_CODES } from '../data/codecRef.js'
import { useRoute } from '../lib/router.js'

const TABS = ['Codecs', 'QoS / DSCP', 'SIP Response Codes']

const SEVERITY_CLS = { ok: 'cr-sev-ok', warn: 'cr-sev-warn', error: 'cr-sev-error', info: 'cr-sev-info' }

function tabFromQuery(query) {
  const raw = String(query?.tab || '').toLowerCase()
  if (raw === 'sip' || raw === 'codes' || raw === 'response') return 'SIP Response Codes'
  if (raw === 'qos' || raw === 'dscp') return 'QoS / DSCP'
  if (raw === 'codec' || raw === 'codecs') return 'Codecs'
  return null
}

export default function CodecRef({ initialTab } = {}) {
  const route = useRoute()
  const fromQuery = tabFromQuery(route.query)
  const [tab, setTab] = useState(() => initialTab || fromQuery || 'Codecs')
  const [codeFilter, setCodeFilter] = useState('')

  useEffect(() => {
    const next = initialTab || fromQuery
    if (next) setTab(next)
  }, [initialTab, fromQuery])

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
