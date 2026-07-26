/**
 * JobDayNarrative — greeting + status, blocker, this week, recently.
 * Used on home when FEATURES.jobFirstHome, or as Jobs hub header otherwise.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  describeDay,
  getPort,
  greetingForHour,
  jobCompletion,
  jobNextActions,
  listJobs,
  loadJobDesign,
  loadJobGoLive,
  loadJobSurvey,
  pickTopBlocker,
  focChipStatus,
} from '../lib/jobModel.js'
import { navigate } from '../lib/router.js'
import { onDataChanged } from '../lib/dataEvents.js'
import { authEnabled, getCachedOrgMembers, getCachedProfile } from '../lib/authModel.js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { analyzeReadiness, computeVerdict } from '../lib/networkReadiness.js'

const STAGE_LABELS = {
  survey: 'Survey',
  design: 'Design',
  golive: 'Go-Live',
}

const EVENT_LABELS = {
  'section.save': 'Saved section',
  'stage.change': 'Changed stage',
  'assignment.change': 'Changed assignee',
  'job.create': 'Created job',
}

function jobSortKey(job) {
  return job.cutover_date || job.foc_date || job.updatedAt || ''
}

function formatJobDate(job) {
  const raw = job.cutover_date || job.foc_date
  if (!raw) return 'No date'
  try {
    return new Date(`${raw}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return raw
  }
}

function daysUntil(iso, now = new Date()) {
  if (!iso) return null
  const target = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function inThisWeek(job, now = new Date()) {
  const d = daysUntil(job.cutover_date || job.foc_date, now)
  return d != null && d >= 0 && d <= 7
}

function formatWhen(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return new Date(iso).toLocaleString()
}

function describeEvent(ev, nameById, jobById) {
  const actor = nameById.get(ev.actor) || 'Someone'
  const jobName = jobById.get(ev.job_id)?.customer || 'a job'
  const detail = ev.detail || {}
  if (ev.type === 'section.save' && detail.section) {
    return `${actor} saved ${detail.section} on ${jobName}`
  }
  if (ev.type === 'stage.change') {
    return `${actor} set ${jobName} to ${detail.stage || '—'}`
  }
  if (ev.type === 'assignment.change') {
    const to = detail.assigned_to
      ? (nameById.get(detail.assigned_to) || 'teammate')
      : 'Unassigned'
    return `${actor} assigned ${jobName} to ${to}`
  }
  if (ev.type === 'job.create') {
    return `${actor} created ${jobName}`
  }
  return `${actor}: ${EVENT_LABELS[ev.type] || ev.type} · ${jobName}`
}

function e911Chip(survey, golive) {
  const locs = survey?.e911Locations || []
  const users = (survey?.users || []).filter(u => String(u.name || '').trim())
  const tested = Boolean(golive?.e911Test?.testedAt)
  if (tested) return { status: 'pass', label: 'E911 tested' }
  if (locs.length && users.every(u => u.e911LocationId)) {
    return { status: 'warn', label: 'E911 assigned' }
  }
  if (users.length) return { status: 'warn', label: 'E911 incomplete' }
  return { status: 'info', label: 'E911' }
}

export function buildJobHealth(job) {
  const survey = loadJobSurvey(job.id)
  const design = loadJobDesign(job.id)
  const golive = loadJobGoLive(job.id)
  const port = getPort(job.id)
  const next = jobNextActions(survey, design, golive, { jobId: job.id, port })
  const readiness = analyzeReadiness(survey)
  const seats = Math.max(
    1,
    Number(survey?.phoneCount) || (survey?.users || []).filter(u => u.name).length || 1,
  )
  const verdict = computeVerdict({
    upMbps: readiness.summary.up ?? readiness.summary.speedUp,
    downMbps: readiness.summary.down ?? readiness.summary.speedDown,
    loss: readiness.summary.loss,
    jitter: readiness.summary.jitter,
    mos: readiness.summary.mos,
    rttMs: readiness.summary.rtt,
    sipAlg: survey?.visualware?.sipAlg,
  }, seats)
  const foc = focChipStatus(port, job.foc_date)
  const e911 = e911Chip(survey, golive)
  const pipeline = jobCompletion(job.id)
  const blockerCount = next.actions.filter(a => a.severity === 'blocker').length
  return {
    job: { ...job, blockerCount },
    actions: next.actions,
    surveyPct: next.survey.pct,
    designPct: next.design.pct,
    golivePct: next.golive.pct,
    pipeline,
    verdict,
    foc,
    e911,
    blockerCount,
  }
}

function chipStatus(foc) {
  if (!foc) return 'info'
  if (foc.status === 'fail') return 'fail'
  if (foc.status === 'pass') return 'pass'
  if (foc.status === 'warn') return 'warn'
  return 'info'
}

/**
 * @param {{
 *   profileId?: string,
 *   refreshKey?: number,
 *   profile?: object|null,
 *   variant?: 'home' | 'jobs',
 *   onOpenSearch?: () => void,
 * }} props
 */
