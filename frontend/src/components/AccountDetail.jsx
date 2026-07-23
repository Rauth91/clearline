/**
 * AccountDetail — account parent with Call flow | Jobs tabs
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import AccountCallFlow from './AccountCallFlow.jsx'
import {
  createJob,
  listJobsForAccount,
  openJob,
} from '../lib/jobModel.js'
import { getAccount, listAccounts } from '../lib/accountModel.js'
import { navigate } from '../lib/router.js'

const TABS = [
  { id: 'flow', label: 'Call flow' },
  { id: 'jobs', label: 'Jobs' },
]

const STAGE_LABELS = {
  survey: 'Survey',
  design: 'Design',
  golive: 'Go-Live',
}

export default function AccountDetail({ accountId, refreshKey, onBack }) {
  const [tab, setTab] = useState('flow')
  const [account, setAccount] = useState(() => getAccount(accountId))
  const [jobs, setJobs] = useState(() => listJobsForAccount(accountId))
  const [showNewJob, setShowNewJob] = useState(false)
  const [form, setForm] = useState({ customer: '', site: '', ticket: '' })

  useEffect(() => {
    setAccount(getAccount(accountId))
    setJobs(listJobsForAccount(accountId))
    setTab('flow')
  }, [accountId, refreshKey])

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
    setForm({
      customer: account.name || '',
      site: account.site || '',
      ticket: '',
    })
    setShowNewJob(true)
  }

  function submitNewJob(e) {
    e?.preventDefault()
    const job = createJob({
      customer: form.customer.trim() || account.name || 'New job',
      site: form.site.trim() || account.site || '',
      ticket: form.ticket.trim(),
      account_id: account.id,
    })
    setShowNewJob(false)
    openJob(job.id)
    setJobs(listJobsForAccount(accountId))
    navigate(`/job/${job.id}`)
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

      {tab === 'jobs' && (
        <div className="account-detail-jobs">
          {jobs.length === 0 ? (
            <div className="empty-hint-action">
              <p>No jobs linked to this account yet.</p>
              <button type="button" className="btn btn-primary" onClick={openNewJob}>
                New job
              </button>
            </div>
          ) : (
            <div className="jobs-grid">
              {jobs.map(job => (
                <article key={job.id} className="job-card">
                  <button
                    type="button"
                    className="job-card-main"
                    onClick={() => {
                      openJob(job.id)
                      navigate(`/job/${job.id}`)
                    }}
                  >
                    <div className="job-card-top">
                      <div className="survey-kicker">{job.ticket || 'Job'}</div>
                      <span className="job-stage-badge">{STAGE_LABELS[job.stage] || 'Survey'}</span>
                    </div>
                    <h2>{job.customer || 'Untitled customer'}</h2>
                    <p>{job.site || 'Site TBD'}</p>
                  </button>
                </article>
              ))}
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
                <label className="field">
                  <span>Customer / company</span>
                  <input
                    autoFocus
                    value={form.customer}
                    onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Site name</span>
                  <input
                    value={form.site}
                    onChange={e => setForm(f => ({ ...f, site: e.target.value }))}
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
