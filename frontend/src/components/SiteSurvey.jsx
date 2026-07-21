import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SurveyPhotos from './SurveyPhotos.jsx'
import TopologyEditor from './TopologyEditor.jsx'
import {
  NETWORK_RUN_COUNT,
  QUALITY_THRESHOLDS,
  VISUALWARE_SAMPLE_REPORT,
  analyzeReadiness,
  networkRunProgress,
  normalizeNetworkSurvey,
  parseVisualwareReport,
} from '../lib/networkReadiness.js'
import {
  createEmptySurvey,
  downloadJson,
  downloadPdfReport,
  exportEditableDoc,
  exportHtmlReport,
  makeId,
} from '../lib/surveyModel.js'
import { loadJobSurveyAsync, saveJobSurvey } from '../lib/jobModel.js'

const TOOLS = [
  {
    title: 'Speedtest',
    label: 'Bandwidth and latency',
    url: 'https://www.speedtest.net/',
  },
  {
    title: 'MyConnection (Visualware)',
    label: 'Jitter, loss, MOS, SIP ALG',
    url: 'https://myconnectionserver.visualware.com/portals/voip-test/voip-assessment-test',
    secondaryUrl: 'https://www.visualware.com/bcs/',
  },
]

const PANELS = [
  ['site', 'Site', 'Customer, site, contacts, and access notes'],
  ['numbers', 'Numbers', 'Company main lines, fax, and toll-free'],
  ['users', 'Users', 'Names, emails, extensions, DIDs, and locations'],
  ['network', 'Network', '3 Speedtests + 3 MyConnection tests'],
  ['topology', 'Topology', 'Rack, switch, and phone layout'],
  ['photos', 'Photos', 'MDF, IDF, cabling, and site evidence'],
]

const MAIN_NUMBER_PRESETS = ['Main line', 'Fax', 'Toll-free', 'Auto-attendant']

