import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ProvisioningSheet, { buildProvisionData } from './ProvisioningSheet.jsx'
import {
  createEmptyGoLive,
  downloadGoLivePdf,
  exportGoLiveDoc,
  exportGoLiveHtml,
  exportHandoffDoc,
  exportHandoffPdf,
  goLiveCompletionPercent,
  mergeGoLive,
  sectionProgressGoLive,
} from '../lib/goLiveModel.js'
import {
  getJob,
  getPort,
  jobCompletion,
  loadJobDesign,
  loadJobGoLive,
  loadJobSurvey,
  saveJobGoLive,
  savePort,
} from '../lib/jobModel.js'
import { registerWorkspaceFlush } from '../lib/reloadGate.js'
import { ConflictBanner } from './ConflictReview.jsx'

const PANELS = [
  ['port', 'Port', 'LSR submission, FOC date, porting window, day-of contact, and rollback'],
  ['cutover', 'Cutover', 'Cutover window, sequence, rollback plan, and customer comms'],
  ['install', 'Install', 'VLAN, QoS, phones, programming, and smoke tests'],
  ['provision', 'Provision', 'Build sheet from Survey + Design for PBX programming'],
  ['handoff', 'Handoff', 'Training, admin contacts, escalation, and sign-off'],
]

export default function GoLive({ jobId }) {
  const [golive, setGolive] = useState(() => mergeGoLive(loadJobGoLive(jobId)))
  const [port, setPort] = useState(() => getPort(jobId))
  const [activePanel, setActivePanel] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingHandoff, setExportingHandoff] = useState(false)
  const [showE911Test, setShowE911Test] = useState(false)
  const [e911Form, setE911Form] = useState({ testedBy: '', method: 'test-call' })

  const job = getJob(jobId)
  const [surveyTick, setSurveyTick] = useState(0)
  const survey = useMemo(() => loadJobSurvey(jobId), [jobId, surveyTick])
  const design = useMemo(() => loadJobDesign(jobId), [jobId, surveyTick])
  const pipeline = jobCompletion(jobId)
  const provision = useMemo(() => buildProvisionData(survey, design), [survey, design])

  const e911Ready = useMemo(() => {
    const locs = survey?.e911Locations || []
    const named = (survey?.users || []).filter(u => String(u.name || '').trim())
    if (!locs.length) return false
    const locsOk = locs.every(l => String(l.name || '').trim() && String(l.address || '').trim())
    const assignOk = named.every(u => u.e911LocationId)
    return locsOk && (named.length === 0 || assignOk)
  }, [survey])

  useEffect(() => {
    setGolive(mergeGoLive(loadJobGoLive(jobId)))
    setPort(getPort(jobId))
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
    if (!jobId) return undefined
    return registerWorkspaceFlush(() => {
      saveJobGoLive(jobId, latestGoLive.current)
    })
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

  const portProgress = useMemo(() => {
    const fields = [port.carrier, port.focDate, port.submittedDate, port.portingWindow, port.dayOfContact]
    const filled = fields.filter(v => String(v || '').trim()).length
    const bonus = port.focConfirmed ? 1 : 0
    return { filled: filled + bonus, total: fields.length + 1, ratio: (filled + bonus) / (fields.length + 1) }
  }, [port])

  const chips = useMemo(() => PANELS.map(([id, title]) => {
    if (id === 'provision') {
      return { id, title, filled: provision.hasData ? 1 : 0, total: 1, ratio: provisionRatio }
    }
    if (id === 'port') {
      return { id, title, ...portProgress }
    }
    return { id, title, ...sectionProgressGoLive(golive, id) }
  }), [golive, provision.hasData, provisionRatio, portProgress])

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

  function itemGated(item) {
    if (!item.gated) return false
    if (item.id === 'e911-test') return !e911Ready || !golive.e911Test?.testedAt
    if (item.id === 'e911' || item.id === 'e911-locs') return !e911Ready
    return false
  }

  function toggleInstall(id) {
    const item = (golive.install.items || []).find(i => i.id === id)
    if (item && itemGated(item) && !item.done) {
      if (id === 'e911-test' && e911Ready) {
        setE911Form({
          testedBy: golive.e911Test?.testedBy || '',
          method: golive.e911Test?.method || 'test-call',
        })
        setShowE911Test(true)
      }
      return
    }
    setGolive(prev => ({
      ...prev,
      install: {
        ...prev.install,
        items: (prev.install.items || []).map(row => (
          row.id === id
            ? {
              ...row,
              done: !row.done,
              doneAt: !row.done ? new Date().toISOString() : null,
              doneBy: !row.done ? (row.doneBy || '') : '',
            }
            : row
        )),
      },
    }))
  }

  function confirmE911Test(e) {
    e?.preventDefault()
    const testedAt = new Date().toISOString()
    setGolive(prev => ({
      ...prev,
      e911Test: {
        testedAt,
        testedBy: e911Form.testedBy.trim(),
        method: e911Form.method || 'test-call',
      },
      install: {
        ...prev.install,
        items: (prev.install.items || []).map(row => (
          row.id === 'e911-test'
            ? { ...row, done: true, doneAt: testedAt, doneBy: e911Form.testedBy.trim() }
            : row
        )),
      },
    }))
    setShowE911Test(false)
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

  function patchPort(partial) {
    const next = { ...port, ...partial }
    setPort(next)
    savePort(jobId, next)
  }

  // FOC today alert
  const focToday = useMemo(() => {
    const focDate = port.focDate
    if (!focDate) return false
    const today = new Date().toISOString().slice(0, 10)
    return focDate === today
  }, [port.focDate])

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

  async function handleHandoffPdf() {
    setExportingHandoff(true)
    try {
      await exportHandoffPdf(golive, job || {}, provision, survey || {})
    } catch (err) {
      console.error(err)
      alert('Could not generate handoff PDF.')
    } finally {
      setExportingHandoff(false)
    }
  }

  return (
    <section className="go-live">
      <ConflictBanner jobId={jobId} />
      {focToday && (
        <div className="foc-today-banner" role="alert">
          <strong>Port day is today</strong> — {port.carrier || 'carrier'} FOC date is today.
          {port.portingWindow ? ` Porting window: ${port.portingWindow}.` : ''}
          {port.dayOfContact ? ` Day-of contact: ${port.dayOfContact}.` : ''}
          {' '}
          <button type="button" className="btn-sm btn btn-secondary" onClick={() => setActivePanel('port')}>
            View port details
          </button>
        </div>
      )}
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
        <button type="button" className="btn btn-primary" onClick={handleHandoffPdf} disabled={exportingHandoff}>
          {exportingHandoff ? 'Creating PDF…' : 'Customer Handoff PDF'}
        </button>
        <details className="export-menu">
          <summary className="btn btn-secondary">More</summary>
          <div className="export-menu-panel">
            <button type="button" onClick={exportPdf} disabled={exportingPdf}>{exportingPdf ? 'Creating…' : 'Export Go-Live PDF'}</button>
            <button type="button" onClick={() => exportGoLiveDoc(golive, job || {}, provision)}>Export Go-Live Word</button>
            <button type="button" onClick={() => exportGoLiveHtml(golive, job || {}, provision)}>Export Go-Live HTML</button>
            <button type="button" onClick={() => exportHandoffDoc(golive, job || {}, provision, job?.supportEmail || '')}>Customer Handoff HTML</button>
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
              {activePanel === 'port' && (
                <div className="foc-tracker">
                  <div className="foc-tracker-note">
                    Port order tracking. Fields sync with the cockpit Port card — enter once, visible everywhere.
                  </div>
                  <div className="design-fields">
                    <label><span>Carrier</span><input value={port.carrier} onChange={e => patchPort({ carrier: e.target.value })} placeholder="Bandwidth, Twilio…" /></label>
                    <label><span>Order #</span><input value={port.orderNumber} onChange={e => patchPort({ orderNumber: e.target.value })} placeholder="LSR or port order number" /></label>
                    <label><span>Submitted date</span><input type="date" value={port.submittedDate} onChange={e => patchPort({ submittedDate: e.target.value })} /></label>
                    <label><span>FOC date</span><input type="date" value={port.focDate} onChange={e => patchPort({ focDate: e.target.value })} /></label>
                    <label><span>Porting window</span><input value={port.portingWindow} onChange={e => patchPort({ portingWindow: e.target.value })} placeholder="e.g. 9am–11am CT" /></label>
                    <label><span>Day-of contact</span><input value={port.dayOfContact} onChange={e => patchPort({ dayOfContact: e.target.value })} placeholder="Name + phone for port day escalation" /></label>
                    <div className="foc-tracker-checks">
                      <label className="foc-check-label">
                        <input type="checkbox" checked={Boolean(port.csrVerified)} onChange={e => patchPort({ csrVerified: e.target.checked })} />
                        CSR verified — customer service record matches port order exactly
                      </label>
                      <label className="foc-check-label">
                        <input type="checkbox" checked={Boolean(port.focConfirmed)} onChange={e => patchPort({ focConfirmed: e.target.checked })} />
                        FOC confirmed — carrier has acknowledged the FOC date in writing
                      </label>
                    </div>
                    <label className="span-2"><span>Rollback plan</span><textarea value={port.rollbackPlan} onChange={e => patchPort({ rollbackPlan: e.target.value })} placeholder="If port fails: revert DID routing to old carrier, contact day-of contact at…" rows={3} /></label>
                    <label className="span-2"><span>DIDs to port</span><textarea value={(port.dids || []).join('\n')} onChange={e => patchPort({ dids: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} placeholder="One number per line" rows={5} /></label>
                    <label className="span-2"><span>Notes</span><textarea value={port.notes} onChange={e => patchPort({ notes: e.target.value })} rows={3} /></label>
                  </div>
                </div>
              )}
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
                  {!e911Ready && (
                    <div className="parse-note parse-error">
                      Complete E911 locations and user assignments in Survey before checking gated E911 items.
                    </div>
                  )}
                  {golive.e911Test?.testedAt && (
                    <div className="parse-note parse-ok">
                      E911 tested {new Date(golive.e911Test.testedAt).toLocaleString()}
                      {golive.e911Test.testedBy ? ` by ${golive.e911Test.testedBy}` : ''}
                      {golive.e911Test.method ? ` · ${golive.e911Test.method}` : ''}
                    </div>
                  )}
                  {(golive.install.items || []).map(item => {
                    const gated = itemGated(item) && !item.done
                    return (
                      <div className={`install-row${gated ? ' is-gated' : ''}`} key={item.id}>
                        <label className="install-check">
                          <input
                            type="checkbox"
                            checked={Boolean(item.done)}
                            disabled={gated && item.id !== 'e911-test'}
                            onChange={() => toggleInstall(item.id)}
                          />
                          <span>
                            {item.label}
                            {item.gated ? <em className="gated-tag"> gated</em> : null}
                          </span>
                        </label>
                        {item.id === 'e911-test' && !item.done && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!e911Ready}
                            onClick={() => {
                              setE911Form({
                                testedBy: golive.e911Test?.testedBy || '',
                                method: golive.e911Test?.method || 'test-call',
                              })
                              setShowE911Test(true)
                            }}
                          >
                            Log 911 test
                          </button>
                        )}
                        <input
                          value={item.notes || ''}
                          onChange={e => updateInstallNote(item.id, e.target.value)}
                          placeholder="Notes"
                        />
                      </div>
                    )
                  })}
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
                  <div className="btn-row span-2 no-print">
                    <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                      Print / Save as PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => exportHandoffDoc(golive, job || {}, provision, job?.supportEmail || '')}
                    >
                      Export Customer Handoff Doc
                    </button>
                  </div>
                  <label>
                    <span>Training done</span>
                    <select value={golive.handoff.trainingDone} onChange={e => updateHandoff('trainingDone', e.target.value)}>
                      <option value="">—</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Partial">Partial</option>
                    </select>
                  </label>
                  <label><span>Admin name</span><input value={golive.handoff.adminName} onChange={e => updateHandoff('adminName', e.target.value)} /></label>
                  <label><span>Admin phone</span><input value={golive.handoff.adminPhone} onChange={e => updateHandoff('adminPhone', e.target.value)} /></label>
                  <label><span>Admin email</span><input value={golive.handoff.adminEmail} onChange={e => updateHandoff('adminEmail', e.target.value)} /></label>
                  <label className="span-2"><span>Support escalation</span><textarea value={golive.handoff.supportEscalation} onChange={e => updateHandoff('supportEscalation', e.target.value)} /></label>
                  <label><span>Sign-off name</span><input value={golive.handoff.signOffName} onChange={e => updateHandoff('signOffName', e.target.value)} /></label>
                  <label><span>Sign-off date</span><input value={golive.handoff.signOffDate} onChange={e => updateHandoff('signOffDate', e.target.value)} /></label>
                  <label className="span-2"><span>Handoff notes</span><textarea value={golive.handoff.notes} onChange={e => updateHandoff('notes', e.target.value)} /></label>
                  <label className="span-2"><span>Assumptions</span><textarea value={golive.assumptions || ''} onChange={e => setGolive(prev => ({ ...prev, assumptions: e.target.value }))} /></label>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showE911Test && createPortal(
        <div
          className="section-modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setShowE911Test(false)
          }}
        >
          <div className="section-modal" role="dialog" aria-modal="true" aria-labelledby="e911-test-title">
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">E911</div>
                <h2 id="e911-test-title">Log 911 test</h2>
                <p>Record who completed the emergency test and how.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setShowE911Test(false)}>Cancel</button>
            </div>
            <div className="section-modal-body">
              <form className="new-job-form" onSubmit={confirmE911Test}>
                <label className="field">
                  <span>Tested by</span>
                  <input
                    autoFocus
                    value={e911Form.testedBy}
                    onChange={e => setE911Form(f => ({ ...f, testedBy: e.target.value }))}
                    placeholder="Tech name"
                    required
                  />
                </label>
                <label className="field">
                  <span>Method</span>
                  <select
                    value={e911Form.method}
                    onChange={e => setE911Form(f => ({ ...f, method: e.target.value }))}
                  >
                    <option value="test-call">911 test call</option>
                    <option value="psap-verify">PSAP verification</option>
                    <option value="carrier-tool">Carrier portal tool</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary">Confirm test</button>
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
