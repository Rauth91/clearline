/**
 * JobCockpit — job overview: pipeline %, chips, next actions, PortCard
 */

import { useEffect, useMemo, useState } from 'react'
import PortCard from './PortCard.jsx'
import {
  focChipStatus,
  getJob,
  getPort,
  jobNextActions,
  loadJobDesign,
  loadJobGoLive,
  loadJobSurvey,
  openJob,
  savePort,
} from '../lib/jobModel.js'
import { analyzeReadiness, computeVerdict } from '../lib/networkReadiness.js'
import { navigate } from '../lib/router.js'
import { getAccount } from '../lib/accountModel.js'
import { canApplyRemoteRefresh, onDataChanged } from '../lib/dataEvents.js'

function e911Chip(survey, golive) {
  const locs = survey?.e911Locations || []
  const users = (survey?.users || []).filter(u => String(u.name || '').trim())
  const tested = Boolean(golive?.e911Test?.testedAt)
  if (tested) return { status: 'pass', label: 'E911 tested' }
  if (locs.length && users.every(u => u.e911LocationId)) {
    return { status: 'warn', label: 'E911 assigned — test pending' }
  }
  if (users.length) return { status: 'warn', label: 'E911 incomplete' }
  return { status: 'info', label: 'E911 not started' }
}

export default function JobCockpit({ jobId, refreshKey }) {
  const [tick, setTick] = useState(0)
  void refreshKey

  const job = getJob(jobId)
  const survey = useMemo(() => loadJobSurvey(jobId), [jobId, tick, refreshKey])
  const design = useMemo(() => loadJobDesign(jobId), [jobId, tick, refreshKey])
  const golive = useMemo(() => loadJobGoLive(jobId), [jobId, tick, refreshKey])
  const port = useMemo(() => getPort(jobId), [jobId, tick, refreshKey])

  useEffect(() => {
    if (jobId) openJob(jobId)
  }, [jobId])

  useEffect(() => {
    if (!jobId) return undefined
    return onDataChanged(async (detail) => {
      if (detail.kind !== 'job') return
      if (!(detail.ids || []).includes(jobId)) return
      const ok = await canApplyRemoteRefresh(jobId)
      if (!ok) return
      setTick(t => t + 1)
    })
  }, [jobId])

  const account = job?.account_id ? getAccount(job.account_id) : null
  const readiness = useMemo(() => analyzeReadiness(survey), [survey])
  const seats = Math.max(
    1,
    Number(survey?.phoneCount) || (survey?.users || []).filter(u => u.name).length || 1,
  )
  const verdict = useMemo(() => computeVerdict({
    upMbps: readiness.summary.up ?? readiness.summary.speedUp,
    downMbps: readiness.summary.down ?? readiness.summary.speedDown,
    loss: readiness.summary.loss,
    jitter: readiness.summary.jitter,
    mos: readiness.summary.mos,
    rttMs: readiness.summary.rtt,
    sipAlg: survey?.visualware?.sipAlg,
  }, seats), [readiness, seats, survey])

  const next = useMemo(
    () => jobNextActions(survey, design, golive, { jobId, port }),
    [survey, design, golive, jobId, port],
  )

  const foc = focChipStatus(port, job?.foc_date)
  const e911 = e911Chip(survey, golive)

  if (!job) {
    return (
      <section className="job-cockpit">
        <p className="empty-hint-action">Job not found.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/jobs')}>
          All jobs
        </button>
      </section>
    )
  }

  const cutover = job.cutover_date || port.focDate || job.foc_date || '—'

  function go(path) {
    navigate(path)
  }

  return (
    <section className="job-cockpit">
      <header className="job-cockpit-header">
        <div>
          <div className="survey-kicker">Job cockpit</div>
          <h1>
            {job.customer || 'Untitled'}
            <span className="job-cockpit-sep"> — </span>
            {job.site || 'Site TBD'}
          </h1>
          {String(job.ticket || '').trim() ? (
            <span className="job-ticket-chip">
              Ticket #{String(job.ticket).trim().replace(/^#\s*/, '')}
            </span>
          ) : null}
          <p>
            {seats} seat{seats === 1 ? '' : 's'}
            {` · Cutover ${cutover}`}
            {account ? (
              <>
                {' · '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => navigate(`/account/${account.id}`)}
                >
                  {account.name || 'Account'}
                </button>
              </>
            ) : null}
          </p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/jobs')}>
            All jobs
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => go(`/job/${jobId}/runbook`)}>
            Runbook
          </button>
        </div>
      </header>

      <div className="cockpit-pipeline" aria-label="Pipeline progress">
        <PipelineStep
          label="Survey"
          pct={next.survey.pct}
          onClick={() => go(`/job/${jobId}/survey`)}
        />
        <div className="cockpit-pipeline-rail" />
        <PipelineStep
          label="Design"
          pct={next.design.pct}
          onClick={() => go(`/job/${jobId}/design`)}
        />
        <div className="cockpit-pipeline-rail" />
        <PipelineStep
          label="Go-live"
          pct={next.golive.pct}
          onClick={() => go(`/job/${jobId}/golive`)}
        />
      </div>

      <div className="cockpit-chips" aria-label="Status chips">
        <StatusChip
          label="Network"
          status={verdict.status}
          detail={verdict.callsSupported != null
            ? `${verdict.callsSupported} calls / ${verdict.callsNeeded} seats`
            : verdict.reasons[0]}
        />
        <StatusChip label="Port FOC" status={foc.status === 'fail' ? 'fail' : foc.status === 'pass' ? 'pass' : foc.status === 'warn' ? 'warn' : 'info'} detail={foc.label} />
        <StatusChip label="E911" status={e911.status} detail={e911.label} />
      </div>

      <div className="cockpit-grid">
        <div className="cockpit-panel">
          <div className="panel-head">
            <div className="survey-kicker">Next</div>
            <h2>Actions</h2>
          </div>
          {next.actions.length === 0 ? (
            <p className="muted">Nothing blocking — ready to proceed.</p>
          ) : (
            <ul className="cockpit-actions">
              {next.actions.slice(0, 8).map(action => (
                <li key={action.id}>
                  <button
                    type="button"
                    className={`cockpit-action severity-${action.severity}`}
                    onClick={() => navigate(action.route)}
                  >
                    <span className="cockpit-action-sev">{action.severity}</span>
                    <span>{action.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => go(`/job/${jobId}/survey`)}>
              Survey
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => go(`/job/${jobId}/design`)}>
              Design
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => go(`/job/${jobId}/golive`)}>
              Go-live
            </button>
          </div>
        </div>

        <PortCard
          jobId={jobId}
          port={port}
          survey={survey}
          onSave={(nextPort) => {
            savePort(jobId, nextPort)
            setTick(t => t + 1)
          }}
        />
      </div>
    </section>
  )
}

function PipelineStep({ label, pct, onClick }) {
  return (
    <button type="button" className="cockpit-pipeline-step" onClick={onClick}>
      <strong>{label}</strong>
      <span>{pct}%</span>
      <div className="cockpit-pipeline-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </button>
  )
}

function StatusChip({ label, status, detail }) {
  return (
    <div className={`cockpit-chip status-${status}`}>
      <span className="cockpit-chip-label">{label}</span>
      <strong>{detail}</strong>
    </div>
  )
}
