/**
 * HomeHub — ops dashboard: jobs by phase, search, quick actions.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeJobStatus,
  greetingForHour,
  jobWorkspacePath,
  listJobs,
  openJob,
} from '../lib/jobModel.js'
import { navigate } from '../lib/router.js'
import { onDataChanged } from '../lib/dataEvents.js'

const QUICK_ACTIONS = [
  {
    id: 'accounts',
    label: 'Accounts',
    blurb: 'Customer records, jobs, and call flows',
    icon: '🏢',
    path: '/accounts',
    cta: 'View accounts',
  },
  {
    id: 'tools',
    label: 'Tools',
    blurb: 'Diagnose, configure, and reference',
    icon: '🔧',
    path: '/tools/callanalysis',
    cta: 'Open tools',
  },
]

const STATUS_COLS = [
  { id: 'survey',  label: 'Survey',  blurb: 'Site visit needed',      cls: 'is-survey'  },
  { id: 'design',  label: 'Design',  blurb: 'System design pending',   cls: 'is-design'  },
  { id: 'install', label: 'Install', blurb: 'Ready to provision',      cls: 'is-install' },
]

export default function HomeHub({ refreshKey, onOpenSearch }) {
  const searchRef = useRef(null)
  const [tick, setTick] = useState(0)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => onDataChanged((detail) => {
    if (detail.kind !== 'job') return
    if (!(detail.ids || []).length) return
    setTick(t => t + 1)
  }), [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const desktop = window.matchMedia('(min-width: 901px)').matches
    if (desktop) {
      const id = window.requestAnimationFrame(() => searchRef.current?.focus())
      return () => window.cancelAnimationFrame(id)
    }
    return undefined
  }, [])

  const jobs = useMemo(() => {
    try { return listJobs() } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, tick])

  const grouped = useMemo(() => {
    const groups = { survey: [], design: [], install: [], complete: [] }
    for (const job of jobs) {
      const status = computeJobStatus(job.id)
      groups[status].push(job)
    }
    return groups
  }, [jobs])

  const activeCount = grouped.survey.length + grouped.design.length + grouped.install.length

  const greeting = `${greetingForHour()}.`
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  function openSearch() {
    if (typeof onOpenSearch === 'function') onOpenSearch()
  }

  function goJob(job) {
    openJob(job.id)
    navigate(jobWorkspacePath(job))
  }

  return (
    <div className="home-toolkit">
      <header className="home-toolkit-header">
        <span className="home-toolkit-greeting">{greeting}</span>
        <span className="home-toolkit-date">{dateLabel}</span>
      </header>

      <section className="home-toolkit-search" aria-label="Search">
        <button
          ref={searchRef}
          type="button"
          className="home-toolkit-search-bar"
          onClick={openSearch}
          aria-label="Search jobs, tools, accounts"
        >
          <span>Search jobs, tools, accounts…</span>
          <kbd>⌘K</kbd>
        </button>
      </section>

      <section className="home-actions" aria-label="Quick actions">
        {QUICK_ACTIONS.map(a => (
          <button key={a.id} type="button" className="home-action-card" onClick={() => navigate(a.path)}>
            <div className="home-action-icon">{a.icon}</div>
            <div className="home-action-body">
              <div className="home-action-label">{a.label}</div>
              <div className="home-action-blurb">{a.blurb}</div>
            </div>
            <div className="home-action-cta">{a.cta} →</div>
          </button>
        ))}
      </section>

      {jobs.length === 0 && (
        <section className="home-empty" aria-label="Get started">
          <p className="home-empty-text">Start with an account, then add install or migration jobs under it.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/accounts', { query: { new: '1' } })}>
            + New account
          </button>
        </section>
      )}

      {jobs.length > 0 && (
        <section className="home-ops-board" aria-label="Active jobs">
          <div className="home-ops-board-header">
            <span className="home-ops-board-title">
              Active jobs
              {activeCount > 0 && <span className="home-ops-total">{activeCount}</span>}
            </span>
            <button type="button" className="home-recent-all" onClick={() => navigate('/accounts')}>
              All accounts →
            </button>
          </div>

          <div className="home-ops-columns">
            {STATUS_COLS.map(col => (
              <div key={col.id} className={`home-ops-col ${col.cls}`}>
                <div className="home-ops-col-head">
                  <span className="home-ops-col-title">{col.label}</span>
                  <span className="home-ops-col-count">{grouped[col.id].length}</span>
                </div>
                {grouped[col.id].length === 0 ? (
                  <p className="home-ops-col-empty">{col.blurb}</p>
                ) : (
                  grouped[col.id].map(job => (
                    <button key={job.id} type="button" className="home-ops-job" onClick={() => goJob(job)}>
                      <span className="home-ops-job-name">{job.customer || 'Untitled'}</span>
                      <span className="home-ops-job-meta">
                        {[job.site, job.jobType === 'migration' ? 'Migration' : 'Install'].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>

          {grouped.complete.length > 0 && (
            <div className="home-ops-done-row">
              <button type="button" className="home-ops-done-toggle" onClick={() => setShowDone(v => !v)}>
                {showDone ? '▾' : '▸'} {grouped.complete.length} completed job{grouped.complete.length !== 1 ? 's' : ''}
              </button>
              {showDone && (
                <div className="home-ops-done-list">
                  {grouped.complete.map(job => (
                    <button key={job.id} type="button" className="home-ops-job is-done" onClick={() => goJob(job)}>
                      <span className="home-ops-job-name">{job.customer || 'Untitled'}</span>
                      <span className="home-ops-job-meta">
                        {[job.site, job.jobType === 'migration' ? 'Migration' : 'Install'].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
