import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
} from '../lib/jobModel.js'

const EMPTY_FORM = { customer: '', site: '', ticket: '' }

export default function JobsHub({ onOpenJob, refreshKey }) {
  const jobs = listJobs()
  const importRef = useRef(null)
  const [importNote, setImportNote] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  // refreshKey forces re-read when parent bumps it
  void refreshKey

  useEffect(() => {
    if (!showNewJob) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setShowNewJob(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNewJob])

  function openNewJob() {
    setForm(EMPTY_FORM)
    setShowNewJob(true)
  }

  function submitNewJob(e) {
    e?.preventDefault()
    const customer = form.customer.trim() || 'New job'
    const job = createJob({
      customer,
      site: form.site.trim(),
      ticket: form.ticket.trim(),
    })
    setShowNewJob(false)
    setForm(EMPTY_FORM)
    onOpenJob(job.id, 'siteSurvey')
  }

  function handleDelete(job) {
    const name = job.customer || 'this job'
    if (!confirm(`Permanently delete “${name}” from this device?\n\nSurvey, Design, and Go-Live data for this job will be erased. This cannot be undone.\n\nExport the job file first if you need to open it again later.`)) {
      return
    }
    deleteJob(job.id)
    onOpenJob(null)
  }

  function handleClearAll() {
    if (!confirm('Erase ALL ClearLine jobs from this browser?\n\nExport any job files you still need first. Theme setting is kept.')) {
      return
    }
    if (!confirm('Final confirm: delete every job and draft on this device?')) return
    clearAllJobData()
    onOpenJob(null)
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
      if (copy) onOpenJob(copy.id, 'siteSurvey')
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
      onOpenJob(meta.id, 'siteSurvey')
    } catch (err) {
      console.error(err)
      setImportNote({ type: 'error', text: 'Could not import that file. Use a ClearLine .clearline job export.' })
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

      {importNote && (
        <div className={importNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {importNote.text}
        </div>
      )}

      {jobs.length === 0 && (
        <div className="empty-hint-action jobs-empty">
          <p>No jobs on this device yet. Use New job or Import job file above to get started.</p>
        </div>
      )}

      <div className="jobs-grid">
        {jobs.map(job => {
          const done = jobCompletion(job.id)
          return (
            <article key={job.id} className="job-card">
              <button type="button" className="job-card-main" onClick={() => { openJob(job.id); onOpenJob(job.id, 'siteSurvey') }}>
                <div className="survey-kicker">{job.ticket || 'Job'}</div>
                <h2>{job.customer || 'Untitled customer'}</h2>
                <p>{job.site || 'Site TBD'}</p>
                <div className="job-badges">
                  <span className={done.survey ? 'job-badge is-done' : 'job-badge'}>Survey</span>
                  <span className={done.design ? 'job-badge is-done' : 'job-badge'}>Design</span>
                  <span className={done.golive ? 'job-badge is-done' : 'job-badge'}>Go-Live</span>
                </div>
                <small className="job-updated">
                  Updated {job.updatedAt ? new Date(job.updatedAt).toLocaleString() : '—'}
                </small>
              </button>
              <div className="job-card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { openJob(job.id); onOpenJob(job.id, 'siteSurvey') }}>Open</button>
                <button type="button" className="btn btn-secondary" onClick={() => handleExport(job)}>
                  Export file
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleDuplicate(job)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDelete(job)}
                >
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
                <p>Customer, site, and ticket for this install.</p>
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
