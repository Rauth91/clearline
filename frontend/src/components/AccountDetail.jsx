/**
 * AccountDetail — account parent with Call flow | Jobs tabs
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AccountCallFlow from './AccountCallFlow.jsx'
import NsSync from './NsSync.jsx'
import { ChangeRequestInbox } from './CustomerPortal.jsx'
import {
  createJob,
  deleteJob,
  listJobsForAccount,
  openJob,
} from '../lib/jobModel.js'
import { getAccount, listAccounts } from '../lib/accountModel.js'
import { navigate } from '../lib/router.js'
import { canApplyRemoteRefresh, onDataChanged } from '../lib/dataEvents.js'

const TABS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'flow', label: 'Call flow' },
  { id: 'ns', label: 'NS Sync' },
  { id: 'requests', label: 'Requests' },
]

const STAGE_LABELS = {
  survey: 'Survey',
  design: 'Design',
  golive: 'Go-Live',
}

export default function AccountDetail({ accountId, refreshKey, onBack }) {
  const [tab, setTab] = useState('jobs')
  const [account, setAccount] = useState(() => getAccount(accountId))
  const [jobs, setJobs] = useState(() => listJobsForAccount(accountId))
  const [showNewJob, setShowNewJob] = useState(false)
  const [form, setForm] = useState({ customer: '', site: '', ticket: '', jobType: 'install' })
  const [portalCopied, setPortalCopied] = useState(false)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    setAccount(getAccount(accountId))
    setJobs(listJobsForAccount(accountId))
    setTab('flow')
  }, [accountId, refreshKey])

  useEffect(() => {
    if (!accountId) return undefined
    return onDataChanged(async (detail) => {
      const ids = detail.ids || []
      if (detail.kind === 'account' && ids.includes(accountId)) {
        const ok = await canApplyRemoteRefresh(accountId)
        if (!ok) return
        setAccount(getAccount(accountId))
        return
      }
      if (detail.kind === 'job') {
        const related = listJobsForAccount(accountId)
        if (!ids.some(id => related.some(j => j.id === id))) return
        setJobs(listJobsForAccount(accountId))
      }
    })
  }, [accountId])

  useEffect(() => {
    if (!showNewJob) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setShowNewJob(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNewJob])

  if (!account) {
    return (
      <section className="account-detail">
        <p className="empty-hint-action">Account not found.</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => (onBack ? onBack() : navigate('/accounts'))}
        >
          Back
        </button>
      </section>
    )
  }

  function openNewJob() {
    setForm({ customer: account.name || '', site: account.site || '', ticket: '', jobType: 'install' })
    setShowNewJob(true)
  }

  function submitNewJob(e) {
    e?.preventDefault()
    const job = createJob({
      customer: form.customer.trim() || account.name || 'New job',
      site: form.site.trim() || account.site || '',
      ticket: form.ticket.trim(),
      account_id: account.id,
      jobType: form.jobType,
    })
    setShowNewJob(false)
    openJob(job.id)
    setJobs(listJobsForAccount(accountId))
    const dest = form.jobType === 'migration' ? `/job/${job.id}/migration` : `/job/${job.id}`
    navigate(dest)
  }

  return (
    <section className="account-detail">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Account</div>
          <h1>{account.name || 'Untitled account'}</h1>
          <p>
            {account.site || 'Site TBD'}
            {account.mainDid ? ` · ${account.mainDid}` : ''}
            {` · ${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="survey-actions">
          <button
            type="button"
            className={`btn ${portalCopied ? 'btn-primary' : 'btn-ghost'}`}
            title="Copy customer portal link to clipboard"
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#/portal/${account.id}`
              navigator.clipboard?.writeText(url).then(() => {
                setPortalCopied(true)
                clearTimeout(copyTimerRef.current)
                copyTimerRef.current = setTimeout(() => setPortalCopied(false), 2500)
              }).catch(() => {
                // Fallback for browsers without clipboard API
                const el = document.createElement('textarea')
                el.value = url
                el.style.position = 'fixed'
                el.style.opacity = '0'
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)
                setPortalCopied(true)
                clearTimeout(copyTimerRef.current)
                copyTimerRef.current = setTimeout(() => setPortalCopied(false), 2500)
              })
            }}
          >
            {portalCopied ? 'Link copied!' : 'Share portal'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => (onBack ? onBack() : navigate('/'))}
          >
            Back
          </button>
          <button type="button" className="btn btn-primary" onClick={openNewJob}>
            New job
          </button>
        </div>
      </div>

      <div className="account-detail-tabs" role="tablist" aria-label="Account sections">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`account-detail-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flow' && (
        <div className="account-detail-flow">
          <AccountCallFlow
            accountId={accountId}
            embedded
            onBack={() => (onBack ? onBack() : navigate('/'))}
          />
        </div>
      )}

      {tab === 'ns' && (
        <div className="account-detail-ns">
          <NsSync
            account={account}
            onImported={(updated) => {
              setAccount(updated)
              setTab('flow')
            }}
          />
        </div>
      )}

      {tab === 'requests' && (
        <div className="account-detail-ns">
          <div className="ns-sync-header" style={{ marginBottom: 16 }}>
            <div className="ns-sync-title">Customer change requests</div>
            <div className="ns-sync-sub">
              Change requests submitted by your customer via the portal link.
              Click &ldquo;Share portal&rdquo; above to give your customer their link.
            </div>
          </div>
          <ChangeRequestInbox accountId={accountId} />
        </div>
      )}

      {tab === 'jobs' && (
        <div className="account-detail-jobs">
          {jobs.length === 0 ? (
            <div className="acct-jobs-empty">
              <p>No jobs yet for this account.</p>
              <button type="button" className="btn btn-primary" onClick={openNewJob}>+ New job</button>
            </div>
          ) : (
            <div className="acct-jobs-list">
              <div className="acct-jobs-list-header">
                <span className="acct-jobs-count">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                <button type="button" className="btn btn-primary" onClick={openNewJob}>+ New job</button>
              </div>
              {jobs.map(job => {
                const isMig = job.jobType === 'migration'
                const dest = isMig ? `/job/${job.id}/migration` : `/job/${job.id}`
                return (
                  <div key={job.id} className="acct-job-row">
                    <button type="button" className="acct-job-row-main"
                      onClick={() => { openJob(job.id); navigate(dest) }}>
                      <span className={`acct-job-type${isMig ? ' is-migration' : ''}`}>
                        {isMig ? 'Migration' : 'Install'}
                      </span>
                      <span className="acct-job-name">{job.customer || 'Untitled'}{job.site ? ` · ${job.site}` : ''}</span>
                      <span className="acct-job-date">{job.updatedAt ? new Date(job.updatedAt).toLocaleDateString() : ''}</span>
                      <span className="acct-job-arrow">→</span>
                    </button>
                    <button
                      type="button"
                      className="acct-job-delete-btn"
                      title="Delete job"
                      onClick={() => {
                        const name = job.customer || job.site || 'this job'
                        if (!confirm(`Permanently delete "${name}"?\n\nAll survey, design, and go-live data for this job will be erased. Export the job file first if you need it later.`)) return
                        deleteJob(job.id)
                        setJobs(listJobsForAccount(accountId))
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showNewJob && createPortal(
        <div
          className="section-modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowNewJob(false)
          }}
        >
          <div className="section-modal" role="dialog" aria-modal="true" aria-labelledby="acct-new-job-title">
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">Account job</div>
                <h2 id="acct-new-job-title">New job</h2>
                <p>Pre-filled from this account — linked via account_id.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewJob(false)}>
                Cancel
              </button>
            </div>
            <div className="section-modal-body">
              <form className="new-job-form" onSubmit={submitNewJob}>
                <div className="job-type-picker">
                  {[
                    { value: 'install', label: 'New Install', desc: 'Site survey → design → go-live' },
                    { value: 'migration', label: 'Migration', desc: 'MCU → NetSapiens guided workflow' },
                  ].map(t => (
                    <button key={t.value} type="button"
                      className={`job-type-card${form.jobType === t.value ? ' is-selected' : ''}`}
                      onClick={() => setForm(f => ({ ...f, jobType: t.value }))}>
                      <div className="job-type-card-label">{t.label}</div>
                      <div className="job-type-card-desc">{t.desc}</div>
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>Site name</span>
                  <input
                    autoFocus
                    value={form.site}
                    onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
                    placeholder={account.site || 'e.g. Main Office'}
                  />
                </label>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary">Create job</button>
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

/** Optional helper for account picker when creating jobs elsewhere */
export function accountOptions() {
  try {
    return listAccounts()
  } catch {
    return []
  }
}
