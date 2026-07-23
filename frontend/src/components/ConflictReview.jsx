import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getJobRecord, resolveConflict } from '../lib/repo.js'

const SECTION_LABELS = {
  survey: 'Site Survey',
  design: 'System Design',
  golive: 'Go-Live',
}

function summarize(value, max = 480) {
  if (value == null) return '(empty)'
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    if (text.length <= max) return text
    return `${text.slice(0, max)}…`
  } catch {
    return String(value)
  }
}

function conflictKeys(job) {
  if (!job?.conflicts || typeof job.conflicts !== 'object') return []
  return Object.keys(job.conflicts).filter(k => job.conflicts[k])
}

/**
 * Modal to resolve per-section sync conflicts on a job.
 */
export default function ConflictReview({ jobId, onClose, onResolved }) {
  const [job, setJob] = useState(() => getJobRecord(jobId))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setJob(getJobRecord(jobId))
    setError(null)
  }, [jobId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sections = conflictKeys(job)

  async function choose(section, choice) {
    setBusy(`${section}:${choice}`)
    setError(null)
    try {
      await resolveConflict(jobId, section, choice)
      const next = getJobRecord(jobId)
      setJob(next)
      onResolved?.(section, choice)
      if (!conflictKeys(next).length) onClose?.()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not resolve conflict')
    } finally {
      setBusy(null)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="section-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="section-modal section-modal-wide conflict-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-review-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="section-modal-head">
          <div>
            <div className="survey-kicker">Sync conflict</div>
            <h2 id="conflict-review-title">Review changes</h2>
            <p>
              Someone else saved this job while your edits were offline or in flight.
              Choose whose version to keep for each section.
            </p>
          </div>
          <div className="section-modal-nav">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="section-modal-body">
          {error && <div className="parse-note parse-error">{error}</div>}
          {sections.length === 0 ? (
            <p className="conflict-empty">No open conflicts on this job.</p>
          ) : (
            sections.map((section) => {
              const info = job.conflicts[section]
              const label = SECTION_LABELS[section] || section
              return (
                <div key={section} className="conflict-section">
                  <div className="conflict-section-head">
                    <h3>{label}</h3>
                    {info?.serverRev != null && (
                      <small>Server rev {info.serverRev}</small>
                    )}
                  </div>
                  <div className="conflict-compare">
                    <div className="conflict-pane">
                      <div className="conflict-pane-label">Yours (device)</div>
                      <pre>{summarize(info?.local ?? job[section])}</pre>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={Boolean(busy)}
                        onClick={() => choose(section, 'mine')}
                      >
                        {busy === `${section}:mine` ? 'Saving…' : 'Keep mine'}
                      </button>
                    </div>
                    <div className="conflict-pane">
                      <div className="conflict-pane-label">Theirs (server)</div>
                      <pre>{summarize(info?.server)}</pre>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={Boolean(busy)}
                        onClick={() => choose(section, 'theirs')}
                      >
                        {busy === `${section}:theirs` ? 'Saving…' : 'Take theirs'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Banner + modal opener for workspaces that edit job sections.
 */
export function ConflictBanner({ jobId, onResolved }) {
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const job = tick >= 0 ? getJobRecord(jobId) : null
  const hasConflicts = conflictKeys(job).length > 0

  if (!jobId || (!hasConflicts && !open)) return null

  return (
    <>
      {hasConflicts && (
        <div className="parse-note parse-warn conflict-banner" role="status">
          <span>This job has sync conflicts that need review before cloud sync can continue.</span>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            Review conflicts
          </button>
        </div>
      )}
      {open && (
        <ConflictReview
          jobId={jobId}
          onClose={() => setOpen(false)}
          onResolved={(section, choice) => {
            setTick(t => t + 1)
            onResolved?.(section, choice)
            if (!conflictKeys(getJobRecord(jobId)).length) setOpen(false)
          }}
        />
      )}
    </>
  )
}
