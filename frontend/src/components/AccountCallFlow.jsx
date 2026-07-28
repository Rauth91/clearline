/**
 * AccountCallFlow — visual-first call flow editor.
 *
 * Layout: diagram (left, primary) + contextual edit panel (right).
 * Clicking any node on the diagram opens its edit panel.
 * Undo/redo via useReducer history stack. Keyboard shortcuts: ⌘Z, ⌘⇧Z, ⌘S, ?
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CallFlowDiagram from './CallFlowDiagram.jsx'
import {
  callFlowSummary,
  exportAccountFile,
  getAccount,
  saveAccount,
} from '../lib/accountModel.js'
import { exportCustomerFlowReview } from '../lib/customerFlowExport.js'
import {
  createEmptyRoute,
  mergeCallFlowPayload,
  normalizeAccountRoutes,
  routeToDiagramDesign,
} from '../lib/callFlowShape.js'
import { makeId } from '../lib/surveyModel.js'
import { FEATURES } from '../lib/features.js'
import { getAllTemplates, applyTemplate, saveAsTemplate } from '../lib/callFlowTemplates.js'
import { exportCallFlowPdf } from '../lib/callFlowPdf.js'

// ── History reducer for undo/redo ─────────────────────────────────────────────
const HISTORY_LIMIT = 20

function historyReducer(state, action) {
  switch (action.type) {
    case 'PATCH': {
      const next = action.updater(state.present)
      if (next === state.present) return state
      return {
        past: [...state.past.slice(-HISTORY_LIMIT), state.present],
        present: next,
        future: [],
      }
    }
    case 'UNDO': {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] }
    }
    case 'REDO': {
      if (!state.future.length) return state
      const next = state.future[0]
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1) }
    }
    case 'LOAD': {
      return { past: [], present: action.account, future: [] }
    }
    default:
      return state
  }
}

const YES_NO = [
  { value: '', label: '—' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
]

const DEST_TYPES = ['Extension', 'Hunt group', 'Queue', 'Voicemail', 'IVR', 'Cell', 'Other']
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

// ── Main component ────────────────────────────────────────────────────────────
export default function AccountCallFlow({ accountId, onBack, embedded = false }) {
  const [state, dispatch] = useReducer(
    historyReducer,
    null,
    () => ({ past: [], present: getAccount(accountId), future: [] }),
  )
  const account = state.present
  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  const [activeRouteId, setActiveRouteId] = useState(() => getAccount(accountId)?.routes?.[0]?.id || null)
  const [activeSection, setActiveSection] = useState(null) // which panel to show
  const [copyNote, setCopyNote] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [diagramExpanded, setDiagramExpanded] = useState(false)
  const templateNameRef = useRef('')
  const templateDescRef = useRef('')

  // Reload when accountId changes
  useEffect(() => {
    const loaded = getAccount(accountId)
    dispatch({ type: 'LOAD', account: loaded })
    setActiveRouteId(loaded?.routes?.[0]?.id || null)
    setActiveSection(null)
  }, [accountId])

  useEffect(() => {
    if (!copyNote) return undefined
    const t = setTimeout(() => setCopyNote(null), 2500)
    return () => clearTimeout(t)
  }, [copyNote])

  useEffect(() => {
    if (!savedFlash) return undefined
    const t = setTimeout(() => setSavedFlash(false), 2000)
    return () => clearTimeout(t)
  }, [savedFlash])

  const routes = account ? normalizeAccountRoutes(account) : []
  const activeRoute = routes.find(r => r.id === activeRouteId) || routes[0] || null
  const flow = activeRoute ? mergeCallFlowPayload(activeRoute) : mergeCallFlowPayload({})

  const diagramDesign = useMemo(
    () => (activeRoute ? routeToDiagramDesign(activeRoute) : mergeCallFlowPayload({})),
    [activeRoute],
  )

  // Keep activeRouteId in sync when routes change
  useEffect(() => {
    if (!routes.length) return
    if (!routes.some(r => r.id === activeRouteId)) {
      setActiveRouteId(routes[0].id)
    }
  }, [routes, activeRouteId])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
        return
      }
      if (mod && (e.key === 'Z' || (e.key === 'y' && e.ctrlKey))) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      if (mod && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      if (!inInput && e.key === '?') {
        setShowShortcuts(s => !s)
        return
      }
      if (e.key === 'Escape') {
        setShowTemplates(false)
        setShowShortcuts(false)
        setShowSaveTemplate(false)
        setDiagramExpanded(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // no deps — handleSave needs current state

  // ── Patch helpers ─────────────────────────────────────────────────────────
  function patchAccount(updater) {
    dispatch({ type: 'PATCH', updater })
  }

  function withRoutes(updater) {
    patchAccount(prev => {
      const list = normalizeAccountRoutes(prev)
      const nextRoutes = updater(list)
      return { ...prev, routes: nextRoutes }
    })
  }

  function patchMeta(partial) {
    patchAccount(prev => ({ ...prev, ...partial }))
  }

  function patchActiveRoute(partial) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => r.id === activeRoute.id ? { ...r, ...partial } : r))
  }

  function patchFlow(section, key, value) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      return { ...r, ...merged, [section]: { ...merged[section], [key]: value } }
    }))
  }

  function patchMainNumber(index, key, value) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      const rows = [...(merged.mainNumbers || [])]
      while (rows.length <= index) rows.push({ id: makeId(), number: '', label: '' })
      rows[index] = { ...rows[index], [key]: value }
      return { ...r, ...merged, mainNumbers: rows }
    }))
  }

  // ── Route management ──────────────────────────────────────────────────────
  function addMainNumber() {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      return { ...r, ...merged, mainNumbers: [...(merged.mainNumbers || []), { id: makeId(), number: '', label: '' }] }
    }))
  }

  function removeMainNumber(index) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      const rows = [...(merged.mainNumbers || [])]
      rows.splice(index, 1)
      return { ...r, ...merged, mainNumbers: rows }
    }))
  }

  function addRoute() {
    const route = createEmptyRoute({ name: `Route ${routes.length + 1}` })
    withRoutes(list => [...list, route])
    setActiveRouteId(route.id)
  }

  function duplicateRoute() {
    if (!activeRoute) return
    const copy = createEmptyRoute({
      ...mergeCallFlowPayload(activeRoute),
      name: `${activeRoute.name || 'Route'} (copy)`,
    })
    withRoutes(list => [...list, copy])
    setActiveRouteId(copy.id)
  }

  function deleteRoute() {
    if (routes.length <= 1) {
      setCopyNote({ type: 'error', text: 'Keep at least one call route on the account.' })
      return
    }
    if (!confirm(`Delete route "${activeRoute?.name || 'this route'}"?`)) return
    const remaining = routes.filter(r => r.id !== activeRoute.id)
    withRoutes(() => remaining)
    setActiveRouteId(remaining[0]?.id || null)
  }

  function handleApplyTemplate(template) {
    if (!activeRoute) return
    withRoutes(list => list.map(r =>
      r.id === activeRoute.id ? applyTemplate(template, r) : r,
    ))
    setShowTemplates(false)
    setCopyNote({ type: 'ok', text: `Template "${template.name}" applied.` })
  }

  function handleSaveTemplate() {
    const name = templateNameRef.current?.value?.trim()
    if (!name) return
    const design = mergeCallFlowPayload(activeRoute || {})
    saveAsTemplate(name, templateDescRef.current?.value?.trim() || '', design)
    setShowSaveTemplate(false)
    setCopyNote({ type: 'ok', text: `Template "${name}" saved.` })
  }

  // ── Save / export ─────────────────────────────────────────────────────────
  function handleSave() {
    if (!account) return
    const next = saveAccount({ ...account, routes: normalizeAccountRoutes(account) })
    dispatch({ type: 'LOAD', account: next })
    if (!next.routes.some(r => r.id === activeRouteId)) {
      setActiveRouteId(next.routes[0]?.id || null)
    }
    setSavedFlash(true)
  }

  async function handleCopySummary() {
    const text = callFlowSummary(account)
    try {
      await navigator.clipboard.writeText(text)
      setCopyNote({
        type: 'ok',
        text: FEATURES.haloIntegration
          ? 'Copied — paste into Halo KB or a ticket note.'
          : 'Copied — paste into a note or runbook.',
      })
    } catch {
      setCopyNote({ type: 'error', text: 'Could not copy. Try the plain-text summary below.' })
    }
  }

  function handleExport() {
    try {
      exportAccountFile(account.id)
      setCopyNote({ type: 'ok', text: 'Account file exported.' })
    } catch (err) {
      console.error(err)
      setCopyNote({ type: 'error', text: 'Export failed.' })
    }
  }

  function handleShareCustomer() {
    try {
      exportCustomerFlowReview(account)
      setCopyNote({ type: 'ok', text: 'Customer review HTML downloaded — email it or Print → PDF.' })
    } catch (err) {
      console.error(err)
      setCopyNote({ type: 'error', text: 'Could not build customer review.' })
    }
  }

  async function handlePdf() {
    try {
      await exportCallFlowPdf(account)
      setCopyNote({ type: 'ok', text: 'PDF downloaded.' })
    } catch (err) {
      console.error(err)
      setCopyNote({ type: 'error', text: 'PDF export failed.' })
    }
  }

  if (!account) {
    return (
      <section className="account-call-flow">
        <p className="empty-hint-action">Account not found.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>Back to accounts</button>
      </section>
    )
  }

  const mainRows = flow.mainNumbers?.length
    ? flow.mainNumbers
    : [{ id: 'placeholder', number: '', label: '' }]

  return (
    <section className={`account-call-flow${embedded ? ' is-embedded' : ''}`}>

      {/* ── Top bar ── */}
      {!embedded && (
        <div className="design-hero hero-grid acf-hero">
          <div>
            <div className="survey-kicker">Call flows</div>
            <h1>{account.name || 'Untitled account'}</h1>
            <p>
              {account.site || 'Site TBD'}
              {FEATURES.haloIntegration && account.haloClientId ? ` · Halo ${account.haloClientId}` : ''}
              {` · ${routes.length} route${routes.length === 1 ? '' : 's'}`}
            </p>
            <small className="job-updated">
              Last updated {account.updatedAt ? new Date(account.updatedAt).toLocaleString() : '—'}
              {account.updatedBy ? ` · ${account.updatedBy}` : ''}
              {savedFlash ? ' · ✓ Saved' : ''}
            </small>
          </div>
          <div className="survey-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>Accounts</button>
            <button type="button" className="btn btn-secondary" onClick={handleCopySummary}>Copy summary</button>
            <button type="button" className="btn btn-secondary" onClick={handleShareCustomer}>Customer review</button>
            <button type="button" className="btn btn-secondary" onClick={handlePdf}>Download PDF</button>
            <button type="button" className="btn btn-secondary" onClick={handleExport}>Export</button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="account-flow-embedded-actions survey-actions">
          <button type="button" className="btn btn-secondary" onClick={handleCopySummary}>Copy summary</button>
          <button type="button" className="btn btn-secondary" onClick={handlePdf}>PDF</button>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>Export</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
          {savedFlash && <small className="job-updated">Saved</small>}
        </div>
      )}

      {copyNote && (
        <div className={copyNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {copyNote.text}
        </div>
      )}

      {/* ── Route tabs + controls ── */}
      <div className="route-tabs-bar acf-tabs-bar">
        <div className="route-tabs" role="tablist" aria-label="Call routes">
          {routes.map(route => (
            <button
              key={route.id}
              type="button"
              role="tab"
              aria-selected={route.id === activeRoute?.id}
              className={`route-tab${route.id === activeRoute?.id ? ' is-active' : ''}`}
              onClick={() => { setActiveRouteId(route.id); setActiveSection(null) }}
            >
              {route.name || 'Untitled route'}
            </button>
          ))}
        </div>
        <div className="acf-tab-controls">
          <button type="button" className="btn btn-secondary acf-icon-btn" title="Undo (⌘Z)" onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo}>↩</button>
          <button type="button" className="btn btn-secondary acf-icon-btn" title="Redo (⌘⇧Z)" onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo}>↪</button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowTemplates(true)}>Templates</button>
          <button type="button" className="btn btn-secondary" onClick={addRoute}>+ Route</button>
          <button type="button" className="btn btn-secondary" onClick={duplicateRoute}>Duplicate</button>
          <button type="button" className="btn btn-danger" onClick={deleteRoute} disabled={routes.length <= 1}>Delete</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      {/* ── Main 2-column layout ── */}
      <div className="acf-layout">

        {/* Left — diagram */}
        <div className="acf-diagram-col">
          <div className="acf-diagram-wrap">
            <CallFlowDiagram
              design={diagramDesign}
              compact
              onGoToSection={(key) => setActiveSection(key)}
            />
            <button
              type="button"
              className="acf-diagram-expand-btn"
              title="Expand diagram (Esc to close)"
              onClick={() => setDiagramExpanded(true)}
            >
              ⛶
            </button>
          </div>
          <details className="account-summary-preview" style={{ marginTop: 12 }}>
            <summary>Plain-text summary — all routes</summary>
            <pre className="account-summary-pre">{callFlowSummary(account)}</pre>
          </details>
        </div>

        {/* Fullscreen diagram overlay */}
        {diagramExpanded && createPortal(
          <div className="acf-diagram-fullscreen" role="dialog" aria-modal="true">
            <div className="acf-diagram-fullscreen-header">
              <span className="acf-diagram-fullscreen-title">
                {account?.name || 'Call Flow'} — {activeRoute?.name || 'Main route'}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDiagramExpanded(false)}
              >
                ✕ Close
              </button>
            </div>
            <div className="acf-diagram-fullscreen-body">
              <CallFlowDiagram
                design={diagramDesign}
                compact
                onGoToSection={(key) => { setActiveSection(key); setDiagramExpanded(false) }}
              />
            </div>
          </div>,
          document.body,
        )}

        {/* Right — contextual edit panel */}
        <div className="acf-panel-col">
          {!activeSection ? (
            <NullPanel onSelectSection={setActiveSection} />
          ) : activeSection === 'account' ? (
            <AccountPanel
              account={account}
              activeRoute={activeRoute}
              patchMeta={patchMeta}
              patchActiveRoute={patchActiveRoute}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'numbers' ? (
            <NumbersPanel
              mainRows={mainRows}
              patchMainNumber={patchMainNumber}
              addMainNumber={addMainNumber}
              removeMainNumber={removeMainNumber}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'hours' ? (
            <HoursPanel
              hours={flow.hours}
              patchFlow={patchFlow}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'aa' ? (
            <AAPanel
              aa={flow.autoAttendant}
              patchFlow={patchFlow}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'night' ? (
            <NightPanel
              night={flow.nightButton}
              callFlow={flow.callFlow}
              patchFlow={patchFlow}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'daytime' ? (
            <DaytimePanel
              callFlow={flow.callFlow}
              patchFlow={patchFlow}
              onClose={() => setActiveSection(null)}
            />
          ) : activeSection === 'voicemail' ? (
            <VoicemailPanel
              voicemail={flow.voicemail}
              account={account}
              patchFlow={patchFlow}
              patchMeta={patchMeta}
              onClose={() => setActiveSection(null)}
            />
          ) : null}

          {/* Section nav */}
          <div className="acf-section-nav">
            {[
              { key: 'account', label: '⚙ Account' },
              { key: 'numbers', label: '# Numbers' },
              { key: 'hours', label: '🕐 Hours' },
              { key: 'aa', label: '☰ Auto attendant' },
              { key: 'night', label: '🌙 Night / after hours' },
              { key: 'daytime', label: '↝ Routing notes' },
              { key: 'voicemail', label: '✉ Voicemail' },
            ].map(s => (
              <button
                key={s.key}
                type="button"
                className={`acf-section-btn${activeSection === s.key ? ' is-active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Templates modal ── */}
      {showTemplates && (
        <TemplatesModal
          templates={getAllTemplates()}
          onApply={handleApplyTemplate}
          onSaveThis={() => { setShowTemplates(false); setShowSaveTemplate(true) }}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* ── Save as template modal ── */}
      {showSaveTemplate && (
        <div className="section-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowSaveTemplate(false) }}>
          <div className="section-modal" role="dialog" aria-modal="true">
            <div className="section-modal-head">
              <div><div className="survey-kicker">Templates</div><h2>Save current route as template</h2></div>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSaveTemplate(false)}>Cancel</button>
            </div>
            <div className="section-modal-body" style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
              <label className="field">
                <span>Template name</span>
                <input ref={templateNameRef} placeholder="e.g. Standard office" autoFocus />
              </label>
              <label className="field">
                <span>Description (optional)</span>
                <input ref={templateDescRef} placeholder="Short description for the list" />
              </label>
              <button type="button" className="btn btn-primary" onClick={handleSaveTemplate}>Save template</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Keyboard shortcuts cheat sheet ── */}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </section>
  )
}

// ── Section panels ────────────────────────────────────────────────────────────

function PanelWrap({ title, kicker, onClose, children }) {
  return (
    <div className="acf-panel">
      <div className="acf-panel-head">
        <div>
          {kicker && <div className="survey-kicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        <button type="button" className="btn btn-secondary acf-icon-btn" onClick={onClose} title="Close panel">✕</button>
      </div>
      <div className="acf-panel-body">
        {children}
      </div>
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <label className="acf-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function NullPanel({ onSelectSection }) {
  return (
    <div className="acf-panel acf-panel-null">
      <p className="acf-null-hint">Click any node on the diagram to edit that section, or pick one below.</p>
      <div className="acf-null-buttons">
        {[
          { key: 'numbers', label: 'Phone numbers' },
          { key: 'hours', label: 'Hours' },
          { key: 'aa', label: 'Auto attendant' },
          { key: 'night', label: 'After hours' },
        ].map(s => (
          <button key={s.key} type="button" className="btn btn-secondary" onClick={() => onSelectSection(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AccountPanel({ account, activeRoute, patchMeta, patchActiveRoute, onClose }) {
  return (
    <PanelWrap title="Account identity" kicker="Identity" onClose={onClose}>
      <FieldRow label="Customer">
        <input value={account.name || ''} onChange={e => patchMeta({ name: e.target.value })} />
      </FieldRow>
      <FieldRow label="Site">
        <input value={account.site || ''} onChange={e => patchMeta({ site: e.target.value })} />
      </FieldRow>
      {FEATURES.haloIntegration && (
        <FieldRow label="Halo client ID">
          <input value={account.haloClientId || ''} onChange={e => patchMeta({ haloClientId: e.target.value })} />
        </FieldRow>
      )}
      <FieldRow label="Account number">
        <input value={account.accountNumber || ''} onChange={e => patchMeta({ accountNumber: e.target.value })} />
      </FieldRow>
      <FieldRow label="Support email">
        <input type="email" value={account.supportEmail || ''} onChange={e => patchMeta({ supportEmail: e.target.value })} placeholder="support@yourcompany.com" />
      </FieldRow>
      <FieldRow label="Updated by">
        <input value={account.updatedBy || ''} onChange={e => patchMeta({ updatedBy: e.target.value })} placeholder="Your name" />
      </FieldRow>
      <FieldRow label="Route name">
        <input
          value={activeRoute?.name || ''}
          onChange={e => patchActiveRoute({ name: e.target.value })}
          placeholder="Main AA / Sales DID"
        />
      </FieldRow>
      <FieldRow label="Account-wide exceptions">
        <textarea
          rows={3}
          value={account.exceptions || ''}
          onChange={e => patchMeta({ exceptions: e.target.value })}
          placeholder="Cross-route notes: VIP DIDs, holiday paths…"
        />
      </FieldRow>
    </PanelWrap>
  )
}

function NumbersPanel({ mainRows, patchMainNumber, addMainNumber, removeMainNumber, onClose }) {
  return (
    <PanelWrap title="Phone numbers" kicker="Entry" onClose={onClose}>
      {mainRows.map((row, i) => (
        <div key={row.id || i} className="acf-number-row">
          <FieldRow label="Number">
            <input
              value={row.number || ''}
              onChange={e => patchMainNumber(i, 'number', e.target.value)}
              placeholder="555-0100"
            />
          </FieldRow>
          <FieldRow label="Label">
            <div className="acf-row-with-btn">
              <input
                value={row.label || ''}
                onChange={e => patchMainNumber(i, 'label', e.target.value)}
                placeholder="Main / Sales"
              />
              {mainRows.length > 1 && row.id !== 'placeholder' && (
                <button type="button" className="btn btn-secondary" onClick={() => removeMainNumber(i)}>Remove</button>
              )}
            </div>
          </FieldRow>
        </div>
      ))}
      <button type="button" className="btn btn-secondary acf-add-btn" onClick={addMainNumber}>+ Add number</button>
    </PanelWrap>
  )
}

function HoursPanel({ hours, patchFlow, onClose }) {
  return (
    <PanelWrap title="Business hours" kicker="Schedule" onClose={onClose}>
      <div className="acf-two-col">
        <FieldRow label="Weekday open">
          <input value={hours.weekdayOpen || ''} onChange={e => patchFlow('hours', 'weekdayOpen', e.target.value)} placeholder="8:00 AM" />
        </FieldRow>
        <FieldRow label="Weekday close">
          <input value={hours.weekdayClose || ''} onChange={e => patchFlow('hours', 'weekdayClose', e.target.value)} placeholder="5:00 PM" />
        </FieldRow>
        <FieldRow label="Saturday open">
          <input value={hours.saturdayOpen || ''} onChange={e => patchFlow('hours', 'saturdayOpen', e.target.value)} placeholder="Optional" />
        </FieldRow>
        <FieldRow label="Saturday close">
          <input value={hours.saturdayClose || ''} onChange={e => patchFlow('hours', 'saturdayClose', e.target.value)} placeholder="Optional" />
        </FieldRow>
      </div>
      <FieldRow label="Timezone">
        <input value={hours.timezone || ''} onChange={e => patchFlow('hours', 'timezone', e.target.value)} placeholder="America/Chicago" />
      </FieldRow>
      <FieldRow label="Notes">
        <textarea rows={2} value={hours.notes || ''} onChange={e => patchFlow('hours', 'notes', e.target.value)} />
      </FieldRow>
    </PanelWrap>
  )
}

function AAPanel({ aa, patchFlow, onClose }) {
  const usedDigits = DIGITS.filter(d => String(aa[`option${d}`] || '').trim())
  const availDigits = DIGITS.filter(d => !String(aa[`option${d}`] || '').trim())
  const [addDigit, setAddDigit] = useState(availDigits[0] || '0')

  const displayDigits = [...usedDigits]
  // Include addDigit row if actively being added
  const [adding, setAdding] = useState(false)

  function removeOption(digit) {
    patchFlow('autoAttendant', `option${digit}`, '')
    patchFlow('autoAttendant', `optionType${digit}`, '')
  }

  function startAdd() {
    const next = DIGITS.find(d => !String(aa[`option${d}`] || '').trim())
    if (next !== undefined) {
      setAddDigit(next)
      setAdding(true)
    }
  }

  return (
    <PanelWrap title="Auto attendant" kicker="Menu" onClose={onClose}>
      <FieldRow label="Enabled">
        <select value={aa.enabled || ''} onChange={e => patchFlow('autoAttendant', 'enabled', e.target.value)}>
          {YES_NO.map(o => <option key={o.value || 'blank'} value={o.value}>{o.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Greeting">
        <textarea
          rows={3}
          value={aa.greeting || ''}
          onChange={e => patchFlow('autoAttendant', 'greeting', e.target.value)}
          placeholder="Thank you for calling…"
        />
      </FieldRow>

      <div className="acf-aa-section-label">Menu options</div>
      {displayDigits.length === 0 && !adding && (
        <p className="acf-hint">No options set. Add one below.</p>
      )}
      {displayDigits.map(digit => (
        <AAOptionRow
          key={digit}
          digit={digit}
          value={aa[`option${digit}`] || ''}
          destType={aa[`optionType${digit}`] || ''}
          onChangeValue={v => patchFlow('autoAttendant', `option${digit}`, v)}
          onChangeType={t => patchFlow('autoAttendant', `optionType${digit}`, t)}
          onRemove={() => removeOption(digit)}
        />
      ))}
      {adding && (
        <AddOptionRow
          digit={addDigit}
          availDigits={DIGITS.filter(d => !String(aa[`option${d}`] || '').trim())}
          onChangeDigit={setAddDigit}
          onConfirm={(d, type, value) => {
            patchFlow('autoAttendant', `option${d}`, value)
            patchFlow('autoAttendant', `optionType${d}`, type)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {availDigits.length > 0 && !adding && (
        <button type="button" className="btn btn-secondary acf-add-btn" onClick={startAdd}>
          + Add option
        </button>
      )}

      <FieldRow label="Timeout action">
        <input
          value={aa.timeoutAction || ''}
          onChange={e => patchFlow('autoAttendant', 'timeoutAction', e.target.value)}
          placeholder="Repeat menu / voicemail…"
        />
      </FieldRow>
    </PanelWrap>
  )
}

function AAOptionRow({ digit, value, destType, onChangeValue, onChangeType, onRemove }) {
  return (
    <div className="acf-aa-row">
      <div className="acf-digit-badge">{digit}</div>
      <select value={destType} onChange={e => onChangeType(e.target.value)} className="acf-type-select">
        <option value="">Type</option>
        {DEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        className="acf-aa-value"
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        placeholder={`Press ${digit} destination`}
      />
      <button type="button" className="acf-remove-btn" onClick={onRemove} title="Remove option">×</button>
    </div>
  )
}

function AddOptionRow({ digit, availDigits, onChangeDigit, onConfirm, onCancel }) {
  const [localDigit, setLocalDigit] = useState(digit)
  const [localType, setLocalType] = useState('')
  const [localValue, setLocalValue] = useState('')

  return (
    <div className="acf-aa-row acf-aa-row-adding">
      <select value={localDigit} onChange={e => { setLocalDigit(e.target.value); onChangeDigit(e.target.value) }} className="acf-digit-select">
        {availDigits.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={localType} onChange={e => setLocalType(e.target.value)} className="acf-type-select">
        <option value="">Type</option>
        {DEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        className="acf-aa-value"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        placeholder="Destination"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') onConfirm(localDigit, localType, localValue)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button type="button" className="btn btn-primary acf-confirm-btn" onClick={() => onConfirm(localDigit, localType, localValue)}>Add</button>
      <button type="button" className="acf-remove-btn" onClick={onCancel}>×</button>
    </div>
  )
}

function NightPanel({ night, callFlow, patchFlow, onClose }) {
  return (
    <PanelWrap title="Night / after hours" kicker="Closed" onClose={onClose}>
      <FieldRow label="Night button">
        <select value={night.enabled || ''} onChange={e => patchFlow('nightButton', 'enabled', e.target.value)}>
          {YES_NO.map(o => <option key={o.value || 'blank'} value={o.value}>{o.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Phone / extension with night button">
        <input value={night.whoUses || ''} onChange={e => patchFlow('nightButton', 'whoUses', e.target.value)} placeholder="Front desk / Ext 100" />
      </FieldRow>
      <FieldRow label="Night destination">
        <input value={night.destination || ''} onChange={e => patchFlow('nightButton', 'destination', e.target.value)} placeholder="Night AA / on-call / mailbox" />
      </FieldRow>
      <FieldRow label="After-hours path">
        <textarea rows={2} value={callFlow.afterHoursPath || ''} onChange={e => patchFlow('callFlow', 'afterHoursPath', e.target.value)} />
      </FieldRow>
    </PanelWrap>
  )
}

function DaytimePanel({ callFlow, patchFlow, onClose }) {
  return (
    <PanelWrap title="Routing notes" kicker="Day path" onClose={onClose}>
      <FieldRow label="Daytime path">
        <textarea rows={2} value={callFlow.daytimePath || ''} onChange={e => patchFlow('callFlow', 'daytimePath', e.target.value)} />
      </FieldRow>
      <FieldRow label="Ring groups">
        <textarea rows={2} value={callFlow.ringGroups || ''} onChange={e => patchFlow('callFlow', 'ringGroups', e.target.value)} />
      </FieldRow>
      <FieldRow label="Queues">
        <textarea rows={2} value={callFlow.queues || ''} onChange={e => patchFlow('callFlow', 'queues', e.target.value)} />
      </FieldRow>
      <FieldRow label="Failover">
        <textarea rows={2} value={callFlow.failover || ''} onChange={e => patchFlow('callFlow', 'failover', e.target.value)} />
      </FieldRow>
    </PanelWrap>
  )
}

function VoicemailPanel({ voicemail, account, patchFlow, patchMeta, onClose }) {
  return (
    <PanelWrap title="Voicemail" kicker="VM" onClose={onClose}>
      <FieldRow label="Voicemail needed">
        <select value={voicemail.needed || ''} onChange={e => patchFlow('voicemail', 'needed', e.target.value)}>
          {YES_NO.map(o => <option key={o.value || 'blank'} value={o.value}>{o.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="General mailbox">
        <input value={voicemail.generalMailbox || ''} onChange={e => patchFlow('voicemail', 'generalMailbox', e.target.value)} />
      </FieldRow>
      <FieldRow label="Per-user voicemail">
        <select value={voicemail.perUser || ''} onChange={e => patchFlow('voicemail', 'perUser', e.target.value)}>
          {YES_NO.map(o => <option key={o.value || 'blank'} value={o.value}>{o.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Email notification">
        <input value={voicemail.emailNotification || ''} onChange={e => patchFlow('voicemail', 'emailNotification', e.target.value)} placeholder="email@example.com" />
      </FieldRow>
    </PanelWrap>
  )
}

// ── Templates modal ───────────────────────────────────────────────────────────
function TemplatesModal({ templates, onApply, onSaveThis, onClose }) {
  return (
    <div className="section-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="section-modal" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <div className="section-modal-head">
          <div>
            <div className="survey-kicker">Templates</div>
            <h2 id="templates-title">Call flow templates</h2>
            <p>Apply a template to prefill this route, then customise the details.</p>
          </div>
          <div className="section-modal-nav">
            <button type="button" className="btn btn-secondary" onClick={onSaveThis}>Save current as template</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="section-modal-body">
          <div className="acf-template-grid">
            {templates.map(t => (
              <button key={t.id} type="button" className="acf-template-card" onClick={() => onApply(t)}>
                <div className="acf-template-icon">{t.icon || '📋'}</div>
                <div className="acf-template-name">{t.name}</div>
                {t.description && <div className="acf-template-desc">{t.description}</div>}
                {t.custom && <div className="acf-template-badge">Custom</div>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shortcuts modal ───────────────────────────────────────────────────────────
function ShortcutsModal({ onClose }) {
  const shortcuts = [
    ['⌘ Z', 'Undo'],
    ['⌘ ⇧ Z', 'Redo'],
    ['⌘ S', 'Save'],
    ['?', 'Toggle shortcuts'],
    ['Esc', 'Close panels / overlays'],
    ['← / →  (in diagram)', 'Prev / next step'],
  ]
  return (
    <div className="section-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="section-modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
        <div className="section-modal-head">
          <div><div className="survey-kicker">Help</div><h2>Keyboard shortcuts</h2></div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="section-modal-body" style={{ padding: '16px 20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {shortcuts.map(([key, label]) => (
                <tr key={key}>
                  <td style={{ padding: '7px 12px 7px 0', fontFamily: 'var(--mono)', fontSize: '0.82rem', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{key}</td>
                  <td style={{ padding: '7px 0', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
