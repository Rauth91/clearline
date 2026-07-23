/**
 * QuickCard — End-user phone reference card
 * Standalone tool, or embedded in System Design with job autofill + 3×4 sheet print.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getJob, loadJobGoLive, loadJobSurvey } from '../lib/jobModel.js'

const BLANK = {
  name: '',
  title: '',
  company: '',
  location: '',
  extension: '',
  directNumber: '',
  vmAccess: '',
  vmPin: '',
  techSupport: '',
  techEmail: '',
  notes: '',
}

/** Cards per letter sheet for 3×4 perforated stock */
const SHEET_SLOTS = 12

function formatPhone(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return s
}

function supportStorageKey(jobId) {
  return jobId ? `clearline-qc-support:${jobId}` : null
}

function loadSavedSupport(jobId) {
  const key = supportStorageKey(jobId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      phone: String(parsed.phone || ''),
      email: String(parsed.email || ''),
    }
  } catch {
    return null
  }
}

function saveSupport(jobId, support) {
  const key = supportStorageKey(jobId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify({
      phone: support.phone || '',
      email: support.email || '',
    }))
  } catch { /* ignore quota */ }
}

function chunkCards(cards, size = SHEET_SLOTS) {
  if (!cards.length) return [[null, null, null, null, null, null, null, null, null, null, null, null]]
  const pages = []
  for (let i = 0; i < cards.length; i += size) {
    const slice = cards.slice(i, i + size)
    while (slice.length < size) slice.push(null)
    pages.push(slice)
  }
  return pages
}

/** Users from design first, else survey. */
export function listQuickCardUsers(design, survey) {
  const designUsers = (design?.users || []).filter(u =>
    String(u.name || '').trim() || String(u.extension || '').trim() || String(u.did || '').trim(),
  )
  if (designUsers.length) {
    return designUsers.map(u => ({
      id: u.id || `d-${u.extension || u.name}`,
      name: u.name || '',
      role: u.role || '',
      extension: u.extension || '',
      did: u.did || '',
      location: u.location || '',
      email: u.email || '',
    }))
  }
  return (survey?.users || [])
    .filter(u => String(u.name || '').trim() || String(u.extension || '').trim() || String(u.phone || '').trim())
    .map((u, i) => ({
      id: u.id || `s-${i}-${u.extension || u.name}`,
      name: u.name || '',
      role: u.role || '',
      extension: u.extension || '',
      did: u.phone || '',
      location: u.location || '',
      email: u.email || '',
    }))
}

export function buildQuickCardDefaults({ survey, design, job, user, support, vmAccess } = {}) {
  const company = design?.project?.customer
    || survey?.customer?.company
    || job?.customer
    || ''
  const site = (user?.location || '').trim()
    || design?.project?.site
    || survey?.customer?.siteName
    || job?.site
    || ''

  return {
    ...BLANK,
    name: user?.name || '',
    title: user?.role || '',
    company,
    location: site,
    extension: user?.extension || '',
    directNumber: user?.did || '',
    vmAccess: vmAccess || '*98',
    vmPin: '',
    techSupport: support?.phone || '',
    techEmail: support?.email || '',
    notes: '',
  }
}

function defaultSupportFromJob({ golive, survey } = {}) {
  return {
    phone: golive?.handoff?.adminPhone || survey?.customer?.contactPhone || '',
    email: golive?.handoff?.adminEmail || survey?.customer?.contactEmail || '',
  }
}

