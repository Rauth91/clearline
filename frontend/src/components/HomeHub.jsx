/**
 * HomeHub — toolkit-first by default; job-narrative when FEATURES.jobFirstHome.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  greetingForHour,
  listJobs,
  pickHomeUrgent,
} from '../lib/jobModel.js'
import { FEATURES } from '../lib/features.js'
import { navigate } from '../lib/router.js'
import { onDataChanged } from '../lib/dataEvents.js'
import JobDayNarrative, { buildJobHealth } from './JobDayNarrative.jsx'

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
    path: '/tools/calldiag',
    cta: 'Open tools',
  },
]

function ToolkitHome({ refreshKey, onOpenSearch }) {
  const searchRef = useRef(null)
  const [tick, setTick] = useState(0)

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
    try {
      return listJobs()
    } catch {
      return []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, tick])

  const recentJobs = useMemo(() => jobs.slice(0, 5), [jobs])

  const urgent = useMemo(() => {
    if (!jobs.length) return null
    const rows = []
    for (const job of jobs) {
      try { rows.push(buildJobHealth(job)) } catch (err) { console.error(err) }
    }
    return pickHomeUrgent(jobs, rows)
  }, [jobs])

  const greeting = `${greetingForHour()}.`
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  function openSearch() {
    if (typeof onOpenSearch === 'function') onOpenSearch()
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

      {/* Quick action cards */}
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

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <section className="home-recent" aria-label="Recent jobs">
          <div className="home-recent-header">
            <span className="home-recent-title">Recent jobs</span>
            <button type="button" className="home-recent-all" onClick={() => navigate('/jobs')}>All jobs →</button>
          </div>
          {recentJobs.map(job => {
            const isMig = job.jobType === 'migration'
            const route = isMig ? `/job/${job.id}/migration` : `/job/${job.id}`
            return (
              <button key={job.id} type="button" className="home-recent-row" onClick={() => navigate(route)}>
                <span className={`home-recent-type${isMig ? ' is-migration' : ''}`}>{isMig ? 'Migration' : 'Install'}</span>
                <span className="home-recent-name">{job.customer || 'Unnamed'}{job.site ? ` · ${job.site}` : ''}</span>
                <span className="home-recent-arrow">→</span>
              </button>
            )
          })}
        </section>
      )}

      {recentJobs.length === 0 && (
        <section className="home-empty" aria-label="Get started">
          <p className="home-empty-text">No jobs yet — create one to get started.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/jobs?new=1')}>+ New job</button>
        </section>
      )}
    </div>
  )
}

export default function HomeHub({ profileId, refreshKey, profile, onOpenSearch }) {
  if (FEATURES.jobFirstHome) {
    return (
      <JobDayNarrative
        profileId={profileId}
        refreshKey={refreshKey}
        profile={profile}
        variant="home"
        onOpenSearch={onOpenSearch}
      />
    )
  }
  return <ToolkitHome refreshKey={refreshKey} onOpenSearch={onOpenSearch} />
}
