/**
 * Field runbook — one go-live install step at a time.
 * Route: #/job/:id/runbook
 */

import { useMemo, useState } from 'react'
import { mergeGoLive } from '../lib/goLiveModel.js'
import {
  getJob,
  loadJobGoLive,
  loadJobSurvey,
  saveJobGoLive,
} from '../lib/jobModel.js'
import { navigate } from '../lib/router.js'

function e911SurveyReady(survey) {
  const locs = survey?.e911Locations || []
  const named = (survey?.users || []).filter(u => String(u.name || '').trim())
  if (!locs.length) return false
  const locsOk = locs.every(l => String(l.name || '').trim() && String(l.address || '').trim())
  const assignOk = named.every(u => u.e911LocationId)
  return locsOk && (named.length === 0 || assignOk)
}

function gateInfo(item, golive, surveyReady) {
  if (!item?.gated) return { gated: false, reason: '' }
  if (item.id === 'e911-test') {
    if (!surveyReady) {
      return {
        gated: true,
        reason: 'Complete E911 locations and user assignments in Survey before this step.',
      }
    }
    if (!golive.e911Test?.testedAt) {
      return {
        gated: true,
        reason: 'Log a 911 test call in Go-Live before marking this step done.',
      }
    }
    return { gated: false, reason: '' }
  }
  if (item.id === 'e911' || item.id === 'e911-locs') {
    if (!surveyReady) {
      return {
        gated: true,
        reason: 'Complete E911 locations and user assignments in Survey before this step.',
      }
    }
  }
  return { gated: false, reason: '' }
}

export default function Runbook({ jobId, doneBy = '', profileDisplayName } = {}) {
  const stampName = String(profileDisplayName || doneBy || '').trim()
  const [tick, setTick] = useState(0)
  const [index, setIndex] = useState(0)

  const job = useMemo(() => (jobId ? getJob(jobId) : null), [jobId, tick])
  const survey = useMemo(() => (jobId ? loadJobSurvey(jobId) : null), [jobId, tick])
  const golive = useMemo(
    () => mergeGoLive(jobId ? loadJobGoLive(jobId) : null),
    [jobId, tick],
  )

  const items = golive.install?.items || []
  const total = items.length
  const safeIndex = total ? Math.min(Math.max(0, index), total - 1) : 0
  const step = items[safeIndex] || null
  const surveyReady = e911SurveyReady(survey)
  const gate = step ? gateInfo(step, golive, surveyReady) : { gated: false, reason: '' }
  const canDone = Boolean(step) && !gate.gated && !step.done

  function persist(next) {
    if (!jobId) return
    saveJobGoLive(jobId, next)
    setTick(t => t + 1)
  }

  function markDone() {
    if (!step || !canDone) return
    const next = {
      ...golive,
      install: {
        ...golive.install,
        items: (golive.install.items || []).map(row => (
          row.id === step.id
            ? {
              ...row,
              done: true,
              doneAt: new Date().toISOString(),
              doneBy: stampName || row.doneBy || '',
            }
            : row
        )),
      },
    }
    persist(next)
  }

  function goPrev() {
    setIndex(i => Math.max(0, i - 1))
  }

  function goNext() {
    setIndex(i => Math.min(Math.max(total - 1, 0), i + 1))
  }

  function exit() {
    if (jobId) navigate(`/job/${jobId}/golive`)
    else navigate('/jobs')
  }

  if (!jobId) {
    return (
      <div className="runbook">
        <p>No job selected.</p>
      </div>
    )
  }

  if (!total) {
    return (
      <div className="runbook">
        <header className="runbook-header">
          <div>
            <div className="survey-kicker">Runbook</div>
            <h1>{job?.customer || 'Go-Live'}</h1>
            <p>No install checklist items yet.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={exit}>
            Exit
          </button>
        </header>
      </div>
    )
  }

  return (
    <div className="runbook">
      <header className="runbook-header">
        <div>
          <div className="survey-kicker">Runbook</div>
          <h1>{job?.customer || 'Go-Live checklist'}</h1>
          <p className="runbook-progress">
            Step {safeIndex + 1} of {total}
            {job?.site ? ` · ${job.site}` : ''}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exit}>
          Exit
        </button>
      </header>

      <div className="runbook-stage" aria-live="polite">
        <div className={`runbook-step${gate.gated ? ' is-gated' : ''}${step.done ? ' is-done' : ''}`}>
          <div className="runbook-step-label">{step.label}</div>
          {step.notes ? <p className="runbook-step-notes">{step.notes}</p> : null}
          {gate.gated ? (
            <p className="runbook-gate-reason">{gate.reason}</p>
          ) : null}
          {step.done ? (
            <p className="runbook-done-meta">
              Done
              {step.doneAt ? ` · ${new Date(step.doneAt).toLocaleString()}` : ''}
              {step.doneBy ? ` · ${step.doneBy}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="runbook-actions">
        <button
          type="button"
          className="btn btn-secondary runbook-nav-btn"
          onClick={goPrev}
          disabled={safeIndex <= 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-primary runbook-done-btn"
          onClick={markDone}
          disabled={!canDone}
        >
          Done
        </button>
        <button
          type="button"
          className="btn btn-secondary runbook-nav-btn"
          onClick={goNext}
          disabled={safeIndex >= total - 1}
        >
          Next
        </button>
      </div>
    </div>
  )
}