function PrintCard({ data, forScreen = false, dense = false }) {
  if (!data) {
    return <div className={`qc-card qc-card-empty${dense ? ' qc-card-dense' : ''}`} />
  }

  const company = (data.company || '').trim()
  const bannerTitle = company || 'Phone reference'
  const roleLine = [data.title, data.location].filter(Boolean).join(' · ')
  const hasVm = data.vmAccess || data.vmPin
  const hasSupport = data.techSupport || data.techEmail

  return (
    <div className={`qc-card${forScreen ? ' qc-card-preview' : ''}${dense ? ' qc-card-dense' : ''}`}>
      <div className="qc-card-banner">
        <span className="qc-card-brand">{bannerTitle}</span>
        {!dense ? <span className="qc-card-brand-sub">Phone reference</span> : null}
      </div>

      <div className="qc-card-identity">
        <div className="qc-card-name">{data.name || 'Your name'}</div>
        {roleLine ? <div className="qc-card-role">{roleLine}</div> : null}
      </div>

      <div className="qc-card-hero">
        <div className="qc-card-hero-item">
          <span className="qc-card-kicker">Ext</span>
          <span className="qc-card-hero-value">{data.extension || '—'}</span>
        </div>
        <div className="qc-card-hero-item">
          <span className="qc-card-kicker">Direct</span>
          <span className="qc-card-hero-value qc-card-hero-value-sm">
            {formatPhone(data.directNumber) || '—'}
          </span>
        </div>
      </div>

      {hasVm ? (
        <div className="qc-card-section">
          {!dense ? <div className="qc-card-section-title">Voicemail</div> : null}
          <div className="qc-card-rows">
            {data.vmAccess ? (
              <div className="qc-card-row">
                <span>{dense ? 'VM' : 'Dial'}</span>
                <strong>{data.vmAccess}</strong>
              </div>
            ) : null}
            {data.vmPin ? (
              <div className="qc-card-row">
                <span>PIN</span>
                <strong>{data.vmPin}</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasSupport ? (
        <div className="qc-card-support">
          {!dense ? (
            <>
              <div className="qc-card-section-title">Need help?</div>
              <p className="qc-card-support-lead">Contact tech support</p>
            </>
          ) : (
            <div className="qc-card-section-title">Support</div>
          )}
          <div className="qc-card-rows">
            {data.techSupport ? (
              <div className="qc-card-row">
                <span>Phone</span>
                <strong>{formatPhone(data.techSupport)}</strong>
              </div>
            ) : null}
            {data.techEmail ? (
              <div className="qc-card-row">
                <span>Email</span>
                <strong className="qc-card-email">{data.techEmail}</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.notes && !dense ? (
        <div className="qc-card-section">
          <div className="qc-card-section-title">Notes</div>
          <p className="qc-card-notes">{data.notes}</p>
        </div>
      ) : null}
    </div>
  )
}

function PrintSheets({ pages }) {
  return (
    <div className="qc-print-sheet" aria-hidden="true">
      {pages.map((slots, pageIdx) => (
        <div key={`sheet-${pageIdx}`} className="qc-sheet-page">
          {slots.map((card, slotIdx) => (
            <div key={`slot-${pageIdx}-${slotIdx}`} className="qc-sheet-slot">
              <PrintCard data={card} dense />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * @param {{ jobId?: string, design?: object, survey?: object, embedded?: boolean }} [props]
 */
export default function QuickCard({
  jobId = null,
  design: designProp = null,
  survey: surveyProp = null,
  embedded = false,
} = {}) {
  const design = designProp
  const survey = useMemo(
    () => (jobId ? loadJobSurvey(jobId) : surveyProp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobId],
  )
  const job = useMemo(() => (jobId ? getJob(jobId) : null), [jobId])
  const golive = useMemo(() => (jobId ? loadJobGoLive(jobId) : null), [jobId])

  const users = useMemo(
    () => listQuickCardUsers(design, survey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      design?.project?.customer,
      design?.project?.site,
      JSON.stringify((design?.users || []).map(u => [u.id, u.name, u.role, u.extension, u.did, u.location])),
      JSON.stringify((survey?.users || []).map(u => [u.id, u.name, u.role, u.extension, u.phone, u.location])),
    ],
  )

  const hasJobContext = Boolean(jobId || design || survey)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [data, setData] = useState({ ...BLANK })
  const [sharedSupport, setSharedSupport] = useState({ phone: '', email: '' })
  const [supportReady, setSupportReady] = useState(false)
  const [pinLocked, setPinLocked] = useState(false)
  const [notesLocked, setNotesLocked] = useState(false)
  const [printCards, setPrintCards] = useState([])
  const [pendingPrint, setPendingPrint] = useState(false)

  const companyKey = design?.project?.customer || survey?.customer?.company || job?.customer || ''
  const siteKey = design?.project?.site || survey?.customer?.siteName || job?.site || ''

  useEffect(() => {
    if (!hasJobContext) {
      setSharedSupport({ phone: '', email: '' })
      setSupportReady(true)
      return
    }
    const saved = jobId ? loadSavedSupport(jobId) : null
    const fallback = defaultSupportFromJob({ golive, survey })
    setSharedSupport({
      phone: saved?.phone || fallback.phone || '',
      email: saved?.email || fallback.email || '',
    })
    setSupportReady(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, hasJobContext])

  useEffect(() => {
    if (!hasJobContext || !supportReady || !jobId) return
    saveSupport(jobId, sharedSupport)
  }, [hasJobContext, supportReady, jobId, sharedSupport])

  useEffect(() => {
    if (!hasJobContext || !supportReady) return
    const ctx = { survey, design, job, support: { phone: '', email: '' } }
    if (!users.length) {
      setSelectedUserId('')
      setData(prev => {
        const next = buildQuickCardDefaults({ ...ctx, user: null, vmAccess: prev.vmAccess || '*98' })
        if (pinLocked) {
          next.vmPin = prev.vmPin
          next.vmAccess = prev.vmAccess
        }
        if (notesLocked) next.notes = prev.notes
        return next
      })
      return
    }
    const nextId = users.some(u => u.id === selectedUserId) ? selectedUserId : users[0].id
    if (nextId !== selectedUserId) {
      setSelectedUserId(nextId)
      return
    }
    const user = users.find(u => u.id === nextId) || users[0]
    setData(prev => {
      const next = buildQuickCardDefaults({
        ...ctx,
        user,
        vmAccess: prev.vmAccess || '*98',
      })
      if (pinLocked) {
        next.vmPin = prev.vmPin
        next.vmAccess = prev.vmAccess
      } else {
        next.vmPin = prev.vmPin
      }
      if (notesLocked) next.notes = prev.notes
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJobContext, supportReady, selectedUserId, users, companyKey, siteKey])

  useEffect(() => {
    if (!pendingPrint) return undefined
    const t = window.setTimeout(() => {
      window.print()
      setPendingPrint(false)
    }, 100)
    return () => window.clearTimeout(t)
  }, [pendingPrint, printCards])

  function set(field, value) {
    if (field === 'vmPin' || field === 'vmAccess') setPinLocked(true)
    if (field === 'notes') setNotesLocked(true)
    setData(prev => ({ ...prev, [field]: value }))
  }

  function setSupportField(field, value) {
    setSharedSupport(prev => ({ ...prev, [field]: value }))
  }

  function refillFromJob() {
    if (!hasJobContext) return
    setPinLocked(false)
    setNotesLocked(false)
    const fallback = defaultSupportFromJob({ golive, survey })
    const saved = jobId ? loadSavedSupport(jobId) : null
    setSharedSupport(prev => ({
      phone: prev.phone || saved?.phone || fallback.phone || '',
      email: prev.email || saved?.email || fallback.email || '',
    }))
    const user = users.find(u => u.id === selectedUserId) || users[0] || null
    setData(buildQuickCardDefaults({
      survey,
      design,
      job,
      user,
      support: {
        phone: sharedSupport.phone || saved?.phone || fallback.phone || '',
        email: sharedSupport.email || saved?.email || fallback.email || '',
      },
    }))
  }

  const cardData = hasJobContext
    ? { ...data, techSupport: sharedSupport.phone, techEmail: sharedSupport.email }
    : data

  const allCards = useMemo(() => {
    if (!hasJobContext || !users.length) return []
    return users.map(user => buildQuickCardDefaults({
      survey,
      design,
      job,
      user,
      support: sharedSupport,
      vmAccess: data.vmAccess || '*98',
    }))
  }, [hasJobContext, users, survey, design, job, sharedSupport, data.vmAccess])

  const printPages = useMemo(
    () => chunkCards(printCards.length ? printCards : [null]),
    [printCards],
  )

  const canPrintOne = Boolean(cardData.name || cardData.extension)
  const canPrintAll = allCards.length > 0
  const sheetsNeeded = canPrintAll
    ? Math.ceil(allCards.length / SHEET_SLOTS)
    : (canPrintOne ? 1 : 0)

  function queuePrint(cards) {
    setPrintCards(cards)
    setPendingPrint(true)
  }

  function printOne() {
    queuePrint([cardData])
  }

  function printAll() {
    queuePrint(allCards)
  }

  return (
    <div className={`qc-root${embedded ? ' qc-embedded' : ''}`}>
      {!embedded ? (
        <div className="qc-header no-print">
          <div className="qc-title">Quick Card</div>
          <div className="qc-subtitle">
            Build desk cards for 3×4 perforated letter sheets (12 per page).
          </div>
        </div>
      ) : null}

      <div className="qc-layout no-print">
        <form
          className="qc-form"
          onSubmit={e => {
            e.preventDefault()
            if (canPrintOne) printOne()
          }}
        >
          <div className="qc-sheet-note">
            Print layout: <strong>3 × 4</strong> on US Letter (8½ × 11).
            Set margins to <strong>None</strong>, and turn on background graphics for the banner.
          </div>

          {hasJobContext ? (
            <>
              <div className="qc-job-bar">
                <div className="qc-field qc-field-grow">
                  <label className="qc-label" htmlFor="qc-user">User on this job</label>
                  {users.length ? (
                    <select
                      id="qc-user"
                      className="qc-input"
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {[u.name || 'Unnamed', u.extension ? `ext ${u.extension}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="qc-print-hint">
                      No users in System Design yet. Add people under Users &amp; DIDs (or import from Site Survey), then come back.
                    </p>
                  )}
                </div>
                <button type="button" className="btn btn-secondary qc-refill-btn" onClick={refillFromJob}>
                  Reset user fields
                </button>
              </div>

              <div className="qc-shared-support">
                <div className="qc-section-label">Tech support (all cards)</div>
                <p className="qc-print-hint">
                  Set once — used on every user card, including Print all.
                </p>
                <div className="qc-field-row">
                  <div className="qc-field">
                    <label className="qc-label" htmlFor="qc-support-phone">Support phone</label>
                    <input
                      id="qc-support-phone"
                      className="qc-input"
                      placeholder="(555) 010-HELP"
                      value={sharedSupport.phone}
                      onChange={e => setSupportField('phone', e.target.value)}
                    />
                  </div>
                  <div className="qc-field">
                    <label className="qc-label" htmlFor="qc-support-email">Support email</label>
                    <input
                      id="qc-support-email"
                      className="qc-input"
                      type="email"
                      placeholder="support@example.com"
                      value={sharedSupport.email}
                      onChange={e => setSupportField('email', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="qc-section-label">Who it&apos;s for</div>
          <div className="qc-field-row">
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-name">Name</label>
              <input id="qc-name" className="qc-input" placeholder="Jordan Lee" value={data.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-title">Title</label>
              <input id="qc-title" className="qc-input" placeholder="Office Manager" value={data.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-company">Company</label>
              <input id="qc-company" className="qc-input" placeholder="Acme Corp" value={data.company} onChange={e => set('company', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-location">Site</label>
              <input id="qc-location" className="qc-input" placeholder="Main Office" value={data.location} onChange={e => set('location', e.target.value)} />
            </div>
          </div>

          <div className="qc-section-label">Their numbers</div>
          <div className="qc-field-row">
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-ext">Extension</label>
              <input id="qc-ext" className="qc-input" placeholder="1001" value={data.extension} onChange={e => set('extension', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-did">Direct number</label>
              <input id="qc-did" className="qc-input" placeholder="(555) 010-2001" value={data.directNumber} onChange={e => set('directNumber', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-vm">Voicemail access</label>
              <input id="qc-vm" className="qc-input" placeholder="*98" value={data.vmAccess} onChange={e => set('vmAccess', e.target.value)} />
            </div>
            <div className="qc-field">
              <label className="qc-label" htmlFor="qc-pin">Voicemail PIN</label>
              <input id="qc-pin" className="qc-input" placeholder="1234" value={data.vmPin} onChange={e => set('vmPin', e.target.value)} />
            </div>
          </div>

          {!hasJobContext ? (
            <>
              <div className="qc-section-label">Tech support</div>
              <div className="qc-field-row">
                <div className="qc-field">
                  <label className="qc-label" htmlFor="qc-support-phone-solo">Support phone</label>
                  <input
                    id="qc-support-phone-solo"
                    className="qc-input"
                    placeholder="(555) 010-HELP"
                    value={data.techSupport}
                    onChange={e => set('techSupport', e.target.value)}
                  />
                </div>
                <div className="qc-field">
                  <label className="qc-label" htmlFor="qc-support-email-solo">Support email</label>
                  <input
                    id="qc-support-email-solo"
                    className="qc-input"
                    type="email"
                    placeholder="support@example.com"
                    value={data.techEmail}
                    onChange={e => set('techEmail', e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : null}

          <div className="qc-section-label">Notes (optional)</div>
          <textarea
            className="qc-textarea"
            placeholder="Shown on screen preview; omitted on perforated cards to save space."
            value={data.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
          />

          <div className="qc-actions">
            <button type="submit" className="btn btn-primary" disabled={!canPrintOne}>
              Print this card
            </button>
            {hasJobContext ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canPrintAll}
                onClick={printAll}
              >
                Print all users ({users.length})
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPinLocked(false)
                setNotesLocked(false)
                if (hasJobContext) refillFromJob()
                else setData({ ...BLANK })
              }}
            >
              {hasJobContext ? 'Reset user fields' : 'Clear'}
            </button>
          </div>
          {canPrintAll ? (
            <p className="qc-print-hint">
              {users.length} user{users.length === 1 ? '' : 's'} → {sheetsNeeded} sheet{sheetsNeeded === 1 ? '' : 's'}
              {' '}(12 cards / page). Empty slots stay blank for unused perforations.
            </p>
          ) : canPrintOne ? (
            <p className="qc-print-hint">
              Prints in the first slot of a 3×4 letter sheet (remaining slots blank).
            </p>
          ) : null}
        </form>

        <aside className="qc-preview-pane" aria-label="Card preview">
          <div className="qc-section-label">Preview</div>
          <PrintCard data={cardData} forScreen />
          <p className="qc-print-hint qc-preview-sheet-hint">
            On paper this packs into a tighter 3×4 grid for perforated stock.
          </p>
        </aside>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(<PrintSheets pages={printPages} />, document.body)
        : null}
    </div>
  )
}
