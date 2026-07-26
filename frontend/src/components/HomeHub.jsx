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

const TOOL_HUBS = [
  {
    id: 'reference',
    label: 'Reference',
    blurb: 'Look things up',
    path: '/tools/reference',
    links: [
      { label: 'Yealink codes', path: '/tools/yealink' },
      { label: 'Codec & QoS', path: '/tools/codec' },
      { label: 'SIP response codes', path: '/tools/codec?tab=sip' },
      { label: 'Firmware', path: '/tools/reference/firmware' },
    ],
  },
  {
    id: 'troubleshoot',
    label: 'Troubleshoot',
    blurb: "Figure out what's wrong",
    path: '/tools/troubleshoot',
    links: [
      { label: 'Call Diagnostic', path: '/tools/calldiag' },
      { label: 'Packet Capture', path: '/tools/pcap' },
      { label: 'Network Check', path: '/tools/netcheck' },
      { label: 'Symptom Wizard', path: '/tools/symptom' },
    ],
  },
  {
    id: 'config',
    label: 'Config',
    blurb: 'Build configs and checklists',
    path: '/tools/config',
    links: [
      { label: 'Algo paging config', path: '/tools/config/algo' },
      { label: 'Port checklist', path: '/tools/config/ports' },
      { label: 'Quick card (end-user guide)', path: '/tools/config/quickcard' },
      { label: 'Router Advisor', path: '/tools/router' },
    ],
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
      // Defer so route paint settles before focusing the hero search.
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

  const urgent = useMemo(() => {
    if (!jobs.length) return null
    const rows = []
    for (const job of jobs) {
      try {
        rows.push(buildJobHealth(job))
      } catch (err) {
        console.error(err)
      }
    }
    return pickHomeUrgent(jobs, rows)
  }, [jobs])

  const greeting = `${greetingForHour()}.`
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
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
          <span>Search codes, tools, jobs…</span>
          <kbd>⌘K</kbd>
        </button>
      </section>

      <section className="home-toolkit-hubs" aria-label="Tools">
        {TOOL_HUBS.map(hub => (
          <article key={hub.id} className="home-hub-card">
            <button
              type="button"
              className="home-hub-card-title"
              onClick={() => navigate(hub.path)}
            >
              {hub.label}
            </button>
            <p className="home-hub-card-blurb">{hub.blurb}</p>
            <ul className="home-hub-card-links">
              {hub.links.map(link => (
                <li key={link.path}>
                  <button
                    type="button"
                    className="home-hub-sublink"
                    onClick={() => navigate(link.path)}
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {urgent && (
        <section className="home-jobs-strip" aria-label="Jobs">
          <button
            type="button"
            className="home-jobs-strip-line"
            onClick={() => navigate(urgent.route)}
          >
            {urgent.label}
          </button>
          <button
            type="button"
            className="home-jobs-strip-link"
            onClick={() => navigate('/jobs')}
          >
            Jobs
          </button>
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
