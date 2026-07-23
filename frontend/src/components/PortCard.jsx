/**
 * PortCard — compact number port / FOC fields + collapsible firewall checklist
 */

import { useMemo, useState } from 'react'
import { emptyPort } from '../lib/jobModel.js'
import { PORT_PLATFORM_CHECKLISTS } from './PortChecklist.jsx'

export default function PortCard({ port: portProp, survey, onSave }) {
  const port = emptyPort(portProp || {})
  const [openChecklist, setOpenChecklist] = useState(false)
  const [platformId, setPlatformId] = useState(PORT_PLATFORM_CHECKLISTS[0]?.id || 'netsapiens')
  const [didDraft, setDidDraft] = useState('')

  const platform = useMemo(
    () => PORT_PLATFORM_CHECKLISTS.find(p => p.id === platformId) || PORT_PLATFORM_CHECKLISTS[0],
    [platformId],
  )

  function patch(partial) {
    onSave?.({ ...port, ...partial })
  }

  function copyDidsFromSurvey() {
    const fromMain = (survey?.mainNumbers || [])
      .map(n => String(n.number || '').trim())
      .filter(Boolean)
    const fromUsers = (survey?.users || [])
      .map(u => String(u.phone || '').trim())
      .filter(Boolean)
    const merged = [...new Set([...fromMain, ...fromUsers, ...(port.dids || []).filter(Boolean)])]
    patch({ dids: merged })
  }

  function addDid() {
    const value = didDraft.trim()
    if (!value) return
    const merged = [...new Set([...(port.dids || []), value])]
    patch({ dids: merged })
    setDidDraft('')
  }

  function removeDid(num) {
    patch({ dids: (port.dids || []).filter(d => d !== num) })
  }

  function toggleCheck(key) {
    const checklist = { ...(port.checklist || {}) }
    checklist[key] = !checklist[key]
    patch({ checklist })
  }

  return (
    <div className="port-card cockpit-panel">
      <div className="port-card-head">
        <div>
          <div className="survey-kicker">Port</div>
          <h2>Number port / FOC</h2>
        </div>
        <div className="port-card-head-actions">
          <button type="button" className="btn btn-secondary" onClick={copyDidsFromSurvey}>
            Copy DIDs
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOpenChecklist(o => !o)}
            aria-expanded={openChecklist}
          >
            {openChecklist ? 'Hide' : 'Firewall'} ports
          </button>
        </div>
      </div>

      <div className="port-card-form">
        <label className="port-inline">
          <span>Carrier</span>
          <input
            value={port.carrier}
            onChange={e => patch({ carrier: e.target.value })}
            placeholder="Bandwidth / Inteliquent…"
            aria-label="Carrier"
          />
        </label>
        <label className="port-inline">
          <span>Order #</span>
          <input
            value={port.orderNumber}
            onChange={e => patch({ orderNumber: e.target.value })}
            aria-label="Order number"
          />
        </label>

        <div className="port-foc-row">
          <label className="port-inline">
            <span>FOC date</span>
            <input
              type="date"
              value={port.focDate || ''}
              onChange={e => patch({ focDate: e.target.value })}
              aria-label="FOC date"
            />
          </label>
          <label className="port-confirm-inline">
            <input
              type="checkbox"
              checked={Boolean(port.focConfirmed)}
              onChange={e => patch({ focConfirmed: e.target.checked })}
            />
            <span>FOC confirmed</span>
          </label>
          <label className="port-confirm-inline">
            <input
              type="checkbox"
              checked={Boolean(port.csrVerified)}
              onChange={e => patch({ csrVerified: e.target.checked })}
            />
            <span>CSR verified</span>
          </label>
        </div>

        <div className="port-dids">
          <div className="port-dids-label">DIDs to port</div>
          <div className="port-did-chips">
            {(port.dids || []).length === 0 && (
              <span className="port-did-empty">None yet — copy from survey or add below</span>
            )}
            {(port.dids || []).map(num => (
              <button
                key={num}
                type="button"
                className="port-did-chip"
                onClick={() => removeDid(num)}
                title="Remove"
                aria-label={`Remove ${num}`}
              >
                {num}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          <div className="port-did-add">
            <input
              value={didDraft}
              onChange={e => setDidDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addDid()
                }
              }}
              placeholder="Add number"
              aria-label="Add DID to port"
            />
            <button type="button" className="btn btn-secondary" onClick={addDid}>
              Add
            </button>
          </div>
        </div>

        <label className="port-inline port-notes">
          <span>Notes</span>
          <input
            value={port.notes}
            onChange={e => patch({ notes: e.target.value })}
            placeholder="Optional"
            aria-label="Port notes"
          />
        </label>
      </div>

      {openChecklist && platform && (
        <div className="port-card-checklist">
          <div className="test-run-tabs" role="tablist" aria-label="Platform">
            {PORT_PLATFORM_CHECKLISTS.map(p => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === platform.id}
                className={`test-run-tab${p.id === platform.id ? ' is-active' : ''}`}
                onClick={() => setPlatformId(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="muted">{platform.description}</p>
          {(platform.sections || []).map(section => (
            <div key={section.heading} className="port-check-section">
              <h4>{section.heading}</h4>
              <ul className="port-check-list">
                {section.rows.map((row, i) => {
                  const key = `${platform.id}:${section.heading}:${row.proto}:${row.port}:${i}`
                  return (
                    <li key={key}>
                      <label className="install-check">
                        <input
                          type="checkbox"
                          checked={Boolean(port.checklist?.[key])}
                          onChange={() => toggleCheck(key)}
                        />
                        <span>
                          <strong>{row.proto} {row.port}</strong>
                          {' · '}
                          {row.direction}
                          {' — '}
                          {row.desc}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
