/**
 * CustomerPortal — read-only call flow view for end customers.
 *
 * Accessible at #/portal/:accountId  (no login required — just a direct link).
 * Shows the customer their current call routing and lets them submit a change request.
 * The request is stored locally and shown to the dealer inside AccountDetail.
 *
 * Design goal: clean, professional. No internal tool chrome. Suitable for sharing with a CFO.
 */

import { useEffect, useMemo, useState } from 'react'
import { getAccount } from '../lib/accountModel.js'
import { normalizeAccountRoutes } from '../lib/callFlowShape.js'
import { plainStepsFromDesign } from '../lib/flowMapModel.js'
import { makeId } from '../lib/surveyModel.js'

const CHANGE_TYPES = [
  'Change call routing / flow',
  'Add user to call group / ring group',
  'Add or remove a phone number (DID)',
  'Update auto attendant menu',
  'Update business hours',
  'Update voicemail / greeting',
  'Add or remove a user/extension',
  'Other',
]

/** Persist change requests in localStorage by accountId. */
function loadRequests(accountId) {
  try {
    const raw = localStorage.getItem(`cr_${accountId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRequests(accountId, requests) {
  localStorage.setItem(`cr_${accountId}`, JSON.stringify(requests))
}

function RouteCard({ route, index }) {
  const steps = useMemo(() => plainStepsFromDesign(route), [route])
  const numbers = (route.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())

  return (
    <div className="cp-route-card">
      <div className="cp-route-name">{route.name || `Route ${index + 1}`}</div>

      {numbers.length > 0 && (
        <div className="cp-route-numbers">
          {numbers.map((n, i) => (
            <span key={i} className="cp-route-number">
              {n.number}
              {n.label ? <span className="cp-number-label"> {n.label}</span> : null}
            </span>
          ))}
        </div>
      )}

      {steps.length > 0 ? (
        <ol className="cp-steps">
          {steps.map(s => (
            <li key={s.n} className="cp-step">
              <span className="cp-step-title">{s.title}</span>
              {s.detail && <span className="cp-step-detail">{s.detail}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="cp-empty-route">Routing details not documented yet — contact your provider.</p>
      )}
    </div>
  )
}

function ChangeRequestForm({ accountId, supportEmail, onSubmitted }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    changeType: CHANGE_TYPES[0],
    description: '',
    priority: 'normal',
  })
  const [submitted, setSubmitted] = useState(false)
  const [submittedReq, setSubmittedReq] = useState(null)
  const [error, setError] = useState('')

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Please enter your name.'); return }
    if (!form.description.trim()) { setError('Please describe the change you need.'); return }
    setError('')

    const request = {
      id: makeId(),
      accountId,
      ...form,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    }

    const existing = loadRequests(accountId)
    saveRequests(accountId, [request, ...existing])
    setSubmitted(true)
    setSubmittedReq(request)
    onSubmitted?.(request)
  }

  if (submitted && submittedReq) {
    const emailSubject = encodeURIComponent(`Change request: ${submittedReq.changeType}`)
    const emailBody = encodeURIComponent(
      [
        `Name: ${submittedReq.name}`,
        submittedReq.email ? `Email: ${submittedReq.email}` : null,
        submittedReq.phone ? `Phone: ${submittedReq.phone}` : null,
        `Type: ${submittedReq.changeType}`,
        `Priority: ${submittedReq.priority}`,
        '',
        `Description:\n${submittedReq.description}`,
        '',
        `Submitted: ${new Date(submittedReq.submittedAt).toLocaleString()}`,
      ].filter(l => l !== null).join('\n')
    )
    const mailtoHref = supportEmail
      ? `mailto:${supportEmail}?subject=${emailSubject}&body=${emailBody}`
      : `mailto:?subject=${emailSubject}&body=${emailBody}`

    return (
      <div className="cp-submitted">
        <div className="cp-submitted-icon">&#10003;</div>
        <div className="cp-submitted-title">Request submitted</div>
        <p className="cp-submitted-body">
          Your request has been saved.
          {supportEmail
            ? <> To ensure delivery, send it directly to your provider:</>
            : <> Copy the details below and email them to your provider:</>}
        </p>
        <a
          href={mailtoHref}
          className="cp-btn-primary cp-mailto-btn"
        >
          {supportEmail ? `Email your provider` : 'Open email with request'}
        </a>
        <button
          type="button"
          className="cp-btn-secondary"
          onClick={() => {
            setSubmitted(false)
            setSubmittedReq(null)
            setForm({ name: '', email: '', phone: '', changeType: CHANGE_TYPES[0], description: '', priority: 'normal' })
          }}
        >
          Submit another request
        </button>
      </div>
    )
  }

  return (
    <form className="cp-cr-form" onSubmit={handleSubmit}>
      <div className="cp-cr-form-title">Submit a change request</div>
      <p className="cp-cr-form-sub">
        Describe the change you need and your provider will take care of it.
      </p>

      {error && <div className="cp-form-error">{error}</div>}

      <div className="cp-field-row">
        <label className="cp-field-label" htmlFor="cr-name">Your name *</label>
        <input
          id="cr-name"
          className="cp-input"
          type="text"
          value={form.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
        />
      </div>

      <div className="cp-field-group">
        <div className="cp-field-row">
          <label className="cp-field-label" htmlFor="cr-email">Email</label>
          <input
            id="cr-email"
            className="cp-input"
            type="email"
            value={form.email}
            onChange={e => setField('email', e.target.value)}
            placeholder="jane@company.com"
            autoComplete="email"
          />
        </div>
        <div className="cp-field-row">
          <label className="cp-field-label" htmlFor="cr-phone">Phone</label>
          <input
            id="cr-phone"
            className="cp-input"
            type="tel"
            value={form.phone}
            onChange={e => setField('phone', e.target.value)}
            placeholder="(555) 555-5555"
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="cp-field-row">
        <label className="cp-field-label" htmlFor="cr-type">Type of change</label>
        <select
          id="cr-type"
          className="cp-input cp-select"
          value={form.changeType}
          onChange={e => setField('changeType', e.target.value)}
        >
          {CHANGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="cp-field-row">
        <label className="cp-field-label" htmlFor="cr-desc">
          Describe the change *
        </label>
        <textarea
          id="cr-desc"
          className="cp-input cp-textarea"
          value={form.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="For example: &ldquo;When a caller presses 2, route them to the billing team instead of the front desk.&rdquo;"
          rows={5}
        />
      </div>

      <div className="cp-field-row">
        <label className="cp-field-label">Priority</label>
        <div className="cp-priority-row">
          {[
            { value: 'normal', label: 'Normal' },
            { value: 'urgent', label: 'Urgent' },
          ].map(p => (
            <label key={p.value} className="cp-priority-option">
              <input
                type="radio"
                name="priority"
                value={p.value}
                checked={form.priority === p.value}
                onChange={() => setField('priority', p.value)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" className="cp-btn-primary">Submit request</button>
    </form>
  )
}

export default function CustomerPortal({ accountId }) {
  const [account, setAccount] = useState(() => getAccount(accountId))
  const [requests, setRequests] = useState(() => loadRequests(accountId))

  useEffect(() => {
    setAccount(getAccount(accountId))
    setRequests(loadRequests(accountId))
  }, [accountId])

  const routes = useMemo(() => {
    if (!account) return []
    return normalizeAccountRoutes(account)
  }, [account])

  if (!account) {
    return (
      <div className="cp-root cp-not-found">
        <div className="cp-brand">ClearLine</div>
        <h1>Page not found</h1>
        <p>This link may have expired or the account no longer exists.</p>
      </div>
    )
  }

  return (
    <div className="cp-root">
      {/* Header */}
      <header className="cp-header">
        <div className="cp-header-inner">
          <div className="cp-brand">ClearLine</div>
          <div className="cp-header-account">
            <div className="cp-account-name">{account.name || 'Your account'}</div>
            {account.site && <div className="cp-account-site">{account.site}</div>}
          </div>
        </div>
      </header>

      <main className="cp-main">
        {/* Intro */}
        <section className="cp-intro">
          <h1 className="cp-intro-title">Your call routing</h1>
          <p className="cp-intro-body">
            This page shows how your phone numbers are currently set up. Review your routing below,
            then use the form at the bottom to request any changes.
          </p>
        </section>

        {/* Routes */}
        <section className="cp-section">
          <div className="cp-section-label">Current routing</div>
          {routes.length === 0 ? (
            <p className="cp-empty-route">No routing has been documented yet. Contact your provider.</p>
          ) : (
            <div className="cp-route-list">
              {routes.map((r, i) => <RouteCard key={r.id || i} route={r} index={i} />)}
            </div>
          )}
        </section>

        {/* Change request form */}
        <section className="cp-section">
          <ChangeRequestForm
            accountId={accountId}
            supportEmail={account.supportEmail || ''}
            onSubmitted={(req) => setRequests(r => [req, ...r])}
          />
        </section>

        {/* Past requests (visible to customer too — for transparency) */}
        {requests.length > 0 && (
          <section className="cp-section">
            <div className="cp-section-label">Your previous requests</div>
            <div className="cp-req-list">
              {requests.map(r => (
                <div key={r.id} className="cp-req-item">
                  <div className="cp-req-top">
                    <span className="cp-req-type">{r.changeType}</span>
                    <span className={`cp-req-status cp-req-status-${r.status}`}>{r.status}</span>
                  </div>
                  <div className="cp-req-desc">{r.description}</div>
                  <div className="cp-req-meta">
                    {r.name}{r.email ? ` · ${r.email}` : ''} ·{' '}
                    {new Date(r.submittedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="cp-footer">
        Powered by ClearLine &mdash; VoIP operations console
      </footer>
    </div>
  )
}

/** Dealer-side panel: shows incoming change requests for an account. */
export function ChangeRequestInbox({ accountId }) {
  const [requests, setRequests] = useState(() => loadRequests(accountId))

  function markStatus(id, status) {
    const updated = requests.map(r => r.id === id ? { ...r, status } : r)
    setRequests(updated)
    saveRequests(accountId, updated)
  }

  if (!requests.length) {
    return (
      <div className="cri-empty">
        <p>No change requests from this customer yet.</p>
        <p className="cri-hint">
          Share the portal link with your customer and they can submit requests directly.
        </p>
      </div>
    )
  }

  return (
    <div className="cri-list">
      {requests.map(r => (
        <div key={r.id} className={`cri-item cri-status-${r.status}`}>
          <div className="cri-item-top">
            <span className="cri-type">{r.changeType}</span>
            <span className={`cri-badge cri-badge-${r.status}`}>{r.status}</span>
            {r.priority === 'urgent' && <span className="cri-badge cri-badge-urgent">Urgent</span>}
          </div>
          <div className="cri-desc">{r.description}</div>
          <div className="cri-meta">
            {r.name}
            {r.email ? <> &middot; <a href={`mailto:${r.email}`}>{r.email}</a></> : null}
            {r.phone ? ` · ${r.phone}` : ''}
            {' · '}{new Date(r.submittedAt).toLocaleDateString()}
          </div>
          {r.status === 'pending' && (
            <div className="cri-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => markStatus(r.id, 'in-progress')}
              >
                Start
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => markStatus(r.id, 'complete')}
              >
                Mark complete
              </button>
            </div>
          )}
          {r.status === 'in-progress' && (
            <div className="cri-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => markStatus(r.id, 'complete')}
              >
                Mark complete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
