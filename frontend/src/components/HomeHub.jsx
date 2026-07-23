/**
 * HomeHub — My day: assigned jobs + hub shortcuts
 */

import { useMemo } from 'react'
import { listJobs } from '../lib/jobModel.js'
import { navigate } from '../lib/router.js'

const QUICK_LINKS = [
  {
    path: '/tools/reference',
    label: 'Reference hub',
    desc: 'Yealink + codecs + SIP codes search',
  },
  {
    path: '/tools/troubleshoot',
    label: 'Troubleshoot hub',
    desc: 'Symptom Wizard + Call Diagnostic',
  },
  {
    path: '/tools/config',
    label: 'Config hub',
    desc: 'Algo Config, Port Checklist, Quick Card',
  },
]

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

const STAGE_LABELS = {
  survey: 'Survey',
  design: 'Design',
  golive: 'Go-Live',
}

export default function HomeHub({ profileId, refreshKey }) {
  const jobs = useMemo(() => {
    try {
      let list = listJobs()
      if (profileId) {
        const mine = list.filter(j => j.assigned_to === profileId)
        list = mine.length ? mine : list
      }
      return [...list].sort((a, b) => String(jobSortKey(a)).localeCompare(String(jobSortKey(b))))
    } catch {
      return []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, profileId])

  return (
    <div className="my-day">
      <header className="my-day-header">
        <div>
          <div className="survey-kicker">Home</div>
          <h1>My day</h1>
          <p>Jobs on your plate, sorted by cutover and FOC.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/jobs')}>
          All jobs
        </button>
      </header>

      <section className="my-day-jobs" aria-label="Jobs on your plate">
        {jobs.length === 0 ? (
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
            {jobs.map(job => (
              <button
                key={job.id}
                type="button"
                className="my-day-job-card"
                onClick={() => navigate(`/job/${job.id}`)}
              >
                <div className="my-day-job-main">
                  <strong>{job.customer || 'Untitled customer'}</strong>
                  <span>{job.site || 'Site TBD'}</span>
                </div>
                <div className="my-day-job-meta">
                  <span className="job-stage-badge">{STAGE_LABELS[job.stage] || job.stage || 'Survey'}</span>
                  <span className="my-day-job-date">{formatJobDate(job)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="my-day-quick" aria-label="Tool hubs">
        <div className="my-day-quick-heading">
          <span className="survey-kicker">Shortcuts</span>
          <h2>Tools</h2>
        </div>
        <div className="my-day-quick-grid my-day-quick-grid-3">
          {QUICK_LINKS.map(link => (
            <button
              key={link.path}
              type="button"
              className="my-day-quick-card"
              onClick={() => navigate(link.path)}
            >
              <strong>{link.label}</strong>
              <span>{link.desc}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
