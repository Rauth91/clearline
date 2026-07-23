import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  accountHasFlowContent,
  accountRouteCount,
  clearAllAccountData,
  createAccount,
  deleteAccount,
  exportAccountFile,
  importAccountFromFile,
  searchAccounts,
  setActiveAccountId,
} from '../lib/accountModel.js'

const EMPTY_FORM = {
  name: '',
  site: '',
  mainDid: '',
  haloClientId: '',
  accountNumber: '',
}

export default function AccountsHub({ onOpenAccount, refreshKey }) {
  const [query, setQuery] = useState('')
  const accounts = searchAccounts(query)
  const importRef = useRef(null)
  const [importNote, setImportNote] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  void refreshKey

  useEffect(() => {
    if (!showNew) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setShowNew(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNew])

  function openNew() {
    setForm(EMPTY_FORM)
    setShowNew(true)
  }

  function submitNew(e) {
    e?.preventDefault()
    const account = createAccount({
      name: form.name.trim() || 'New account',
      site: form.site.trim(),
      mainDid: form.mainDid.trim(),
      haloClientId: form.haloClientId.trim(),
      accountNumber: form.accountNumber.trim(),
    })
    setShowNew(false)
    setForm(EMPTY_FORM)
    onOpenAccount(account.id)
  }

  function handleDelete(account) {
    const name = account.name || 'this account'
    if (!confirm(`Permanently delete “${name}” and its call-flow chart from this device?\n\nExport the account file first if you need it later.`)) {
      return
    }
    deleteAccount(account.id)
    onOpenAccount(null)
  }

  function handleClearAll() {
    if (!confirm('Erase ALL account call-flow docs from this browser?\n\nExport any account files you still need first.')) {
      return
    }
    if (!confirm('Final confirm: delete every account call-flow on this device?')) return
    clearAllAccountData()
    onOpenAccount(null)
  }

  function handleExport(account) {
    try {
      exportAccountFile(account.id)
      setImportNote({ type: 'ok', text: `Exported call-flow file for “${account.name || 'account'}”.` })
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not export that account file.' })
    }
  }

  async function handleImport(file) {
    if (!file) return
    try {
      const meta = await importAccountFromFile(file)
      setImportNote({ type: 'ok', text: `Imported “${meta.name}”. Opening…` })
      onOpenAccount(meta.id)
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not import that file. Use a ClearLine .clearline-account export.' })
    }
  }

  return (
    <section className="jobs-hub accounts-hub">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Accounts</div>
          <h1>Call flow library</h1>
          <p>
            Living call-flow charts per customer. Open an account when a ticket comes in,
            and update the chart when routing changes.
          </p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>New account</button>
          <button type="button" className="btn btn-secondary" onClick={() => importRef.current?.click()}>
            Import account
          </button>
          {accounts.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleClearAll}>
              Clear all accounts
            </button>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".clearline-account,.json,application/json"
            hidden
            onChange={e => {
              handleImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <p className="jobs-privacy-note">
        <strong>Support docs stay on this device</strong> until you export them.
        Fill Halo client ID now so a later sync can push summaries into Halo KB for AI suggestions.
      </p>

      <label className="field accounts-search">
        <span className="sr-only">Search accounts</span>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, site, DID, or Halo ID…"
        />
      </label>

      {importNote && (
        <div className={importNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {importNote.text}
        </div>
      )}

      {accounts.length === 0 && (
        <div className="empty-hint-action jobs-empty">
          <p>
            {query
              ? 'No accounts match that search.'
              : 'No accounts yet. Create one for a customer with a complex call flow.'}
          </p>
        </div>
      )}

      <div className="jobs-grid">
        {accounts.map(account => {
          const hasFlow = accountHasFlowContent(account.id)
          const routeCount = accountRouteCount(account.id) || account.routeCount || 1
          return (
            <article key={account.id} className="job-card">
              <button
                type="button"
                className="job-card-main"
                onClick={() => {
                  setActiveAccountId(account.id)
                  onOpenAccount(account.id)
                }}
              >
                <div className="survey-kicker">{account.mainDid || account.haloClientId || 'Account'}</div>
                <h2>{account.name || 'Untitled account'}</h2>
                <p>{account.site || 'Site TBD'}</p>
                <div className="job-badges">
                  <span className={hasFlow ? 'job-badge is-done' : 'job-badge'}>
                    {hasFlow ? 'Call flow set' : 'Call flow empty'}
                  </span>
                  <span className="job-badge">
                    {routeCount} route{routeCount === 1 ? '' : 's'}
                  </span>
                  {account.haloClientId && (
                    <span className="job-badge">Halo {account.haloClientId}</span>
                  )}
                </div>
                <small className="job-updated">
                  Updated {account.updatedAt ? new Date(account.updatedAt).toLocaleString() : '—'}
                </small>
              </button>
              <div className="job-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setActiveAccountId(account.id)
                    onOpenAccount(account.id)
                  }}
                >
                  Open
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleExport(account)}>
                  Export
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(account)}>
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {showNew && createPortal(
        <div
          className="section-modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowNew(false)
          }}
        >
          <div
            className="section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-account-title"
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">Accounts</div>
                <h2 id="new-account-title">New account</h2>
                <p>Customer identity for the call-flow chart. Halo ID is optional for now.</p>
              </div>
              <div className="section-modal-nav">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
              </div>
            </div>
            <div className="section-modal-body">
              <form className="new-job-form" onSubmit={submitNew}>
                <label className="field">
                  <span>Customer / company</span>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </label>
                <label className="field">
                  <span>Site name</span>
                  <input
                    value={form.site}
                    onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
                    placeholder="HQ / Building A"
                  />
                </label>
                <label className="field">
                  <span>Main DID</span>
                  <input
                    value={form.mainDid}
                    onChange={e => setForm(f => ({ ...f, mainDid: e.target.value }))}
                    placeholder="555-0100"
                  />
                </label>
                <label className="field">
                  <span>Halo client ID</span>
                  <input
                    value={form.haloClientId}
                    onChange={e => setForm(f => ({ ...f, haloClientId: e.target.value }))}
                    placeholder="Optional — for later KB sync"
                  />
                </label>
                <label className="field">
                  <span>Account number</span>
                  <input
                    value={form.accountNumber}
                    onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary">Create account</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
