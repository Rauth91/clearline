/**
 * NsSync — NetSapiens API sync panel for AccountDetail.
 *
 * Lets the tech enter NS host + domain credentials, fetches all routing
 * data via the /api/ns-proxy worker, previews what was found, and imports
 * it into the account's call flow routes on confirmation.
 */

import { useState } from 'react'
import {
  setNsCredentials,
  getNsCredentials,
  clearNsCredentials,
  fetchAllNsData,
  mapNsDataToRoutes,
  summarizeNsFetch,
} from '../lib/nsApi.js'
import { saveAccount } from '../lib/accountModel.js'
import { makeId } from '../lib/surveyModel.js'

const PHASES = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  PREVIEW: 'preview',
  IMPORTING: 'importing',
  DONE: 'done',
  ERROR: 'error',
}

export default function NsSync({ account, onImported }) {
  const saved = getNsCredentials()
  const [form, setForm] = useState({
    host: saved?.host || '',
    domain: saved?.domain || account?.nsDomain || '',
    username: saved?.username || '',
    password: '',
  })
  const [phase, setPhase] = useState(PHASES.IDLE)
  const [nsData, setNsData] = useState(null)
  const [preview, setPreview] = useState(null) // { summary, routes }
  const [error, setError] = useState('')
  const [mergeMode, setMergeMode] = useState('replace') // 'replace' | 'merge'

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleFetch(e) {
    e?.preventDefault()
    if (!form.host || !form.domain || !form.username || !form.password) {
      setError('All fields are required.')
      return
    }

    setPhase(PHASES.FETCHING)
    setError('')
    setNsData(null)
    setPreview(null)

    const creds = {
      host: form.host.trim().replace(/^https?:\/\//, ''),
      domain: form.domain.trim(),
      username: form.username.trim(),
      password: form.password,
    }

    try {
      setNsCredentials(creds)
      const data = await fetchAllNsData(creds)
      const routes = mapNsDataToRoutes(data)
      setNsData(data)
      setPreview({ summary: summarizeNsFetch(data), routes })
      setPhase(PHASES.PREVIEW)
    } catch (err) {
      setError(err.message || 'Failed to fetch from NS.')
      setPhase(PHASES.ERROR)
    }
  }

  async function handleImport() {
    if (!preview || !account) return
    setPhase(PHASES.IMPORTING)

    const newRoutes = preview.routes.map(r => ({
      id: makeId(),
      ...r,
    }))

    let updatedRoutes
    if (mergeMode === 'replace') {
      updatedRoutes = newRoutes
    } else {
      // Merge: append NS routes that don't already exist by name
      const existing = account.routes || []
      const existingNames = new Set(existing.map(r => r.name))
      const toAdd = newRoutes.filter(r => !existingNames.has(r.name))
      updatedRoutes = [...existing, ...toAdd]
    }

    const updated = {
      ...account,
      routes: updatedRoutes,
      nsDomain: form.domain.trim(),
      nsHost: form.host.trim().replace(/^https?:\/\//, ''),
      nsLastSync: new Date().toISOString(),
    }

    saveAccount(updated)
    setPhase(PHASES.DONE)
    onImported?.(updated)
  }

  function handleReset() {
    setPhase(PHASES.IDLE)
    setNsData(null)
    setPreview(null)
    setError('')
  }

  function handleClearCreds() {
    clearNsCredentials()
    setForm(f => ({ ...f, username: '', password: '' }))
  }

  return (
    <div className="ns-sync">
      <div className="ns-sync-header">
        <div className="ns-sync-title">Sync from NetSapiens</div>
        <div className="ns-sync-sub">
          Pull live routing data from your NS domain and import it directly into this account&rsquo;s call flow.
          Credentials are kept in your browser session only — never stored on a server.
        </div>
      </div>

      {phase === PHASES.DONE ? (
        <div className="ns-sync-done">
          <div className="ns-sync-done-icon">&#10003;</div>
          <div className="ns-sync-done-text">
            Call flow imported successfully.{' '}
            {preview?.routes?.length === 1
              ? '1 route was created.'
              : `${preview?.routes?.length ?? 0} routes were created.`}
          </div>
          <div className="ns-sync-done-meta">
            Last synced: {new Date().toLocaleString()}
          </div>
          <div className="ns-sync-actions">
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              Sync again
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Credentials form */}
          <form className="ns-sync-form" onSubmit={handleFetch}>
            <div className="ns-field-row">
              <label className="ns-label" htmlFor="ns-host">NS host</label>
              <input
                id="ns-host"
                className="ns-input"
                type="text"
                placeholder="pbx.yourdomain.com"
                value={form.host}
                onChange={e => setField('host', e.target.value)}
                autoComplete="off"
                disabled={phase === PHASES.FETCHING || phase === PHASES.IMPORTING}
              />
            </div>
            <div className="ns-field-row">
              <label className="ns-label" htmlFor="ns-domain">NS domain</label>
              <input
                id="ns-domain"
                className="ns-input"
                type="text"
                placeholder="yourdomain.com"
                value={form.domain}
                onChange={e => setField('domain', e.target.value)}
                autoComplete="off"
                disabled={phase === PHASES.FETCHING || phase === PHASES.IMPORTING}
              />
            </div>
            <div className="ns-field-row">
              <label className="ns-label" htmlFor="ns-user">Username</label>
              <input
                id="ns-user"
                className="ns-input"
                type="text"
                placeholder="api_user or admin@domain"
                value={form.username}
                onChange={e => setField('username', e.target.value)}
                autoComplete="off"
                disabled={phase === PHASES.FETCHING || phase === PHASES.IMPORTING}
              />
            </div>
            <div className="ns-field-row">
              <label className="ns-label" htmlFor="ns-pass">Password</label>
              <input
                id="ns-pass"
                className="ns-input"
                type="password"
                placeholder="NS API password"
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                autoComplete="current-password"
                disabled={phase === PHASES.FETCHING || phase === PHASES.IMPORTING}
              />
            </div>

            {error && (
              <div className="ns-error">{error}</div>
            )}

            <div className="ns-form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={phase === PHASES.FETCHING || phase === PHASES.IMPORTING}
              >
                {phase === PHASES.FETCHING ? 'Fetching…' : 'Fetch from NS'}
              </button>
              {getNsCredentials() && (
                <button
                  type="button"
                  className="btn btn-ghost ns-clear-creds"
                  onClick={handleClearCreds}
                >
                  Clear saved credentials
                </button>
              )}
            </div>
          </form>

          {/* Preview */}
          {phase === PHASES.PREVIEW && preview && (
            <div className="ns-preview">
              <div className="ns-preview-title">Found in NS domain</div>
              <div className="ns-preview-counts">
                {preview.summary.map(s => (
                  <div key={s.label} className="ns-count-chip">
                    <span className="ns-count-num">{s.count}</span>
                    <span className="ns-count-label">{s.label}</span>
                  </div>
                ))}
              </div>

              <div className="ns-sync-caveat">
                <strong>Note:</strong> This sync captures auto attendants, hunt groups, and timeframes. Per-subscriber answering rules (call forwarding, find-me/follow-me, simultaneous ring) are not imported — configure those manually per extension in NS or on each phone.
              </div>

              <div className="ns-preview-routes-title">Routes to import</div>
              <div className="ns-route-list">
                {preview.routes.map((r, i) => (
                  <div key={i} className="ns-route-item">
                    <div className="ns-route-name">{r.name}</div>
                    <div className="ns-route-meta">
                      {r.mainNumbers?.length
                        ? r.mainNumbers.map(n => n.number || n.label).filter(Boolean).join(', ')
                        : 'No DIDs mapped'}
                      {r.autoAttendant?.enabled === 'Yes' && (
                        <span className="ns-route-badge">Auto attendant</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="ns-merge-row">
                <label className="ns-label">Import mode</label>
                <div className="ns-merge-options">
                  <label className="ns-radio-label">
                    <input
                      type="radio"
                      name="mergeMode"
                      value="replace"
                      checked={mergeMode === 'replace'}
                      onChange={() => setMergeMode('replace')}
                    />
                    Replace existing routes
                  </label>
                  <label className="ns-radio-label">
                    <input
                      type="radio"
                      name="mergeMode"
                      value="merge"
                      checked={mergeMode === 'merge'}
                      onChange={() => setMergeMode('merge')}
                    />
                    Merge with existing routes
                  </label>
                </div>
              </div>

              <div className="ns-preview-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={phase === PHASES.IMPORTING}
                >
                  {phase === PHASES.IMPORTING ? 'Importing…' : 'Import to call flow'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {account?.nsLastSync && phase !== PHASES.DONE && (
        <div className="ns-last-sync">
          Last synced: {new Date(account.nsLastSync).toLocaleString()}
          {account.nsHost && ` from ${account.nsHost}`}
        </div>
      )}
    </div>
  )
}
