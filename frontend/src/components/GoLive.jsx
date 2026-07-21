import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ProvisioningSheet, { buildProvisionData } from './ProvisioningSheet.jsx'
import {
  createEmptyGoLive,
  downloadGoLivePdf,
  exportGoLiveDoc,
  exportGoLiveHtml,
  goLiveCompletionPercent,
  mergeGoLive,
  sectionProgressGoLive,
} from '../lib/goLiveModel.js'
import {
  getJob,
  jobCompletion,
  loadJobDesign,
  loadJobGoLive,
  loadJobSurvey,
  saveJobGoLive,
} from '../lib/jobModel.js'

const PANELS = [
  ['cutover', 'Cutover', 'Port date, window, sequence, rollback, and customer comms'],
  ['install', 'Install', 'VLAN, QoS, phones, programming, and smoke tests'],
  ['provision', 'Provision', 'Build sheet from Survey + Design for PBX programming'],
  ['handoff', 'Handoff', 'Training, admin contacts, escalation, and sign-off'],
]

export default function GoLive({ jobId }) {
  const [golive, setGolive] = useState(() => mergeGoLive(loadJobGoLive(jobId)))
  const [activePanel, setActivePanel] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const job = getJob(jobId)
  const [surveyTick, setSurveyTick] = useState(0)
  const survey = useMemo(() => loadJobSurvey(jobId), [jobId, surveyTick])
  const design = useMemo(() => loadJobDesign(jobId), [jobId, surveyTick])
  const pipeline = jobCompletion(jobId)
  const provision = useMemo(() => buildProvisionData(survey, design), [survey, design])

  useEffect(() => {
    setGolive(mergeGoLive(loadJobGoLive(jobId)))
    setActivePanel(null)
    setSurveyTick(t => t + 1)
  }, [jobId])

  useEffect(() => {
    if (activePanel === 'provision') setSurveyTick(t => t + 1)
  }, [activePanel])

  const latestGoLive = useRef(golive)
  latestGoLive.current = golive

  useEffect(() => {
    if (!jobId) return undefined
    const t = setTimeout(() => {
      saveJobGoLive(jobId, latestGoLive.current)
    }, 450)
    return () => clearTimeout(t)
  }, [golive, jobId])

  useEffect(() => () => {
    if (jobId) saveJobGoLive(jobId, latestGoLive.current)
  }, [jobId])

  useEffect(() => {
    if (!activePanel) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        setActivePanel(null)
        return
      }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const delta = e.key === 'ArrowRight' ? 1 : -1
      setActivePanel(current => {
        if (!current) return current
        const idx = PANELS.findIndex(([id]) => id === current)
        if (idx < 0) return current
        const next = PANELS[idx + delta]
        return next ? next[0] : current
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePanel])

  const provisionRatio = provision.hasData ? 1 : 0
  const percent = goLiveCompletionPercent(golive, provisionRatio)

  const chips = useMemo(() => PANELS.map(([id, title]) => {
    if (id === 'provision') {
      return { id, title, filled: provision.hasData ? 1 : 0, total: 1, ratio: provisionRatio }
    }
    return { id, title, ...sectionProgressGoLive(golive, id) }
  }), [golive, provision.hasData, provisionRatio])

  const panelMeta = activePanel ? PANELS.find(([id]) => id === activePanel) : null
  const panelIndex = activePanel ? PANELS.findIndex(([id]) => id === activePanel) : -1

  function movePanel(delta) {
    setActivePanel(current => {
      if (!current) return current
      const idx = PANELS.findIndex(([id]) => id === current)
      if (idx < 0) return current
      const next = PANELS[idx + delta]
      return next ? next[0] : current
    })
  }

  function updateCutover(field, value) {
    setGolive(prev => ({ ...prev, cutover: { ...prev.cutover, [field]: value } }))
  }

  function updateHandoff(field, value) {
    setGolive(prev => ({ ...prev, handoff: { ...prev.handoff, [field]: value } }))
  }

  function toggleInstall(id) {
    setGolive(prev => ({
      ...prev,
      install: {
        ...prev.install,
        items: (prev.install.items || []).map(item => (
          item.id === id ? { ...item, done: !item.done } : item
        )),
      },
    }))
  }

  function updateInstallNote(id, notes) {
    setGolive(prev => ({
      ...prev,
      install: {
        ...prev.install,
        items: (prev.install.items || []).map(item => (
          item.id === id ? { ...item, notes } : item
        )),
      },
    }))
  }

  function reset() {
    if (!confirm('Clear Go-Live for this job?')) return
    setGolive(createEmptyGoLive())
    setActivePanel(null)
  }

  async function exportPdf() {
    setExportingPdf(true)
    try {
      await downloadGoLivePdf(golive, job || {}, provision)
    } catch (err) {
      console.error(err)
      alert('Could not create the PDF. Try Export HTML as a backup.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <section className="go-live">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Go-Live</div>
          <h1>Cutover & handoff</h1>
          <p>
            {job?.customer || 'This job'} — install day through customer sign-off. Open a section from the pills.
          </p>
        </div>
        <div className="design-score">
          <span>Go-Live ready</span>
          <strong>{percent}%</strong>
          <small>{job?.site || 'Site TBD'}</small>
        </div>
      </div>

      <div className="go-live-timeline" aria-label="Pipeline status">
        <div className={`timeline-step${pipeline.survey ? ' is-done' : ''}`}>
          <span>1</span>
          <div>
            <strong>Survey</strong>
            <small>{pipeline.survey ? 'Started' : 'Pending'}</small>
          </div>
        </div>
        <div className="timeline-rail" />
        <div className={`timeline-step${pipeline.design ? ' is-done' : ''}`}>
          <span>2</span>
          <div>
            <strong>Design</strong>
            <small>{pipeline.design ? 'Started' : 'Pending'}</small>
          </div>
        </div>
        <div className="timeline-rail" />
        <div className={`timeline-step${percent >= 70 ? ' is-done' : percent > 0 ? ' is-partial' : ''}`}>
          <span>3</span>
          <div>
            <strong>Go-Live</strong>
            <small>{percent}%</small>
          </div>
        </div>
      </div>

      <div className="design-actions survey-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setSurveyTick(t => t + 1)}>
          Refresh provision
        </button>
        <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exportingPdf}>
          {exportingPdf ? 'Creating PDF…' : 'Export PDF'}
        </button>
        <details className="export-menu">
          <summary className="btn btn-secondary">More</summary>
          <div className="export-menu-panel">
            <button type="button" onClick={() => exportGoLiveDoc(golive, job || {}, provision)}>Export Word</button>
            <button type="button" onClick={() => exportGoLiveHtml(golive, job || {}, provision)}>Export HTML</button>
            <button type="button" onClick={reset}>Clear Go-Live</button>
          </div>
        </details>
      </div>

      <div className="progress-chips" aria-label="Go-Live sections">
        {chips.map(chip => {
          const state = chip.ratio >= 0.7 ? 'is-done' : chip.ratio > 0 ? 'is-partial' : ''
          const active = activePanel === chip.id ? ' is-active' : ''
          return (
            <button
              key={chip.id}
              type="button"
              className={`progress-chip ${state}${active}`.trim()}
              onClick={() => setActivePanel(chip.id)}
              title={`${chip.filled}/${chip.total} — open section`}
            >
              {chip.title}
            </button>
          )
        })}
      </div>

      {activePanel && panelMeta && createPortal(
        <div
          className="section-modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setActivePanel(null)
          }}
        >
          <div
            className={`section-modal${activePanel === 'provision' ? ' section-modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="golive-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">
                  Section {panelIndex + 1} of {PANELS.length}
                </div>
                <h2 id="golive-modal-title">{panelMeta[1]}</h2>
                <p>{panelMeta[2]}</p>
              </div>
              <div className="section-modal-nav">
                <button type="button" className="btn btn-secondary" onClick={() => movePanel(-1)} disabled={panelIndex <= 0}>Prev</button>
                <button type="button" className="btn btn-secondary" onClick={() => movePanel(1)} disabled={panelIndex >= PANELS.length - 1}>Next</button>
                <button type="button" className="btn btn-primary" onClick={() => setActivePanel(null)}>Done</button>
              </div>
            </div>
            <div className="section-modal-body">
              {activePanel === 'cutover' && (
                <div className="design-fields">
                  <label><span>Port date</span><input value={golive.cutover.portDate} onChange={e => updateCutover('portDate', e.target.value)} placeholder="2026-08-01" /></label>
                  <label><span>Cutover window</span><input value={golive.cutover.window} onChange={e => updateCutover('window', e.target.value)} placeholder="Sat 8am–12pm CT" /></label>
                  <label className="span-2"><span>Cutover sequence</span><textarea value={golive.cutover.sequence} onChange={e => updateCutover('sequence', e.target.value)} placeholder="1) Freeze changes&#10;2) Port numbers&#10;3) Smoke test..." /></label>
                  <label className="span-2"><span>Rollback plan</span><textarea value={golive.cutover.rollback} onChange={e => updateCutover('rollback', e.target.value)} placeholder="If inbound fails, revert DID routing to..." /></label>
                  <label className="span-2"><span>Customer comms</span><textarea value={golive.cutover.customerComms} onChange={e => updateCutover('customerComms', e.target.value)} placeholder="Email/SMS template for outage window..." /></label>
                  <label className="span-2"><span>Notes</span><textarea value={golive.cutover.notes} onChange={e => updateCutover('notes', e.target.value)} /></label>
                </div>
              )}

              {activePanel === 'install' && (
                <div className="install-checklist">
                  {(golive.install.items || []).map(item => (
                    <div className="install-row" key={item.id}>
                      <label className="install-check">
                        <input type="checkbox" checked={Boolean(item.done)} onChange={() => toggleInstall(item.id)} />
                        <span>{item.label}</span>
                      </label>
                      <input
                        value={item.notes || ''}
                        onChange={e => updateInstallNote(item.id, e.target.value)}
                        placeholder="Notes"
                      />
                    </div>
                  ))}
                  <label className="survey-field full" style={{ marginTop: 12 }}>
                    Install notes
                    <textarea
                      value={golive.install.notes || ''}
                      onChange={e => setGolive(prev => ({ ...prev, install: { ...prev.install, notes: e.target.value } }))}
                      rows={4}
                    />
                  </label>
                </div>
              )}

              {activePanel === 'provision' && (
                <ProvisioningSheet survey={survey} design={design} />
              )}

              {activePanel === 'handoff' && (
                <div className="design-fields">
                  <label>
                    <span>Training completed</span>
                    <select value={golive.handoff.trainingDone || ''} onChange={e => updateHandoff('trainingDone', e.target.value)}>
                      <option value="">—</option>
                      <option>No</option>
                      <option>Yes</option>
                      <option>Partial</option>
                    </select>
                  </label>
                  <label><span>Admin name</span><input value={golive.handoff.adminName} onChange={e => updateHandoff('adminName', e.target.value)} /></label>
                  <label><span>Admin phone</span><input value={golive.handoff.adminPhone} onChange={e => updateHandoff('adminPhone', e.target.value)} /></label>
                  <label><span>Admin email</span><input value={golive.handoff.adminEmail} onChange={e => updateHandoff('adminEmail', e.target.value)} /></label>
                  <label className="span-2"><span>Support escalation</span><textarea value={golive.handoff.supportEscalation} onChange={e => updateHandoff('supportEscalation', e.target.value)} placeholder="Tier 1 / Tier 2 / vendor NOC..." /></label>
                  <label><span>Sign-off name</span><input value={golive.handoff.signOffName} onChange={e => updateHandoff('signOffName', e.target.value)} /></label>
                  <label><span>Sign-off date</span><input type="date" value={golive.handoff.signOffDate} onChange={e => updateHandoff('signOffDate', e.target.value)} /></label>
                  <label className="span-2"><span>Handoff notes</span><textarea value={golive.handoff.notes} onChange={e => updateHandoff('notes', e.target.value)} /></label>
                  <label className="span-2"><span>Assumptions</span><textarea value={golive.assumptions} onChange={e => setGolive(prev => ({ ...prev, assumptions: e.target.value }))} /></label>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
