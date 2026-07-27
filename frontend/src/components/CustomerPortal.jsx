/**
 * CustomerPortal — customer-facing call flow view + action hub.
 *
 * Accessible at #/portal/:accountId (no login required).
 * Shows the customer their current call routing, lets them request changes,
 * and lets them report call issues with structured call examples.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getAccount } from '../lib/accountModel.js'
import { normalizeAccountRoutes, mergeCallFlowPayload } from '../lib/callFlowShape.js'
import { plainStepsFromDesign } from '../lib/flowMapModel.js'
import { makeId } from '../lib/surveyModel.js'

// ── Storage helpers ──────────────────────────────────────────────────────────

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

// ── Change request types ──────────────────────────────────────────────────────

const CHANGE_TYPES = [
  {
    key: 'forward',
    icon: '→',
    label: 'Forward a number',
    desc: 'Change where a phone number or extension rings',
    fields: [
      { id: 'fromNumber', label: 'Number or extension to change', placeholder: '555-0100 or ext. 205' },
      { id: 'toDestination', label: 'Forward it to', placeholder: 'Mobile 555-0199, voicemail, etc.' },
      { id: 'notes', label: 'Any other details', placeholder: 'Optional', multiline: true },
    ],
  },
  {
    key: 'extension',
    icon: '#',
    label: 'Add or change an extension',
    desc: 'Add a new desk phone or update an existing one',
    fields: [
      { id: 'extNumber', label: 'Extension number', placeholder: '205' },
      { id: 'extName', label: 'Person or department name', placeholder: 'Jane Smith / Front Desk' },
      { id: 'extAction', label: 'What to do', placeholder: 'Add new, remove, or update — describe the change' },
    ],
  },
  {
    key: 'attendant',
    icon: '☎',
    label: 'Update auto attendant',
    desc: 'Change what a menu key does when a caller presses it',
    fields: [
      { id: 'aaKey', label: 'Menu key (digit)', placeholder: '1, 2, 3…' },
      { id: 'aaCurrent', label: 'Currently goes to', placeholder: 'Sales team / ext. 200' },
      { id: 'aaNew', label: 'Should go to instead', placeholder: 'Support queue / mobile 555-0188' },
      { id: 'notes', label: 'Any other details', placeholder: 'Optional', multiline: true },
    ],
  },
  {
    key: 'hours',
    icon: '🕐',
    label: 'Change business hours',
    desc: 'Update when calls route to staff vs. voicemail',
    fields: [
      { id: 'hoursOpen', label: 'New opening time', placeholder: '8:00 AM' },
      { id: 'hoursClose', label: 'New closing time', placeholder: '6:00 PM' },
      { id: 'hoursDays', label: 'Days affected', placeholder: 'Mon–Fri, or specify days' },
      { id: 'hoursNotes', label: 'Any other details', placeholder: 'Optional', multiline: true },
    ],
  },
  {
    key: 'name',
    icon: 'Aa',
    label: 'Name or caller ID change',
    desc: 'Update what name appears when your number calls out',
    fields: [
      { id: 'nameNumber', label: 'Phone number', placeholder: '555-0100' },
      { id: 'nameOld', label: 'Current name', placeholder: 'Acme Corp' },
      { id: 'nameNew', label: 'New name', placeholder: 'Acme Corp — Main' },
    ],
  },
  {
    key: 'other',
    icon: '…',
    label: 'Something else',
    desc: 'Any other change — describe what you need',
    fields: [
      { id: 'description', label: 'Describe the change', placeholder: 'What needs to change and why?', multiline: true },
    ],
  },
]

const ISSUE_TYPES = [
  { key: 'wrong', label: 'Calls going to wrong place' },
  { key: 'notring', label: 'Phone not ringing' },
  { key: 'quality', label: 'Poor call quality' },
  { key: 'vm', label: 'Voicemail problem' },
  { key: 'outbound', label: "Can't call out" },
  { key: 'other', label: 'Other problem' },
]

function emptyExample() {
  return { id: makeId(), date: '', time: '', callerNumber: '', whoAnswered: '', whatHappened: '' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CallSteps({ route, index }) {
  const steps = useMemo(() => plainStepsFromDesign(route), [route])
  const flow = useMemo(() => mergeCallFlowPayload(route), [route])
  const numbers = (route.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())
  const aa = flow.autoAttendant || {}
  const aaOpts = []
  if (aa.enabled === 'Yes') {
    for (let i = 0; i <= 9; i++) {
      const v = String(aa[`option${i}`] || '').trim()
      if (v) aaOpts.push({ digit: String(i), dest: v })
    }
  }
  const hours = flow.hours || {}
  const hoursLine = (hours.weekdayOpen && hours.weekdayClose)
    ? `${hours.weekdayOpen} – ${hours.weekdayClose}${hours.timezone ? ` (${hours.timezone})` : ''}`
    : null

  return (
    <div className="cp-route-block">
      <div className="cp-route-block-header">
        <div className="cp-route-block-name">{route.name || `Route ${index + 1}`}</div>
        {numbers.length > 0 && (
          <div className="cp-route-numbers">
            {numbers.map((n, i) => (
              <span key={i} className="cp-number-pill">
                {n.number}{n.label ? <span className="cp-number-label-small"> · {n.label}</span> : null}
              </span>
            ))}
          </div>
        )}
        {hoursLine && <div className="cp-route-hours">Hours: {hoursLine}</div>}
      </div>

      {steps.length > 0 ? (
        <ol className="cp-steps-list">
          {steps.map((s, si) => (
            <li key={si} className="cp-step-item">
              <span className="cp-step-num">{si + 1}</span>
              <div className="cp-step-body">
                <div className="cp-step-title">{s.title}</div>
                {s.detail && <div className="cp-step-detail">{s.detail}</div>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cp-empty-steps">Routing details not documented yet — contact your provider.</p>
      )}

      {aaOpts.length > 0 && (
        <div className="cp-aa-section">
          <div className="cp-aa-label">Auto attendant menu</div>
          <div className="cp-aa-chips">
            {aaOpts.map(opt => (
              <div key={opt.digit} className="cp-aa-chip">
                <span className="cp-aa-digit">Press {opt.digit}</span>
                <span className="cp-aa-dest">{opt.dest}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeRequestForm({ accountId, account, onSubmitted }) {
  const [selectedType, setSelectedType] = useState(null)
  const [typeFields, setTypeFields] = useState({})
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [priority, setPriority] = useState('normal')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [refNumber, setRefNumber] = useState('')
  const formRef = useRef(null)

  const typeDef = CHANGE_TYPES.find(t => t.key === selectedType)

  function setField(id, val) {
    setTypeFields(f => ({ ...f, [id]: val }))
  }

  function handleSelectType(key) {
    setSelectedType(key)
    setTypeFields({})
    setError('')
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
  }

  function handleSubmit(e) {
    e?.preventDefault()
    if (!selectedType) { setError('Choose a change type above.'); return }
    if (!contactName.trim()) { setError('Please enter your name.'); return }

    // Validate required fields
    const missingField = typeDef?.fields.find(f => !f.multiline && !String(typeFields[f.id] || '').trim() && !f.id.startsWith('notes') && !f.id.startsWith('hours'))
    if (missingField) {
      setError(`Please fill in: ${missingField.label}`)
      return
    }
    setError('')

    const ref = `CR-${Date.now().toString(36).toUpperCase()}`
    const request = {
      id: makeId(),
      requestType: 'change',
      accountId,
      changeType: CHANGE_TYPES.find(t => t.key === selectedType)?.label || selectedType,
      changeKey: selectedType,
      fields: { ...typeFields },
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      priority,
      refNumber: ref,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    }

    const existing = loadRequests(accountId)
    saveRequests(accountId, [request, ...existing])
    setRefNumber(ref)
    setSubmitted(true)
    onSubmitted?.(request)
  }

  if (submitted) {
    return (
      <div className="cp-confirm-screen">
        <div className="cp-confirm-check">✓</div>
        <div className="cp-confirm-title">Change request received</div>
        <div className="cp-ref-number">Ref: {refNumber}</div>
        <p className="cp-confirm-body">
          We typically make changes within 1 business day. We'll reach out if we have questions
          {contactPhone ? ` at ${contactPhone}` : ''}.
        </p>
        <button
          type="button"
          className="cp-btn-secondary"
          onClick={() => {
            setSubmitted(false)
            setSelectedType(null)
            setTypeFields({})
            setContactName('')
            setContactPhone('')
            setPriority('normal')
          }}
        >
          Submit another request
        </button>
      </div>
    )
  }

  return (
    <div className="cp-change-form">
      <p className="cp-form-intro">
        Select what you need to change — we'll handle it from there.
      </p>

      <div className="cp-type-cards">
        {CHANGE_TYPES.map(type => (
          <button
            key={type.key}
            type="button"
            className={`cp-type-card${selectedType === type.key ? ' is-selected' : ''}`}
            onClick={() => handleSelectType(type.key)}
          >
            <span className="cp-type-icon">{type.icon}</span>
            <span className="cp-type-label">{type.label}</span>
            <span className="cp-type-desc">{type.desc}</span>
          </button>
        ))}
      </div>

      {selectedType && typeDef && (
        <form ref={formRef} className="cp-type-form" onSubmit={handleSubmit}>
          <div className="cp-type-form-title">{typeDef.label}</div>

          {typeDef.fields.map(f => (
            <div key={f.id} className="cp-field-row">
              <label className="cp-field-label" htmlFor={`cf-${f.id}`}>{f.label}</label>
              {f.multiline ? (
                <textarea
                  id={`cf-${f.id}`}
                  className="cp-input cp-textarea"
                  value={typeFields[f.id] || ''}
                  onChange={e => setField(f.id, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                />
              ) : (
                <input
                  id={`cf-${f.id}`}
                  className="cp-input"
                  type="text"
                  value={typeFields[f.id] || ''}
                  onChange={e => setField(f.id, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <div className="cp-contact-row">
            <div className="cp-field-row">
              <label className="cp-field-label" htmlFor="cf-contact-name">Your name *</label>
              <input
                id="cf-contact-name"
                className="cp-input"
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="cp-field-row">
              <label className="cp-field-label" htmlFor="cf-contact-phone">Best number to reach you</label>
              <input
                id="cf-contact-phone"
                className="cp-input"
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="555-0100"
              />
            </div>
          </div>

          <div className="cp-priority-row">
            <span className="cp-field-label">Priority</span>
            <div className="cp-priority-opts">
              {[{ v: 'normal', l: 'Normal' }, { v: 'urgent', l: 'Urgent' }].map(p => (
                <label key={p.v} className="cp-priority-option">
                  <input
                    type="radio"
                    name="cp-priority"
                    value={p.v}
                    checked={priority === p.v}
                    onChange={() => setPriority(p.v)}
                  />
                  {p.l}
                </label>
              ))}
            </div>
          </div>

          {error && <div className="cp-form-error">{error}</div>}
          <button type="submit" className="cp-btn-primary">Submit change request</button>
        </form>
      )}
    </div>
  )
}

function IssueReporterForm({ accountId, onSubmitted }) {
  const [issueType, setIssueType] = useState('')
  const [examples, setExamples] = useState([emptyExample(), emptyExample(), emptyExample()])
  const [notes, setNotes] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [refNumber, setRefNumber] = useState('')

  function patchExample(id, field, value) {
    setExamples(ex => ex.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  function addExample() {
    setExamples(ex => [...ex, emptyExample()])
  }

  function removeExample(id) {
    if (examples.length <= 3) return
    setExamples(ex => ex.filter(e => e.id !== id))
  }

  function handleSubmit(e) {
    e?.preventDefault()
    if (!issueType) { setError('Select a type of issue.'); return }
    if (!contactName.trim()) { setError('Please enter your name.'); return }

    // Validate at least 1 example has some info
    const hasAny = examples.some(ex =>
      String(ex.callerNumber || ex.date || ex.whatHappened || '').trim()
    )
    if (!hasAny) {
      setError('Please fill in at least one call example — the caller number and time are most helpful.')
      return
    }
    setError('')

    const ref = `CI-${Date.now().toString(36).toUpperCase()}`
    const request = {
      id: makeId(),
      requestType: 'issue',
      accountId,
      changeType: `Call issue: ${ISSUE_TYPES.find(t => t.key === issueType)?.label || issueType}`,
      issueKey: issueType,
      callExamples: examples.map(({ id: _id, ...ex }) => ex),
      notes: notes.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      refNumber: ref,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    }

    const existing = loadRequests(accountId)
    saveRequests(accountId, [request, ...existing])
    setRefNumber(ref)
    setSubmitted(true)
    onSubmitted?.(request)
  }

  if (submitted) {
    return (
      <div className="cp-confirm-screen">
        <div className="cp-confirm-check">✓</div>
        <div className="cp-confirm-title">Issue report submitted</div>
        <div className="cp-ref-number">Ref: {refNumber}</div>
        <p className="cp-confirm-body">
          We'll pull the call records and investigate. We typically follow up within 1 business day
          {contactPhone ? ` at ${contactPhone}` : ''}.
        </p>
        <button
          type="button"
          className="cp-btn-secondary"
          onClick={() => {
            setSubmitted(false)
            setIssueType('')
            setExamples([emptyExample(), emptyExample(), emptyExample()])
            setNotes('')
            setContactName('')
            setContactPhone('')
          }}
        >
          Report another issue
        </button>
      </div>
    )
  }

  return (
    <form className="cp-issue-form" onSubmit={handleSubmit}>
      <p className="cp-form-intro">
        The more detail you give us, the faster we can find the call record and fix the problem.
      </p>

      <div className="cp-field-row">
        <div className="cp-field-label">Type of issue</div>
        <div className="cp-issue-chips">
          {ISSUE_TYPES.map(t => (
            <button
              key={t.key}
              type="button"
              className={`cp-issue-chip${issueType === t.key ? ' is-selected' : ''}`}
              onClick={() => setIssueType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-examples-section">
        <div className="cp-examples-heading">
          Call examples
          <span className="cp-examples-hint"> — caller ID number and exact time let us pull the call record</span>
        </div>

        {examples.map((ex, idx) => (
          <div key={ex.id} className="cp-example-row">
            <div className="cp-example-header">
              <span className="cp-example-num">Call example {idx + 1}</span>
              {examples.length > 3 && (
                <button
                  type="button"
                  className="cp-example-remove"
                  onClick={() => removeExample(ex.id)}
                  aria-label="Remove this example"
                >
                  ×
                </button>
              )}
            </div>
            <div className="cp-example-fields">
              <div className="cp-field-row">
                <label className="cp-field-label" htmlFor={`ex-date-${ex.id}`}>Date</label>
                <input
                  id={`ex-date-${ex.id}`}
                  className="cp-input"
                  type="date"
                  value={ex.date}
                  onChange={e => patchExample(ex.id, 'date', e.target.value)}
                />
              </div>
              <div className="cp-field-row">
                <label className="cp-field-label" htmlFor={`ex-time-${ex.id}`}>Approximate time</label>
                <input
                  id={`ex-time-${ex.id}`}
                  className="cp-input"
                  type="time"
                  value={ex.time}
                  onChange={e => patchExample(ex.id, 'time', e.target.value)}
                />
              </div>
              <div className="cp-field-row">
                <label className="cp-field-label" htmlFor={`ex-caller-${ex.id}`}>Caller ID / number that called</label>
                <input
                  id={`ex-caller-${ex.id}`}
                  className="cp-input"
                  type="tel"
                  value={ex.callerNumber}
                  onChange={e => patchExample(ex.id, 'callerNumber', e.target.value)}
                  placeholder="555-0100"
                />
              </div>
              <div className="cp-field-row">
                <label className="cp-field-label" htmlFor={`ex-who-${ex.id}`}>Who answered (or should have)</label>
                <input
                  id={`ex-who-${ex.id}`}
                  className="cp-input"
                  type="text"
                  value={ex.whoAnswered}
                  onChange={e => patchExample(ex.id, 'whoAnswered', e.target.value)}
                  placeholder="Front desk / Jane / voicemail"
                />
              </div>
              <div className="cp-field-row">
                <label className="cp-field-label" htmlFor={`ex-what-${ex.id}`}>What actually happened</label>
                <input
                  id={`ex-what-${ex.id}`}
                  className="cp-input"
                  type="text"
                  value={ex.whatHappened}
                  onChange={e => patchExample(ex.id, 'whatHappened', e.target.value)}
                  placeholder="Rang 3 times then went to the wrong VM"
                />
              </div>
            </div>
          </div>
        ))}

        <button type="button" className="cp-add-example" onClick={addExample}>
          + Add another call example
        </button>
      </div>

      <div className="cp-field-row">
        <label className="cp-field-label" htmlFor="issue-notes">Additional notes</label>
        <textarea
          id="issue-notes"
          className="cp-input cp-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any pattern you've noticed, or anything else that helps"
          rows={3}
        />
      </div>

      <div className="cp-contact-row">
        <div className="cp-field-row">
          <label className="cp-field-label" htmlFor="issue-contact-name">Your name *</label>
          <input
            id="issue-contact-name"
            className="cp-input"
            type="text"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            placeholder="Jane Smith"
          />
        </div>
        <div className="cp-field-row">
          <label className="cp-field-label" htmlFor="issue-contact-phone">Best number to reach you</label>
          <input
            id="issue-contact-phone"
            className="cp-input"
            type="tel"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
            placeholder="555-0100"
          />
        </div>
      </div>

      {error && <div className="cp-form-error">{error}</div>}
      <button type="submit" className="cp-btn-primary">Submit issue report</button>
    </form>
  )
}

// ── Main portal ───────────────────────────────────────────────────────────────

export default function CustomerPortal({ accountId }) {
  const [account, setAccount] = useState(() => getAccount(accountId))
  const [requests, setRequests] = useState(() => loadRequests(accountId))
  const changeRef = useRef(null)
  const issueRef = useRef(null)

  useEffect(() => {
    setAccount(getAccount(accountId))
    setRequests(loadRequests(accountId))
  }, [accountId])

  const routes = useMemo(() => {
    if (!account) return []
    return normalizeAccountRoutes(account)
  }, [account])

  // Derive summary stats
  const firstRoute = routes[0]
  const firstFlow = firstRoute ? mergeCallFlowPayload(firstRoute) : null
  const mainNumbers = firstRoute
    ? (firstRoute.mainNumbers || []).filter(n => String(n.number || '').trim())
    : []
  const hoursLine = firstFlow?.hours?.weekdayOpen && firstFlow?.hours?.weekdayClose
    ? `${firstFlow.hours.weekdayOpen} – ${firstFlow.hours.weekdayClose}`
    : null

  function scrollTo(ref) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!account) {
    return (
      <div className="cp-root cp-not-found">
        <div className="cp-topbar">
          <div className="cp-topbar-brand">ClearLine</div>
        </div>
        <div className="cp-not-found-body">
          <h1>Page not found</h1>
          <p>This link may have expired or the account no longer exists.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cp-root">
      {/* Topbar */}
      <header className="cp-topbar">
        <div className="cp-topbar-brand">ClearLine</div>
        <div className="cp-topbar-account">
          <span className="cp-topbar-name">{account.name}</span>
          {account.site && <span className="cp-topbar-site">{account.site}</span>}
        </div>
        <div className="cp-active-pill">Active</div>
      </header>

      {/* Hero */}
      <div className="cp-hero">
        <div className="cp-hero-inner">
          <div className="cp-hero-kicker">Your phone system</div>
          <h1 className="cp-hero-title">{account.name || 'Your account'}</h1>
          {(account.site || mainNumbers.length > 0) && (
            <div className="cp-hero-meta">
              {mainNumbers[0]?.number && <span>{mainNumbers[0].number}</span>}
              {account.site && <span>{account.site}</span>}
            </div>
          )}
          <div className="cp-hero-actions">
            <button type="button" className="cp-btn-primary" onClick={() => scrollTo(changeRef)}>
              Request a change
            </button>
            <button type="button" className="cp-btn-outline" onClick={() => scrollTo(issueRef)}>
              Report a call problem
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="cp-stats-row">
        <div className="cp-stat">
          <div className="cp-stat-label">Main number</div>
          <div className="cp-stat-value">{mainNumbers[0]?.number || '—'}</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-label">Business hours</div>
          <div className="cp-stat-value">{hoursLine || '—'}</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-label">Routes documented</div>
          <div className="cp-stat-value">{routes.length || '—'}</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-label">Last updated</div>
          <div className="cp-stat-value">
            {account.updatedAt ? new Date(account.updatedAt).toLocaleDateString() : '—'}
          </div>
        </div>
      </div>

      <main className="cp-main">

        {/* How your calls work */}
        <section className="cp-section">
          <div className="cp-section-kicker">Call routing</div>
          <h2 className="cp-section-title">How your calls work</h2>
          <p className="cp-section-body">
            This shows the current routing for your phone system. If anything looks incorrect,
            use the form below to request a change.
          </p>
          {routes.length === 0 ? (
            <p className="cp-empty-steps">Routing not documented yet — contact your provider.</p>
          ) : (
            routes.map((r, i) => <CallSteps key={r.id || i} route={r} index={i} />)
          )}
        </section>

        {/* Change request */}
        <section className="cp-section" ref={changeRef} id="change-request">
          <div className="cp-section-kicker">Make a request</div>
          <h2 className="cp-section-title">Request a change</h2>
          <ChangeRequestForm
            accountId={accountId}
            account={account}
            onSubmitted={req => setRequests(r => [req, ...r])}
          />
        </section>

        {/* Call issue reporter */}
        <section className="cp-section" ref={issueRef} id="report-issue">
          <div className="cp-section-kicker">Get help</div>
          <h2 className="cp-section-title">Report a call issue</h2>
          <IssueReporterForm
            accountId={accountId}
            onSubmitted={req => setRequests(r => [req, ...r])}
          />
        </section>

        {/* Past requests */}
        {requests.length > 0 && (
          <section className="cp-section cp-section-past">
            <div className="cp-section-kicker">History</div>
            <h2 className="cp-section-title">Your previous requests</h2>
            <div className="cp-past-list">
              {requests.map(r => (
                <div key={r.id} className={`cp-past-item cp-past-status-${r.status}`}>
                  <div className="cp-past-top">
                    <span className="cp-past-type">{r.changeType}</span>
                    <span className={`cp-past-badge cp-past-badge-${r.status}`}>{r.status}</span>
                  </div>
                  <div className="cp-past-meta">
                    {r.contactName || r.name}
                    {' · '}{new Date(r.submittedAt).toLocaleDateString()}
                    {r.refNumber ? ` · ${r.refNumber}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="cp-footer">
        Powered by ClearLine &mdash; Your VoIP operations partner
      </footer>
    </div>
  )
}

// ── Dealer-side inbox ─────────────────────────────────────────────────────────

export function ChangeRequestInbox({ accountId }) {
  const [requests, setRequests] = useState(() => loadRequests(accountId))

  useEffect(() => {
    setRequests(loadRequests(accountId))
  }, [accountId])

  function markStatus(id, status) {
    const updated = requests.map(r => r.id === id ? { ...r, status } : r)
    setRequests(updated)
    saveRequests(accountId, updated)
  }

  function dismiss(id) {
    const updated = requests.map(r => r.id === id ? { ...r, status: 'dismissed' } : r)
    setRequests(updated)
    saveRequests(accountId, updated)
  }

  const active = requests.filter(r => r.status !== 'dismissed')

  if (!active.length) {
    return (
      <div className="cri-empty">
        <p>No open requests from this customer yet.</p>
        <p className="cri-hint">Share the portal link and customers can submit changes and report issues directly.</p>
      </div>
    )
  }

  return (
    <div className="cri-list">
      {active.map(r => {
        const isIssue = r.requestType === 'issue'
        return (
          <div key={r.id} className={`cri-item cri-status-${r.status}`}>
            <div className="cri-item-top">
              <span className={`cri-type-badge${isIssue ? ' is-issue' : ''}`}>
                {isIssue ? '⚠ Issue' : '✎ Change'}
              </span>
              <span className="cri-type">{r.changeType}</span>
              <span className={`cri-badge cri-badge-${r.status}`}>{r.status}</span>
              {r.priority === 'urgent' && <span className="cri-badge cri-badge-urgent">Urgent</span>}
            </div>

            {/* Change request fields */}
            {!isIssue && r.fields && Object.keys(r.fields).length > 0 && (
              <div className="cri-fields">
                {Object.entries(r.fields).filter(([, v]) => String(v || '').trim()).map(([k, v]) => {
                  const fieldDef = CHANGE_TYPES.find(t => t.key === r.changeKey)?.fields.find(f => f.id === k)
                  return (
                    <div key={k} className="cri-field-row">
                      <span className="cri-field-label">{fieldDef?.label || k}:</span>
                      <span className="cri-field-value">{v}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Issue reporter examples */}
            {isIssue && r.callExamples && r.callExamples.length > 0 && (
              <div className="cri-examples">
                <div className="cri-examples-label">Call examples</div>
                {r.callExamples.filter(ex => Object.values(ex).some(v => String(v || '').trim())).map((ex, i) => (
                  <div key={i} className="cri-example">
                    <span className="cri-example-num">#{i + 1}</span>
                    <div className="cri-example-body">
                      {ex.date && <span>{ex.date}</span>}
                      {ex.time && <span>{ex.time}</span>}
                      {ex.callerNumber && <strong>Caller: {ex.callerNumber}</strong>}
                      {ex.whoAnswered && <span>Answered: {ex.whoAnswered}</span>}
                      {ex.whatHappened && <span className="cri-what">{ex.whatHappened}</span>}
                    </div>
                  </div>
                ))}
                {r.notes && <div className="cri-issue-notes">{r.notes}</div>}
              </div>
            )}

            <div className="cri-meta">
              {r.contactName || r.name}
              {r.contactPhone ? ` · ${r.contactPhone}` : ''}
              {(r.contactEmail || r.email) ? <> · <a href={`mailto:${r.contactEmail || r.email}`}>{r.contactEmail || r.email}</a></> : null}
              {' · '}{new Date(r.submittedAt).toLocaleDateString()}
              {r.refNumber && <span className="cri-ref"> · {r.refNumber}</span>}
            </div>

            <div className="cri-actions">
              {r.status === 'pending' && (
                <>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => markStatus(r.id, 'in-progress')}>
                    Start
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(r.id, 'complete')}>
                    Mark complete
                  </button>
                </>
              )}
              {r.status === 'in-progress' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => markStatus(r.id, 'complete')}>
                  Mark complete
                </button>
              )}
              {(r.contactEmail || r.email) && (
                <a
                  href={`mailto:${r.contactEmail || r.email}?subject=${encodeURIComponent(`Re: ${r.changeType}`)}`}
                  className="btn btn-secondary btn-sm"
                >
                  Reply by email
                </a>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dismiss(r.id)}>
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
