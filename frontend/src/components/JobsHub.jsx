import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getCachedOrgMembers,
  getCachedProfile,
  listOrgMembers,
} from '../lib/authModel.js'
import {
  clearAllJobData,
  createJob,
  deleteJob,
  duplicateJob,
  exportJobFileAsync,
  importJobFromFile,
  jobCompletion,
  listJobs,
  openJob,
  touchJobMeta,
} from '../lib/jobModel.js'
import { getAccount, listAccounts } from '../lib/accountModel.js'
import { navigate } from '../lib/router.js'

const EMPTY_FORM = { customer: '', site: '', ticket: '', account_id: '' }

const STAGE_LABELS = {
  survey: 'Survey',
  design: 'Design',
  golive: 'Go-Live',
}

const FILTERS = [
  { id: 'mine', label: 'My jobs' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'all', label: 'All' },
]

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?'
}

function relativeUpdated(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

function openJobRoute(jobId) {
  openJob(jobId)
  navigate(`/job/${jobId}`)
}

export default function JobsHub({
  onOpenJob,
  refreshKey,
  defaultAccountId,
  filter: filterProp,
  profileId,
  autoOpenNew = false,
}) {
  const jobs = listJobs()
  const accounts = listAccounts()
  const accountNameById = new Map(accounts.map(a => [a.id, a.name || a.site || 'Account']))
  const importRef = useRef(null)
  const [importNote, setImportNote] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState(() => (
    filterProp === 'mine' || filterProp === 'unassigned' || filterProp === 'all' ? filterProp : 'all'
  ))
  const [profile, setProfile] = useState(null)
  const [members, setMembers] = useState([])
  const [tick, setTick] = useState(0)
  void refreshKey
  void tick

  useEffect(() => {
    if (filterProp === 'mine' || filterProp === 'unassigned' || filterProp === 'all') {
      setFilter(filterProp)
    }
  }, [filterProp])

  useEffect(() => {
    if (!autoOpenNew) return
    const acct = defaultAccountId ? getAccount(defaultAccountId) : null
    setForm({
      customer: acct?.name || '',
      site: acct?.site || '',
      ticket: '',
      account_id: defaultAccountId || '',
    })
    setShowNewJob(true)
    navigate('/jobs', { replace: true })
  }, [autoOpenNew, defaultAccountId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [p, cached] = await Promise.all([
        getCachedProfile(),
        getCachedOrgMembers(),
      ])
      if (cancelled) return
      setProfile(p || (profileId ? { id: profileId } : null))
      setMembers(cached || [])
      try {
        const fresh = await listOrgMembers()
        if (!cancelled && fresh?.length) setMembers(fresh)
      } catch { /* offline / unconfigured */ }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey, profileId])

  useEffect(() => {
    if (!showNewJob) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setShowNewJob(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNewJob])

  const nameById = new Map((members || []).map(m => [m.id, m.display_name]))

  const filtered = jobs.filter((job) => {
    if (filter === 'all') return true
    if (filter === 'unassigned') return !job.assigned_to
    if (filter === 'mine') return profile?.id && job.assigned_to === profile.id
    return true
  })

  function openNewJob() {
    const acct = defaultAccountId ? getAccount(defaultAccountId) : null
    setForm({
      customer: acct?.name || '',
      site: acct?.site || '',
      ticket: '',
      account_id: defaultAccountId || '',
    })
    setShowNewJob(true)
  }

  function submitNewJob(e) {
    e?.preventDefault()
    const accountId = form.account_id || null
    const acct = accountId ? getAccount(accountId) : null
    const job = createJob({
      customer: form.customer.trim() || acct?.name || 'New job',
      site: form.site.trim() || acct?.site || '',
      ticket: form.ticket.trim(),
      assigned_to: profile?.id || null,
      account_id: accountId,
    })
    setShowNewJob(false)
    setForm(EMPTY_FORM)
    if (typeof onOpenJob === 'function') onOpenJob(job.id, 'cockpit')
    else openJobRoute(job.id)
  }

  function handleDelete(job) {
    const name = job.customer || 'this job'
    if (!confirm(`Permanently delete “${name}” from this device?\n\nSurvey, Design, and Go-Live data for this job will be erased. This cannot be undone.\n\nExport the job file first if you need to open it again later.`)) {
      return
    }
    deleteJob(job.id)
    if (typeof onOpenJob === 'function') onOpenJob(null)
  }

  function handleClearAll() {
    if (!confirm('Erase ALL ClearLine jobs from this browser?\n\nExport any job files you still need first. Theme setting is kept.')) {
      return
    }
    if (!confirm('Final confirm: delete every job and draft on this device?')) return
    clearAllJobData()
    if (typeof onOpenJob === 'function') onOpenJob(null)
  }

  async function handleExport(job) {
    try {
      await exportJobFileAsync(job.id)
      setImportNote({ type: 'ok', text: `Exported job file for “${job.customer || 'job'}”. Store it somewhere safe, then you can Delete from this browser.` })
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not export that job file.' })
    }
  }

  async function handleDuplicate(job) {
    try {
      const copy = await duplicateJob(job.id)
      if (copy) {
        if (typeof onOpenJob === 'function') onOpenJob(copy.id, 'cockpit')
        else openJobRoute(copy.id)
      }
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not duplicate that job.' })
    }
  }

  async function handleImport(file) {
    if (!file) return
    try {
      const meta = await importJobFromFile(file)
      setImportNote({ type: 'ok', text: `Imported “${meta.customer}”. Opening job…` })
      if (typeof onOpenJob === 'function') onOpenJob(meta.id, 'cockpit')
      else openJobRoute(meta.id)
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not import that file. Use a ClearLine .clearline job export.' })
    }
  }

  function handleAssign(job, assignedTo) {
    touchJobMeta(job.id, { assigned_to: assignedTo || null })
    setTick(t => t + 1)
  }

  function handleOpen(job) {
    if (typeof onOpenJob === 'function') {
      openJob(job.id)
      onOpenJob(job.id, 'cockpit')
    } else {
      openJobRoute(job.id)
    }
  }

  return (
    <section className="jobs-hub">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Jobs</div>
          <h1>Field jobs</h1>
          <p>
            Work on a job, export a job file to keep it, then delete it from this browser.
            Import the file when you’re ready to continue.
          </p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-primary" onClick={openNewJob}>New job</button>
          <button type="button" className="btn btn-secondary" onClick={() => importRef.current?.click()}>
            Import job file
          </button>
          {jobs.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleClearAll} title="Remove all job data from this device">
              Clear all data
            </button>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".clearline,.json,application/octet-stream,application/json"
            hidden
            onChange={e => {
              handleImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <p className="jobs-privacy-note">
        <strong>Recommended:</strong> Export job file → store on your drive → Delete from Jobs.
        Cloudflare only hosts ClearLine — it never receives customer data.
        Job files stay with you until you Import them again.
      </p>

      <div className="jobs-filter-pills" role="tablist" aria-label="Job filters">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`jobs-filter-pill${filter === f.id ? ' is-active' : ''}`}
            onClick={() => {
              setFilter(f.id)
              navigate('/jobs', { query: { filter: f.id } })
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {importNote && (
        <div className={importNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {importNote.text}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-hint-action jobs-empty">
          <p>
            {jobs.length === 0
              ? 'No jobs on this device yet. Use New job or Import job file above to get started.'
              : 'No jobs match this filter.'}
          </p>
        </div>
      )}

      <div className="jobs-grid">
        {filtered.map(job => {
          const done = jobCompletion(job.id)
          const assigneeName = job.assigned_to
            ? (nameById.get(job.assigned_to) || 'Teammate')
            : null
          const updaterName = job.updated_by
            ? (nameById.get(job.updated_by) || null)
            : null
          const stageLabel = STAGE_LABELS[job.stage] || job.stage || 'Survey'
          const accountLabel = job.account_id
            ? (accountNameById.get(job.account_id) || null)
            : null

          return (
            <article key={job.id} className="job-card">
              <button type="button" className="job-card-main" onClick={() => handleOpen(job)}>
                <div className="job-card-top">
                  <div className="survey-kicker">{job.ticket || 'Job'}</div>
                  <div className="job-card-meta-row">
                    <span className="job-stage-badge">{stageLabel}</span>
                    <span className="job-assignee-avatar" title={assigneeName || 'Unassigned'} aria-hidden="true">
                      {assigneeName ? initials(assigneeName) : '—'}
                    </span>
                  </div>
                </div>
                {accountLabel && (
                  <div className="job-account-label">{accountLabel}</div>
                )}
                <h2>{job.customer || 'Untitled customer'}</h2>
                <p>{job.site || 'Site TBD'}</p>
                <div className="job-badges">
                  <span className={done.survey ? 'job-badge is-done' : 'job-badge'}>Survey</span>
                  <span className={done.design ? 'job-badge is-done' : 'job-badge'}>Design</span>
                  <span className={done.golive ? 'job-badge is-done' : 'job-badge'}>Go-Live</span>
                </div>
                <small className="job-updated">
                  Updated {relativeUpdated(job.updatedAt)}
                  {updaterName ? ` by ${updaterName}` : ''}
                </small>
              </button>
              <div className="job-card-assign">
                <label>
                  <span className="sr-only">Assignee</span>
                  <select
                    value={job.assigned_to || ''}
                    onChange={e => handleAssign(job, e.target.value)}
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
                    ))}
                    {job.assigned_to && !members.some(m => m.id === job.assigned_to) && (
                      <option value={job.assigned_to}>Unknown member</option>
                    )}
                  </select>
                </label>
              </div>
              <div className="job-card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => handleOpen(job)}>Open</button>
                <button type="button" className="btn btn-secondary" onClick={() => handleExport(job)}>
                  Export file
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleDuplicate(job)}>
                  Duplicate
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(job)}>
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {showNewJob && createPortal(
        <div
          className="section-modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowNewJob(false)
          }}
        >
          <div
            className="section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-job-title"
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">Jobs</div>
                <h2 id="new-job-title">New job</h2>
                <p>Customer, site, and optional account link.</p>
              </div>
              <div className="section-modal-nav">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewJob(false)}>
                  Cancel
                </button>
              </div>
            </div>
            <div className="section-modal-body">
              <form className="new-job-form" onSubmit={submitNewJob}>
                <label className="field">
                  <span>Account (optional)</span>
                  <select
                    value={form.account_id}
                    onChange={e => {
                      const id = e.target.value
                      const acct = id ? getAccount(id) : null
                      setForm(f => ({
                        ...f,
                        account_id: id,
                        customer: f.customer || acct?.name || '',
                        site: f.site || acct?.site || '',
                      }))
                    }}
                  >
                    <option value="">No account</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name || a.site || a.id}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Customer / company</span>
                  <input
                    autoFocus
                    value={form.customer}
                    onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
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
                  <span>Ticket / project</span>
                  <input
                    value={form.ticket}
                    onChange={e => setForm(f => ({ ...f, ticket: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary">Create job</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowNewJob(false)}>
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