export default function SiteSurvey({ jobId }) {
  const [survey, setSurvey] = useState(() => createEmptySurvey())
  const [ready, setReady] = useState(false)
  const [parseNote, setParseNote] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [activePanel, setActivePanel] = useState(null)
  const [speedRun, setSpeedRun] = useState(0)
  const [mcRun, setMcRun] = useState(0)
  const importRef = useRef(null)
  const readiness = useMemo(
    () => analyzeReadiness(survey),
    [survey.speedtests, survey.visualwareRuns, survey.phoneCount],
  )

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setParseNote(null)
    setActivePanel(null)
    setSpeedRun(0)
    setMcRun(0)
    loadJobSurveyAsync(jobId).then((data) => {
      if (cancelled) return
      setSurvey(normalizeNetworkSurvey(data))
      setReady(true)
    })
    return () => { cancelled = true }
  }, [jobId])

  const latestSurvey = useRef(survey)
  latestSurvey.current = survey

  useEffect(() => {
    if (!jobId || !ready) return undefined
    const t = setTimeout(() => {
      saveJobSurvey(jobId, latestSurvey.current)
    }, 450)
    return () => clearTimeout(t)
  }, [survey, jobId, ready])

  // Flush pending edits when leaving the job / unmounting
  useEffect(() => () => {
    if (jobId && ready) saveJobSurvey(jobId, latestSurvey.current)
  }, [jobId, ready])

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

  const chips = useMemo(() => PANELS.map(([id, title]) => {
    const prog = panelProgress(survey, id)
    return { id, title, ...prog }
  }), [survey])

  const panelMeta = activePanel
    ? PANELS.find(([id]) => id === activePanel)
    : null

  const panelIndex = activePanel ? PANELS.findIndex(([id]) => id === activePanel) : -1

  function updateSurvey(patch) {
    setSurvey(prev => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }))
  }

  function updateCustomer(field, value) {
    updateSurvey({ customer: { ...survey.customer, [field]: value } })
  }

  function updateSpeedtest(index, field, value) {
    const speedtests = [...(survey.speedtests || [])]
    while (speedtests.length < NETWORK_RUN_COUNT) speedtests.push({})
    speedtests[index] = { ...speedtests[index], [field]: value }
    updateSurvey({ speedtests })
  }

  function updateVisualware(index, field, value) {
    const visualwareRuns = [...(survey.visualwareRuns || [])]
    while (visualwareRuns.length < NETWORK_RUN_COUNT) visualwareRuns.push({})
    visualwareRuns[index] = { ...visualwareRuns[index], [field]: value }
    updateSurvey({ visualwareRuns })
  }

  function parseReport(index = mcRun, text) {
    const run = survey.visualwareRuns?.[index] || {}
    const paste = text ?? run.rawPaste
    const { data, matched } = parseVisualwareReport(paste)
    if (!matched) {
      setParseNote({ type: 'error', text: `Could not find MyConnection metrics in run ${index + 1}.` })
      return
    }
    const visualwareRuns = [...(survey.visualwareRuns || [])]
    while (visualwareRuns.length < NETWORK_RUN_COUNT) visualwareRuns.push({})
    visualwareRuns[index] = { ...visualwareRuns[index], ...data, rawPaste: paste }
    updateSurvey({
      visualwareRuns,
      phoneCount: data.callsSimulated || survey.phoneCount,
    })
    setParseNote({ type: 'ok', text: `Parsed ${matched} field(s) into MyConnection run ${index + 1}.` })
  }

  function loadVisualwareSample() {
    parseReport(mcRun, VISUALWARE_SAMPLE_REPORT)
  }

  function startNew() {
    if (!confirm('Clear this site survey and start a new one for this job?')) return
    const blank = createEmptySurvey()
    setSurvey(blank)
    setParseNote(null)
    setActivePanel(null)
  }

  function addUser() {
    updateSurvey({
      users: [...survey.users, newUser()],
      phoneCount: String(Math.max(Number(survey.phoneCount || 0), survey.users.length + 1)),
    })
  }

  function addUsers(count) {
    const nextUsers = Array.from({ length: count }, () => newUser())
    updateSurvey({
      users: [...survey.users, ...nextUsers],
      phoneCount: String(Math.max(Number(survey.phoneCount || 0), survey.users.length + count)),
    })
  }

  function updateUser(id, field, value) {
    updateSurvey({
      users: survey.users.map(u => u.id === id ? { ...u, [field]: value } : u),
    })
  }

  function removeUser(id) {
    updateSurvey({ users: survey.users.filter(u => u.id !== id) })
  }

  const mainNumbers = survey.mainNumbers || []

  function addMainNumber() {
    updateSurvey({
      mainNumbers: [...mainNumbers, { id: makeId(), label: '', number: '', notes: '' }],
    })
  }

  function addMainNumberPreset(label) {
    updateSurvey({
      mainNumbers: [...mainNumbers, { id: makeId(), label, number: '', notes: '' }],
    })
  }

  function updateMainNumber(id, field, value) {
    updateSurvey({
      mainNumbers: mainNumbers.map(m => m.id === id ? { ...m, [field]: value } : m),
    })
  }

  function removeMainNumber(id) {
    updateSurvey({ mainNumbers: mainNumbers.filter(m => m.id !== id) })
  }

  async function importJson(file) {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setSurvey({ ...createEmptySurvey(), ...parsed, updatedAt: new Date().toISOString() })
      setParseNote({ type: 'ok', text: 'Imported survey JSON.' })
    } catch {
      setParseNote({ type: 'error', text: 'Could not import that JSON file.' })
    }
  }

  async function exportPdf() {
    if (exportingPdf) return
    if (!survey.techName?.trim()) {
      const ok = confirm('No tech name entered yet. Export the PDF without a field tech name?')
      if (!ok) return
    }
    setExportingPdf(true)
    try {
      await downloadPdfReport(survey, readiness)
    } catch (err) {
      console.error(err)
      alert('Could not create the PDF. Try Export HTML as a backup.')
    } finally {
      setExportingPdf(false)
    }
  }

  function movePanel(delta) {
    setActivePanel(current => {
      if (!current) return current
      const idx = PANELS.findIndex(([id]) => id === current)
      if (idx < 0) return current
      const next = PANELS[idx + delta]
      return next ? next[0] : current
    })
  }

  return (
    <section className="site-survey">
      <div className="survey-hero hero-grid">
        <div>
          <div className="survey-kicker">Field tech workspace</div>
          <h1>Site Survey</h1>
          <p>Open a section from the pills below — same flow as System Design. Export when the site is ready.</p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-secondary" onClick={startNew}>New survey</button>
          <button type="button" className="btn btn-secondary" onClick={() => downloadJson(survey)} title="Save the full working survey">Save draft</button>
          <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exportingPdf} title="Download a PDF report">
            {exportingPdf ? 'Creating PDF…' : 'Export PDF'}
          </button>
          <details className="export-menu">
            <summary className="btn btn-secondary">More</summary>
            <div className="export-menu-panel">
              <button type="button" onClick={() => importRef.current?.click()}>Import draft</button>
              <button type="button" onClick={() => exportEditableDoc(survey, readiness)}>Export Word</button>
              <button type="button" onClick={() => exportHtmlReport(survey, readiness)}>Export HTML</button>
            </div>
          </details>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => importJson(e.target.files?.[0])} />
        </div>
      </div>

      <div className={`survey-verdict survey-verdict-${readiness.status}`}>
        <div>
          <div className="survey-kicker">Install verdict</div>
          <h2>{readiness.title}</h2>
          <p>{readiness.detail}</p>
        </div>
        <div className="survey-score-grid">
          <Score label="Worst jitter" value={readiness.summary.jitter != null ? `${readiness.summary.jitter} ms` : '-'} />
          <Score label="Worst loss" value={readiness.summary.loss != null ? `${readiness.summary.loss}%` : '-'} />
          <Score label="Lowest MOS" value={readiness.summary.mos ?? '-'} />
          <Score label="Calls" value={readiness.summary.supported != null ? `${readiness.summary.supported}/${readiness.summary.requested}` : '-'} />
        </div>
      </div>

      <div className="progress-chips" aria-label="Survey sections">
        {chips.map(chip => {
          const state = chip.ratio >= 0.7 ? 'is-done' : chip.ratio > 0 ? 'is-partial' : ''
          const active = activePanel === chip.id ? ' is-active' : ''
          return (
            <button
              key={chip.id}
              type="button"
              className={`progress-chip ${state}${active}`.trim()}
              onClick={() => setActivePanel(chip.id)}
              title={`${chip.filled}/${chip.total} filled — open section`}
            >
              {chip.title}
            </button>
          )
        })}
      </div>

      <div className="survey-summary-strip">
        <div className="recommendations">
          <div className="recommendations-title">Tech next steps</div>
          <ul>{readiness.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div className="survey-quick-tools">
          <div className="recommendations-title">Test portals</div>
          <div className="btn-row">
            {TOOLS.map(tool => (
              <a key={tool.title} className="btn btn-secondary" href={tool.url} target="_blank" rel="noopener noreferrer">
                {tool.title}
              </a>
            ))}
          </div>
        </div>
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
            className={`section-modal${activePanel === 'topology' ? ' section-modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="survey-section-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">
                  Section {panelIndex + 1} of {PANELS.length}
                </div>
                <h2 id="survey-section-modal-title">{panelMeta[1]}</h2>
                <p>{panelMeta[2]}</p>
              </div>
              <div className="section-modal-nav">
                <button type="button" className="btn btn-secondary" onClick={() => movePanel(-1)} disabled={panelIndex <= 0}>
                  Prev
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => movePanel(1)} disabled={panelIndex >= PANELS.length - 1}>
                  Next
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setActivePanel(null)}>
                  Done
                </button>
              </div>
            </div>
            <div className="section-modal-body">
              <SurveyPanelBody
                id={activePanel}
                survey={survey}
                readiness={readiness}
                parseNote={parseNote}
                updateSurvey={updateSurvey}
                updateCustomer={updateCustomer}
                updateSpeedtest={updateSpeedtest}
                updateVisualware={updateVisualware}
                parseReport={parseReport}
                loadVisualwareSample={loadVisualwareSample}
                speedRun={speedRun}
                setSpeedRun={setSpeedRun}
                mcRun={mcRun}
                setMcRun={setMcRun}
                mainNumbers={mainNumbers}
                addMainNumber={addMainNumber}
                addMainNumberPreset={addMainNumberPreset}
                updateMainNumber={updateMainNumber}
                removeMainNumber={removeMainNumber}
                addUser={addUser}
                addUsers={addUsers}
                updateUser={updateUser}
                removeUser={removeUser}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

function SurveyPanelBody({
  id,
  survey,
  readiness,
  parseNote,
  updateSurvey,
  updateCustomer,
  updateSpeedtest,
  updateVisualware,
  parseReport,
  loadVisualwareSample,
  speedRun,
  setSpeedRun,
  mcRun,
  setMcRun,
  mainNumbers,
  addMainNumber,
  addMainNumberPreset,
  updateMainNumber,
  removeMainNumber,
  addUser,
  addUsers,
  updateUser,
  removeUser,
}) {
  if (id === 'site') {
    return (
      <>
        <div className="survey-form-grid">
          <Field label="Field tech name" value={survey.techName || ''} onChange={v => updateSurvey({ techName: v })} />
          <Field label="Company" value={survey.customer.company} onChange={v => updateCustomer('company', v)} />
          <Field label="Site name" value={survey.customer.siteName} onChange={v => updateCustomer('siteName', v)} />
          <Field label="Ticket / project" value={survey.customer.ticketId} onChange={v => updateCustomer('ticketId', v)} />
          <Field label="Phones planned" type="number" value={survey.phoneCount} onChange={v => updateSurvey({ phoneCount: v })} />
          <Field label="Contact name" value={survey.customer.contactName} onChange={v => updateCustomer('contactName', v)} />
          <Field label="Contact phone" value={survey.customer.contactPhone} onChange={v => updateCustomer('contactPhone', v)} />
          <Field label="Contact email" value={survey.customer.contactEmail} onChange={v => updateCustomer('contactEmail', v)} />
          <Field label="Address" value={survey.customer.address} onChange={v => updateCustomer('address', v)} />
        </div>
        <label className="survey-field full">
          Site / access notes
          <textarea value={survey.customer.notes} onChange={e => updateCustomer('notes', e.target.value)} placeholder="Parking, MDF location, VLAN notes, firewall owner, access instructions..." />
        </label>
      </>
    )
  }

  if (id === 'numbers') {
    return (
      <>
        <div className="design-list-head">
          <div>
            <h3>Company main numbers</h3>
            <p>Primary business line, fax, toll-free, and auto-attendant DIDs.</p>
          </div>
          <div className="btn-row">
            {MAIN_NUMBER_PRESETS.map(label => (
              <button key={label} type="button" className="btn btn-secondary" onClick={() => addMainNumberPreset(label)}>{label}</button>
            ))}
            <button type="button" className="btn btn-primary" onClick={addMainNumber}>Custom</button>
          </div>
        </div>
        <div className="main-number-table">
          <div className="main-number-row main-number-head">
            <span>Label</span><span>Number</span><span>Notes</span><span />
          </div>
          {mainNumbers.length === 0 && (
            <div className="empty-hint-action">
              <p>No main numbers yet. Start with the primary business line.</p>
              <button type="button" className="btn btn-primary" onClick={() => addMainNumberPreset('Main line')}>Add main line</button>
            </div>
          )}
          {mainNumbers.map(entry => (
            <div className="main-number-row" key={entry.id}>
              <input value={entry.label} onChange={e => updateMainNumber(entry.id, 'label', e.target.value)} placeholder="Main line / Fax / Toll-free" />
              <input value={entry.number} onChange={e => updateMainNumber(entry.id, 'number', e.target.value)} placeholder="337-555-0100" />
              <input value={entry.notes} onChange={e => updateMainNumber(entry.id, 'notes', e.target.value)} placeholder="Rings to reception, port from carrier..." />
              <button type="button" onClick={() => removeMainNumber(entry.id)}>Remove</button>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (id === 'users') {
    return (
      <>
        <div className="design-list-head">
          <div>
            <h3>Users and phones</h3>
            <p>Who gets a phone, email, extension, and DID at this site.</p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => addUsers(5)}>Add 5 users</button>
            <button type="button" className="btn btn-primary" onClick={addUser}>Add user</button>
          </div>
        </div>
        <div className="user-table user-table-wide">
          <div className="user-row user-head">
            <span>Name</span>
            <span>Username</span>
            <span>Email</span>
            <span>Extension</span>
            <span>Phone / DID</span>
            <span>Location</span>
            <span>Role</span>
            <span />
          </div>
          {survey.users.length === 0 && (
            <div className="empty-hint-action">
              <p>No users yet. Add the first extension or bulk-add five rows.</p>
              <button type="button" className="btn btn-primary" onClick={addUser}>Add user</button>
            </div>
          )}
          {survey.users.map(user => (
            <div className="user-row" key={user.id}>
              <input value={user.name} onChange={e => updateUser(user.id, 'name', e.target.value)} placeholder="Jane Tech" />
              <input value={user.username} onChange={e => updateUser(user.id, 'username', e.target.value)} placeholder="jane.tech" />
              <input type="email" value={user.email || ''} onChange={e => updateUser(user.id, 'email', e.target.value)} placeholder="jane@company.com" />
              <input value={user.extension || ''} onChange={e => updateUser(user.id, 'extension', e.target.value)} placeholder="1001" />
              <input value={user.phone || ''} onChange={e => updateUser(user.id, 'phone', e.target.value)} placeholder="337-555-0100" />
              <input value={user.location || ''} onChange={e => updateUser(user.id, 'location', e.target.value)} placeholder="Front desk" />
              <input value={user.role} onChange={e => updateUser(user.id, 'role', e.target.value)} placeholder="User" />
              <button type="button" onClick={() => removeUser(user.id)}>Remove</button>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (id === 'network') {
    const speedtests = survey.speedtests || []
    const visualwareRuns = survey.visualwareRuns || []
    const st = speedtests[speedRun] || {}
    const vw = visualwareRuns[mcRun] || {}
    const netProg = networkRunProgress(survey)

    return (
      <>
        <div className="design-list-head">
          <div>
            <h3>Network readiness</h3>
            <p>
              Run {NETWORK_RUN_COUNT} Speedtests and {NETWORK_RUN_COUNT} MyConnection tests.
              Verdict uses the worst-case across all runs ({netProg.speedFilled}/{NETWORK_RUN_COUNT} Speed · {netProg.vwFilled}/{NETWORK_RUN_COUNT} MyConnection).
            </p>
          </div>
        </div>
        <div className="tool-strip">
          {TOOLS.map(tool => (
            <div className="tool-link" key={tool.title}>
              <div>
                <strong>{tool.title}</strong>
                <span>{tool.label}</span>
              </div>
              <a href={tool.url} target="_blank" rel="noopener noreferrer">Open</a>
              {tool.secondaryUrl && <a href={tool.secondaryUrl} target="_blank" rel="noopener noreferrer">BCS</a>}
            </div>
          ))}
        </div>
        <div className="survey-score-grid readiness-inline">
          <Score label="Worst jitter" value={readiness.summary.jitter != null ? `${readiness.summary.jitter} ms` : '-'} />
          <Score label="Worst loss" value={readiness.summary.loss != null ? `${readiness.summary.loss}%` : '-'} />
          <Score label="Lowest MOS" value={readiness.summary.mos ?? '-'} />
          <Score label="Calls" value={readiness.summary.supported != null ? `${readiness.summary.supported}/${readiness.summary.requested}` : '-'} />
        </div>

        <div className="test-run-block">
          <div className="test-run-head">
            <h4>Speedtest</h4>
            <div className="test-run-tabs" role="tablist" aria-label="Speedtest runs">
              {Array.from({ length: NETWORK_RUN_COUNT }, (_, i) => (
                <button
                  key={`st-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={speedRun === i}
                  className={`test-run-tab${speedRun === i ? ' is-active' : ''}${speedtests[i]?.downloadMbps || speedtests[i]?.uploadMbps ? ' has-data' : ''}`}
                  onClick={() => setSpeedRun(i)}
                >
                  Run {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="survey-form-grid">
            <Field label="Download Mbps" type="number" value={st.downloadMbps || ''} onChange={v => updateSpeedtest(speedRun, 'downloadMbps', v)} />
            <Field label="Upload Mbps" type="number" value={st.uploadMbps || ''} onChange={v => updateSpeedtest(speedRun, 'uploadMbps', v)} />
            <Field label="Latency ms" type="number" value={st.latencyMs || ''} onChange={v => updateSpeedtest(speedRun, 'latencyMs', v)} />
            <Field label="Server" value={st.server || ''} onChange={v => updateSpeedtest(speedRun, 'server', v)} />
            <Field label="Tested at" type="datetime-local" value={st.testedAt || ''} onChange={v => updateSpeedtest(speedRun, 'testedAt', v)} />
            <Field label="Notes" value={st.notes || ''} onChange={v => updateSpeedtest(speedRun, 'notes', v)} />
          </div>
        </div>

        <div className="test-run-block">
          <div className="test-run-head">
            <h4>MyConnection</h4>
            <div className="test-run-tabs" role="tablist" aria-label="MyConnection runs">
              {Array.from({ length: NETWORK_RUN_COUNT }, (_, i) => (
                <button
                  key={`mc-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={mcRun === i}
                  className={`test-run-tab${mcRun === i ? ' is-active' : ''}${visualwareRuns[i]?.rawPaste || visualwareRuns[i]?.overall ? ' has-data' : ''}`}
                  onClick={() => setMcRun(i)}
                >
                  Run {i + 1}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={loadVisualwareSample}>Load sample</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => parseReport(mcRun)}
                disabled={!String(vw.rawPaste || '').trim()}
              >
                Parse run {mcRun + 1}
              </button>
            </div>
          </div>
          <textarea
            className="report-textarea"
            value={vw.rawPaste || ''}
            onChange={e => updateVisualware(mcRun, 'rawPaste', e.target.value)}
            placeholder={`Paste MyConnection / Visualware result for run ${mcRun + 1}…`}
            spellCheck={false}
          />
          {parseNote && <div className={parseNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>{parseNote.text}</div>}
        </div>

        <MetricSections sections={readiness.sections} />
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><span className="panel-title">Quality guide</span></div>
          <table className="threshold-table compact">
            <tbody>
              {QUALITY_THRESHOLDS.map(t => (
                <tr key={t.metric}><td>{t.metric}</td><td className="ok-cell">{t.good}</td><td className="warn-cell">{t.watch}</td><td className="err-cell">{t.bad}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  if (id === 'topology') {
    return (
      <TopologyEditor topology={survey.topology} onChange={topology => updateSurvey({ topology })} />
    )
  }

  if (id === 'photos') {
    return (
      <SurveyPhotos photos={survey.photos} onChange={photos => updateSurvey({ photos })} />
    )
  }

  return null
}

function panelProgress(survey, id) {
  if (id === 'site') {
    const fields = [
      survey.techName,
      survey.customer?.company,
      survey.customer?.siteName,
      survey.customer?.ticketId,
      survey.phoneCount,
      survey.customer?.contactName,
      survey.customer?.address,
    ]
    const filled = fields.filter(v => String(v || '').trim()).length
    const total = fields.length
    return { filled, total, ratio: filled / total }
  }
  if (id === 'numbers') {
    const n = survey.mainNumbers?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  if (id === 'users') {
    const n = survey.users?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  if (id === 'network') {
    return networkRunProgress(survey)
  }
  if (id === 'topology') {
    const nodes = survey.topology?.nodes?.length || 0
    const links = survey.topology?.links?.length || 0
    const filled = (nodes > 0 ? 1 : 0) + (links > 0 ? 1 : 0)
    return { filled, total: 2, ratio: filled / 2 }
  }
  if (id === 'photos') {
    const n = survey.photos?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  return { filled: 0, total: 1, ratio: 0 }
}

function newUser() {
  return { id: makeId(), name: '', username: '', email: '', extension: '', phone: '', location: '', role: 'User' }
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="survey-field">
      {label}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function Score({ label, value }) {
  return (
    <div className="survey-score">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MetricSections({ sections }) {
  return (
    <div className="metric-panel">
      {sections.slice(1).map(section => (
        <div key={section.section}>
          <div className="metric-section-title">{section.section}</div>
          <div className="threshold-table-wrap">
            <table className="threshold-table metric-table">
              <tbody>
                {section.rows.map(row => (
                  <tr key={row.metric}>
                    <td>{row.metric}</td>
                    <td>{row.value}</td>
                    <td><span className={`status-pill status-${row.status}`}>{row.status === 'pass' ? 'Good' : row.status === 'warn' ? 'Watch' : row.status === 'fail' ? 'Fail' : '-'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
