import { useEffect, useMemo, useState } from 'react'
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

const YES_NO = [
  { value: '', label: '—' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
]

export default function AccountCallFlow({ accountId, onBack }) {
  const [account, setAccount] = useState(() => getAccount(accountId))
  const [activeRouteId, setActiveRouteId] = useState(() => getAccount(accountId)?.routes?.[0]?.id || null)
  const [copyNote, setCopyNote] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    const next = getAccount(accountId)
    setAccount(next)
    setActiveRouteId(next?.routes?.[0]?.id || null)
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

  useEffect(() => {
    if (!routes.length) return
    if (!routes.some(r => r.id === activeRouteId)) {
      setActiveRouteId(routes[0].id)
    }
  }, [routes, activeRouteId])

  if (!account) {
    return (
      <section className="account-call-flow">
        <p className="empty-hint-action">Account not found.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>Back to accounts</button>
      </section>
    )
  }

  function withRoutes(updater) {
    setAccount(prev => {
      const list = normalizeAccountRoutes(prev)
      const nextRoutes = updater(list)
      return {
        ...prev,
        routes: nextRoutes,
        flow: mergeCallFlowPayload(nextRoutes[0] || createEmptyRoute()),
      }
    })
  }

  function patchMeta(partial) {
    setAccount(prev => ({ ...prev, ...partial }))
  }

  function patchActiveRoute(partial) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => (
      r.id === activeRoute.id ? { ...r, ...partial } : r
    )))
  }

  function patchFlow(section, key, value) {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      return {
        ...r,
        ...merged,
        [section]: {
          ...merged[section],
          [key]: value,
        },
      }
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

  function addMainNumber() {
    if (!activeRoute) return
    withRoutes(list => list.map(r => {
      if (r.id !== activeRoute.id) return r
      const merged = mergeCallFlowPayload(r)
      return {
        ...r,
        ...merged,
        mainNumbers: [...(merged.mainNumbers || []), { id: makeId(), number: '', label: '' }],
      }
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
    if (!confirm(`Delete route “${activeRoute?.name || 'this route'}”?`)) return
    const remaining = routes.filter(r => r.id !== activeRoute.id)
    withRoutes(() => remaining)
    setActiveRouteId(remaining[0]?.id || null)
  }

  function handleSave() {
    const next = saveAccount({
      ...account,
      routes: normalizeAccountRoutes(account),
    })
    setAccount(next)
    if (!next.routes.some(r => r.id === activeRouteId)) {
      setActiveRouteId(next.routes[0]?.id || null)
    }
    setSavedFlash(true)
  }

  async function handleCopySummary() {
    const text = callFlowSummary(account)
    try {
      await navigator.clipboard.writeText(text)
      setCopyNote({ type: 'ok', text: 'All routes copied — paste into Halo KB or a ticket note.' })
    } catch {
      setCopyNote({ type: 'error', text: 'Could not copy. Expand the summary below and copy manually.' })
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

  const mainRows = flow.mainNumbers?.length
    ? flow.mainNumbers
    : [{ id: 'placeholder', number: '', label: '' }]

  return (
    <section className="account-call-flow">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Account call flows</div>
          <h1>{account.name || 'Untitled account'}</h1>
          <p>
            {account.site || 'Site TBD'}
            {account.haloClientId ? ` · Halo ${account.haloClientId}` : ''}
            {` · ${routes.length} route${routes.length === 1 ? '' : 's'}`}
          </p>
          <small className="job-updated">
            Last updated {account.updatedAt ? new Date(account.updatedAt).toLocaleString() : '—'}
            {account.updatedBy ? ` · ${account.updatedBy}` : ''}
            {savedFlash ? ' · Saved' : ''}
          </small>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack}>Accounts</button>
          <button type="button" className="btn btn-secondary" onClick={handleCopySummary}>
            Copy summary
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleShareCustomer}>
            Share with customer
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            Export
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      {copyNote && (
        <div className={copyNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {copyNote.text}
        </div>
      )}

      <div className="route-tabs-bar">
        <div className="route-tabs" role="tablist" aria-label="Call routes">
          {routes.map(route => (
            <button
              key={route.id}
              type="button"
              role="tab"
              aria-selected={route.id === activeRoute?.id}
              className={`route-tab${route.id === activeRoute?.id ? ' is-active' : ''}`}
              onClick={() => setActiveRouteId(route.id)}
            >
              {route.name || 'Untitled route'}
            </button>
          ))}
        </div>
        <div className="route-tab-actions">
          <button type="button" className="btn btn-secondary" onClick={addRoute}>Add route</button>
          <button type="button" className="btn btn-secondary" onClick={duplicateRoute}>Duplicate</button>
          <button type="button" className="btn btn-danger" onClick={deleteRoute} disabled={routes.length <= 1}>
            Delete route
          </button>
        </div>
      </div>

      <div className="account-flow-layout">
        <div className="account-flow-form panel">
          <div className="panel-head">
            <div className="survey-kicker">Identity</div>
            <h2>Account</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Customer</span>
              <input
                value={account.name}
                onChange={e => patchMeta({ name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Site</span>
              <input
                value={account.site}
                onChange={e => patchMeta({ site: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Halo client ID</span>
              <input
                value={account.haloClientId}
                onChange={e => patchMeta({ haloClientId: e.target.value })}
                placeholder="For later KB sync"
              />
            </label>
            <label className="field">
              <span>Account number</span>
              <input
                value={account.accountNumber}
                onChange={e => patchMeta({ accountNumber: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Updated by</span>
              <input
                value={account.updatedBy}
                onChange={e => patchMeta({ updatedBy: e.target.value })}
                placeholder="Your name"
              />
            </label>
          </div>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">This route</div>
            <h2>{activeRoute?.name || 'Call route'}</h2>
            <p className="route-hint">
              Each route is its own chart — separate DIDs, auto attendant, and after-hours path.
              Add a route for every distinct call path (Main AA, Sales DID, Fax, etc.).
            </p>
          </div>
          <div className="form-grid">
            <label className="field field-span">
              <span>Route name</span>
              <input
                value={activeRoute?.name || ''}
                onChange={e => patchActiveRoute({ name: e.target.value })}
                placeholder="Main AA / Sales DID / After-hours"
              />
            </label>
          </div>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">Entry</div>
            <h2>Numbers for this route</h2>
          </div>
          {mainRows.map((row, i) => (
            <div key={row.id || i} className="form-grid form-grid-2 route-number-row">
              <label className="field">
                <span>Number</span>
                <input
                  value={row.number || ''}
                  onChange={e => patchMainNumber(i, 'number', e.target.value)}
                  placeholder="555-0100"
                />
              </label>
              <label className="field">
                <span>Label</span>
                <div className="route-number-label-row">
                  <input
                    value={row.label || ''}
                    onChange={e => patchMainNumber(i, 'label', e.target.value)}
                    placeholder="Main / Sales / Overflow"
                  />
                  {mainRows.length > 1 && row.id !== 'placeholder' && (
                    <button type="button" className="btn btn-secondary" onClick={() => removeMainNumber(i)}>
                      Remove
                    </button>
                  )}
                </div>
              </label>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addMainNumber}>
            Add number
          </button>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">Schedule</div>
            <h2>Hours</h2>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Weekday open</span>
              <input
                value={flow.hours.weekdayOpen}
                onChange={e => patchFlow('hours', 'weekdayOpen', e.target.value)}
                placeholder="8:00"
              />
            </label>
            <label className="field">
              <span>Weekday close</span>
              <input
                value={flow.hours.weekdayClose}
                onChange={e => patchFlow('hours', 'weekdayClose', e.target.value)}
                placeholder="17:00"
              />
            </label>
            <label className="field">
              <span>Timezone</span>
              <input
                value={flow.hours.timezone}
                onChange={e => patchFlow('hours', 'timezone', e.target.value)}
                placeholder="America/Chicago"
              />
            </label>
            <label className="field field-span">
              <span>Hours notes</span>
              <textarea
                rows={2}
                value={flow.hours.notes}
                onChange={e => patchFlow('hours', 'notes', e.target.value)}
              />
            </label>
          </div>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">Menu</div>
            <h2>Auto attendant</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Enabled</span>
              <select
                value={flow.autoAttendant.enabled}
                onChange={e => patchFlow('autoAttendant', 'enabled', e.target.value)}
              >
                {YES_NO.map(o => (
                  <option key={o.value || 'blank'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="field field-span">
              <span>Greeting</span>
              <textarea
                rows={2}
                value={flow.autoAttendant.greeting}
                onChange={e => patchFlow('autoAttendant', 'greeting', e.target.value)}
              />
            </label>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
              <label key={digit} className="field field-span">
                <span>Press {digit}</span>
                <input
                  value={flow.autoAttendant[`option${digit}`]}
                  onChange={e => patchFlow('autoAttendant', `option${digit}`, e.target.value)}
                  placeholder={`Where press ${digit} goes`}
                />
              </label>
            ))}
            <label className="field field-span">
              <span>Timeout action</span>
              <input
                value={flow.autoAttendant.timeoutAction}
                onChange={e => patchFlow('autoAttendant', 'timeoutAction', e.target.value)}
              />
            </label>
          </div>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">Closed</div>
            <h2>Night / after hours</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Night button</span>
              <select
                value={flow.nightButton.enabled}
                onChange={e => patchFlow('nightButton', 'enabled', e.target.value)}
              >
                {YES_NO.map(o => (
                  <option key={o.value || 'blank'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Phone / extension with night button</span>
              <input
                value={flow.nightButton.whoUses}
                onChange={e => patchFlow('nightButton', 'whoUses', e.target.value)}
                placeholder="Front desk Yealink / Ext 100"
              />
            </label>
            <label className="field field-span">
              <span>Night destination</span>
              <input
                value={flow.nightButton.destination}
                onChange={e => patchFlow('nightButton', 'destination', e.target.value)}
                placeholder="Night AA / on-call / mailbox"
              />
            </label>
            <label className="field field-span">
              <span>After-hours path</span>
              <textarea
                rows={2}
                value={flow.callFlow.afterHoursPath}
                onChange={e => patchFlow('callFlow', 'afterHoursPath', e.target.value)}
              />
            </label>
          </div>

          <div className="panel-head" style={{ marginTop: 20 }}>
            <div className="survey-kicker">Routing notes</div>
            <h2>Day path, queues, failover</h2>
          </div>
          <div className="form-grid">
            <label className="field field-span">
              <span>Daytime path</span>
              <textarea
                rows={2}
                value={flow.callFlow.daytimePath}
                onChange={e => patchFlow('callFlow', 'daytimePath', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Ring groups</span>
              <textarea
                rows={2}
                value={flow.callFlow.ringGroups}
                onChange={e => patchFlow('callFlow', 'ringGroups', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Queues</span>
              <textarea
                rows={2}
                value={flow.callFlow.queues}
                onChange={e => patchFlow('callFlow', 'queues', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Failover</span>
              <textarea
                rows={2}
                value={flow.callFlow.failover}
                onChange={e => patchFlow('callFlow', 'failover', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Voicemail needed</span>
              <select
                value={flow.voicemail.needed}
                onChange={e => patchFlow('voicemail', 'needed', e.target.value)}
              >
                {YES_NO.map(o => (
                  <option key={o.value || 'blank'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>General mailbox</span>
              <input
                value={flow.voicemail.generalMailbox}
                onChange={e => patchFlow('voicemail', 'generalMailbox', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Account-wide exceptions</span>
              <textarea
                rows={3}
                value={account.exceptions}
                onChange={e => patchMeta({ exceptions: e.target.value })}
                placeholder="Cross-route notes: VIP DIDs, holiday-only paths, shared overflow…"
              />
            </label>
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Save call flows
            </button>
          </div>
        </div>

        <div className="account-flow-chart">
          <CallFlowDiagram design={diagramDesign} />
          <details className="account-summary-preview">
            <summary>Plain-text summary — all routes (Halo-ready)</summary>
            <pre className="account-summary-pre">{callFlowSummary(account)}</pre>
          </details>
        </div>
      </div>
    </section>
  )
}