export default function JobDayNarrative({
  profileId,
  refreshKey,
  profile: profileProp,
  variant = 'home',
  onOpenSearch,
}) {
  const [tick, setTick] = useState(0)
  const [scope, setScope] = useState('mine')
  const [profile, setProfile] = useState(profileProp || null)
  const [members, setMembers] = useState([])
  const [recent, setRecent] = useState([])

  useEffect(() => {
    if (profileProp) setProfile(profileProp)
  }, [profileProp])

  useEffect(() => onDataChanged((detail) => {
    if (detail.kind !== 'job') return
    if (!(detail.ids || []).length) return
    setTick(t => t + 1)
  }), [])

  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      try {
        const [p, cached] = await Promise.all([
          profileProp ? Promise.resolve(profileProp) : getCachedProfile(),
          getCachedOrgMembers(),
        ])
        if (cancelled) return
        if (p) setProfile(p)
        setMembers(cached || [])
      } catch { /* offline */ }
    }
    loadMeta()
    return () => { cancelled = true }
  }, [refreshKey, profileProp, tick])

  useEffect(() => {
    if (!authEnabled()) {
      setRecent([])
      return undefined
    }
    let cancelled = false
    async function loadRecent() {
      if (!isSupabaseConfigured || !navigator.onLine) {
        if (!cancelled) setRecent([])
        return
      }
      const sb = getSupabase()
      if (!sb) {
        if (!cancelled) setRecent([])
        return
      }
      const { data, error } = await sb
        .from('job_events')
        .select('id, job_id, actor, type, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) {
        console.error(error)
        if (!cancelled) setRecent([])
        return
      }
      if (!cancelled) setRecent(data || [])
    }
    loadRecent().catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [refreshKey, tick])

  const allJobs = useMemo(() => {
    try {
      return listJobs()
    } catch {
      return []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, tick])

  const myJobs = useMemo(() => {
    const pid = profile?.id || profileId
    if (!pid) return allJobs
    const mine = allJobs.filter(j => j.assigned_to === pid)
    return mine.length ? mine : allJobs
  }, [allJobs, profile, profileId])

  const healthById = useMemo(() => {
    const map = new Map()
    for (const job of allJobs) {
      try {
        map.set(job.id, buildJobHealth(job))
      } catch (err) {
        console.error(err)
      }
    }
    return map
  }, [allJobs])

  const describeJobs = useMemo(() => myJobs.map((j) => {
    const h = healthById.get(j.id)
    return { ...j, blockerCount: h?.blockerCount || 0 }
  }), [myJobs, healthById])

  const sentence = useMemo(
    () => describeDay(describeJobs, profile),
    [describeJobs, profile],
  )

  const topBlocker = useMemo(() => {
    const rows = myJobs.map(j => healthById.get(j.id)).filter(Boolean)
    return pickTopBlocker(rows)
  }, [myJobs, healthById])

  const weekJobs = useMemo(() => {
    const pool = scope === 'all' ? allJobs : myJobs
    const withDates = pool.filter(j => inThisWeek(j))
    const list = withDates.length ? withDates : pool
    return [...list].sort((a, b) => String(jobSortKey(a)).localeCompare(String(jobSortKey(b))))
  }, [scope, allJobs, myJobs])

  const nameById = useMemo(
    () => new Map((members || []).map(m => [m.id, m.display_name])),
    [members],
  )
  const jobById = useMemo(
    () => new Map(allJobs.map(j => [j.id, j])),
    [allJobs],
  )

  const displayName = profile?.display_name || 'tech'
  const greeting = `${greetingForHour()}, ${displayName}`
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  function openSearch() {
    if (typeof onOpenSearch === 'function') onOpenSearch()
  }

  return (
    <div className={`my-day${variant === 'jobs' ? ' my-day-embedded' : ''}`}>
      <header className="my-day-header my-day-greeting">
        <div>
          <div className="survey-kicker">{dateLabel}</div>
          <h1>{greeting}</h1>
          <p className="my-day-status">{sentence}</p>
        </div>
        {variant === 'home' && (
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/jobs')}>
            All jobs
          </button>
        )}
      </header>

      {topBlocker && (
        <section className="my-day-blocker" aria-label="Urgent blocker">
          <div className="my-day-blocker-card">
            <div>
              <div className="survey-kicker">Blocker</div>
              <h2>{topBlocker.job.customer || 'Untitled job'}</h2>
              <p>{topBlocker.action.label}</p>
            </div>
            <div className="my-day-blocker-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(topBlocker.action.route)}
              >
                Fix now
              </button>
              {topBlocker.moreCount > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/jobs', { query: { filter: 'mine', blocked: '1' } })}
                >
                  +{topBlocker.moreCount} more
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="my-day-week" aria-label="This week">
        <div className="my-day-week-head">
          <div>
            <span className="survey-kicker">Schedule</span>
            <h2>This week</h2>
          </div>
          <div className="my-day-scope" role="group" aria-label="Job scope">
            <button
              type="button"
              className={`my-day-scope-btn${scope === 'mine' ? ' is-active' : ''}`}
              onClick={() => setScope('mine')}
            >
              My jobs
            </button>
            <button
              type="button"
              className={`my-day-scope-btn${scope === 'all' ? ' is-active' : ''}`}
              onClick={() => setScope('all')}
            >
              All
            </button>
          </div>
        </div>

        {weekJobs.length === 0 ? (
          <div className="empty-hint-action my-day-jobs-empty">
            <p>No jobs on your plate yet.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/jobs', { query: { new: '1' } })}
            >
              New job
            </button>
          </div>
        ) : (
          <div className="my-day-job-list">
            {weekJobs.map((job) => {
              const health = healthById.get(job.id)
              const assignee = job.assigned_to
                ? (nameById.get(job.assigned_to) || 'Assigned')
                : 'Unassigned'
              return (
                <button
                  key={job.id}
                  type="button"
                  className="my-day-job-card my-day-job-card-rich"
                  onClick={() => navigate(`/job/${job.id}`)}
                >
                  <div className="my-day-job-main">
                    <strong>{job.customer || 'Untitled customer'}</strong>
                    <span>{job.site || 'Site TBD'} · {assignee}</span>
                    <div className="my-day-pipeline" aria-hidden="true">
                      <span className={health?.pipeline?.survey ? 'is-done' : ''}>S</span>
                      <span className={health?.pipeline?.design ? 'is-done' : ''}>D</span>
                      <span className={health?.pipeline?.golive ? 'is-done' : ''}>G</span>
                    </div>
                    <div className="my-day-mini-chips">
                      <span className={`status-pill status-${health?.verdict?.status || 'info'}`}>
                        Net
                      </span>
                      <span className={`status-pill status-${chipStatus(health?.foc)}`}>
                        FOC
                      </span>
                      <span className={`status-pill status-${health?.e911?.status || 'info'}`}>
                        E911
                      </span>
                      {health?.blockerCount > 0 && (
                        <span className="status-pill status-fail">{health.blockerCount} block</span>
                      )}
                    </div>
                  </div>
                  <div className="my-day-job-meta">
                    <span className="job-stage-badge">{STAGE_LABELS[job.stage] || job.stage || 'Survey'}</span>
                    <span className="my-day-job-date">{formatJobDate(job)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {authEnabled() && (
        <section className="my-day-recent" aria-label="Recent activity">
          <div className="my-day-week-head">
            <div>
              <span className="survey-kicker">Org</span>
              <h2>Recently</h2>
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="my-day-recent-empty">
              {isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine
                ? 'No recent activity yet.'
                : 'Activity shows when online with sync enabled.'}
            </p>
          ) : (
            <ul className="my-day-recent-list">
              {recent.map(ev => (
                <li key={ev.id}>
                  <button
                    type="button"
                    className="my-day-recent-item"
                    onClick={() => ev.job_id && navigate(`/job/${ev.job_id}`)}
                  >
                    <span>{describeEvent(ev, nameById, jobById)}</span>
                    <time>{formatWhen(ev.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {variant === 'home' && typeof onOpenSearch === 'function' && (
        <section className="my-day-search" aria-label="Search">
          <button
            type="button"
            className="my-day-search-bar"
            onClick={openSearch}
            aria-label="Open command palette search"
          >
            <span>Search jobs, tools, accounts…</span>
            <kbd>⌘K</kbd>
          </button>
        </section>
      )}
    </div>
  )
}
