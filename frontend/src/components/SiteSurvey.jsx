import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  NETWORK_RUN_COUNT,
  VISUALWARE_SAMPLE_REPORT,
  analyzeReadiness,
  networkRunProgress,
  normalizeNetworkSurvey,
  parseVisualwareReport,
} from '../lib/networkReadiness.js'
import {
  buildHtmlReport,
  createEmptySurvey,
  downloadPdfReport,
  emptySurveyUser,
  makeId,
  surveyExportFilename,
} from '../lib/surveyModel.js'
import { loadJobSurveyAsync, saveJobSurvey } from '../lib/jobModel.js'
import { hydrateSurveyPhotosForExport } from '../lib/photoStore.js'
import { canApplyRemoteRefresh, onDataChanged } from '../lib/dataEvents.js'
import { registerWorkspaceFlush } from '../lib/reloadGate.js'
import { ConflictBanner } from './ConflictReview.jsx'
import DownloadButton from './DownloadButton.jsx'
import {
  SurveyE911Panel,
  SurveyNetworkPanel,
  SurveyNumbersPanel,
  SurveyPhotosPanel,
  SurveySitePanel,
  SurveyTopologyPanel,
  SurveyUsersPanel,
} from './surveyPanels.jsx'

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
  ['e911', 'E911', 'Emergency locations and user assignments'],
  ['network', 'Network', '3 Speedtests + 3 MyConnection tests'],
  ['topology', 'Topology', 'Rack, switch, and phone layout'],
  ['photos', 'Photos', 'MDF, IDF, cabling, and site evidence'],
]

export default function SiteSurvey({ jobId }) {
  const [survey, setSurvey] = useState(() => createEmptySurvey())
  const [ready, setReady] = useState(false)
  const [parseNote, setParseNote] = useState(null)
  const [activePanel, setActivePanel] = useState(null)
  const [speedRun, setSpeedRun] = useState(0)
  const [mcRun, setMcRun] = useState(0)
  const importRef = useRef(null)
  const dirtyRef = useRef(false)
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
    dirtyRef.current = false
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
      dirtyRef.current = false
    }, 450)
    return () => clearTimeout(t)
  }, [survey, jobId, ready])

  useEffect(() => () => {
    if (jobId && ready) saveJobSurvey(jobId, latestSurvey.current)
  }, [jobId, ready])

  useEffect(() => {
    if (!jobId || !ready) return undefined
    return registerWorkspaceFlush(() => {
      saveJobSurvey(jobId, latestSurvey.current)
    })
  }, [jobId, ready])

  useEffect(() => {
    if (!jobId) return undefined
    return onDataChanged(async (detail) => {
      if (detail.kind !== 'job') return
      if (!(detail.ids || []).includes(jobId)) return
      if (dirtyRef.current) return
      const ok = await canApplyRemoteRefresh(jobId)
      if (!ok) return
      const data = await loadJobSurveyAsync(jobId)
      setSurvey(normalizeNetworkSurvey(data))
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

  const chips = useMemo(() => PANELS.map(([id, title]) => {
    const prog = panelProgress(survey, id)
    return { id, title, ...prog }
  }), [survey])

  const panelMeta = activePanel
    ? PANELS.find(([id]) => id === activePanel)
    : null

  const panelIndex = activePanel ? PANELS.findIndex(([id]) => id === activePanel) : -1

  const patchSurvey = useCallback((updater) => {
    dirtyRef.current = true
    setSurvey((prev) => {
      const patch = typeof updater === 'function' ? updater(prev) : updater
      return { ...prev, ...patch, updatedAt: new Date().toISOString() }
    })
  }, [])

  const onSiteField = useCallback((field, value) => {
    patchSurvey({ [field]: value })
  }, [patchSurvey])

  const onCustomerField = useCallback((field, value) => {
    patchSurvey(prev => ({ customer: { ...prev.customer, [field]: value } }))
  }, [patchSurvey])

  const onUpdateSpeedtest = useCallback((index, field, value) => {
    patchSurvey((prev) => {
      const speedtests = [...(prev.speedtests || [])]
      while (speedtests.length < NETWORK_RUN_COUNT) speedtests.push({})
      speedtests[index] = { ...speedtests[index], [field]: value }
      return { speedtests }
    })
  }, [patchSurvey])

  const onUpdateVisualware = useCallback((index, field, value) => {
    patchSurvey((prev) => {
      const visualwareRuns = [...(prev.visualwareRuns || [])]
      while (visualwareRuns.length < NETWORK_RUN_COUNT) visualwareRuns.push({})
      visualwareRuns[index] = { ...visualwareRuns[index], [field]: value }
      return { visualwareRuns }
    })
  }, [patchSurvey])

  const parseReport = useCallback((index = mcRun, text) => {
    const run = latestSurvey.current.visualwareRuns?.[index] || {}
    const paste = text ?? run.rawPaste
    const { data, matched } = parseVisualwareReport(paste)
    if (!matched) {
      setParseNote({ type: 'error', text: `Could not find MyConnection metrics in run ${index + 1}.` })
      return
    }
    patchSurvey((prev) => {
      const visualwareRuns = [...(prev.visualwareRuns || [])]
      while (visualwareRuns.length < NETWORK_RUN_COUNT) visualwareRuns.push({})
      visualwareRuns[index] = { ...visualwareRuns[index], ...data, rawPaste: paste }
      return {
        visualwareRuns,
        phoneCount: data.callsSimulated || prev.phoneCount,
      }
    })
    setParseNote({ type: 'ok', text: `Parsed ${matched} field(s) into MyConnection run ${index + 1}.` })
  }, [mcRun, patchSurvey])

  const loadVisualwareSample = useCallback(() => {
    parseReport(mcRun, VISUALWARE_SAMPLE_REPORT)
  }, [mcRun, parseReport])

  const addUser = useCallback(() => {
    patchSurvey(prev => ({
      users: [...prev.users, emptySurveyUser()],
      phoneCount: String(Math.max(Number(prev.phoneCount || 0), prev.users.length + 1)),
    }))
  }, [patchSurvey])

  const addUsers = useCallback((count) => {
    const nextUsers = Array.from({ length: count }, () => emptySurveyUser())
    patchSurvey(prev => ({
      users: [...prev.users, ...nextUsers],
      phoneCount: String(Math.max(Number(prev.phoneCount || 0), prev.users.length + count)),
    }))
  }, [patchSurvey])

  const updateUser = useCallback((id, field, value) => {
    patchSurvey(prev => ({
      users: prev.users.map(u => (u.id === id ? { ...u, [field]: value } : u)),
    }))
  }, [patchSurvey])

  const removeUser = useCallback((id) => {
    patchSurvey(prev => ({ users: prev.users.filter(u => u.id !== id) }))
  }, [patchSurvey])

  const addMainNumber = useCallback(() => {
    patchSurvey(prev => ({
      mainNumbers: [...(prev.mainNumbers || []), { id: makeId(), label: '', number: '', notes: '' }],
    }))
  }, [patchSurvey])

  const addMainNumberPreset = useCallback((label) => {
    patchSurvey(prev => ({
      mainNumbers: [...(prev.mainNumbers || []), { id: makeId(), label, number: '', notes: '' }],
    }))
  }, [patchSurvey])

  const updateMainNumber = useCallback((id, field, value) => {
    patchSurvey(prev => ({
      mainNumbers: (prev.mainNumbers || []).map(m => (m.id === id ? { ...m, [field]: value } : m)),
    }))
  }, [patchSurvey])

  const removeMainNumber = useCallback((id) => {
    patchSurvey(prev => ({
      mainNumbers: (prev.mainNumbers || []).filter(m => m.id !== id),
    }))
  }, [patchSurvey])

  const onE911Change = useCallback((patch) => {
    patchSurvey(patch)
  }, [patchSurvey])

  const onTopologyChange = useCallback((topology) => {
    patchSurvey({ topology })
  }, [patchSurvey])

  const onPhotosChange = useCallback((photos) => {
    patchSurvey({ photos })
  }, [patchSurvey])

  function startNew() {
    if (!confirm('Clear this site survey and start a new one for this job?')) return
    dirtyRef.current = true
    const blank = createEmptySurvey()
    setSurvey(blank)
    setParseNote(null)
    setActivePanel(null)
  }

  async function importJson(file) {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      dirtyRef.current = true
      setSurvey({ ...createEmptySurvey(), ...parsed, updatedAt: new Date().toISOString() })
      setParseNote({ type: 'ok', text: 'Imported survey JSON.' })
    } catch {
      setParseNote({ type: 'error', text: 'Could not import that JSON file.' })
    }
  }

  async function exportPdfRun({ onProgress }) {
    if (!survey.techName?.trim()) {
      const ok = confirm('No tech name entered yet. Export the PDF without a field tech name?')
      if (!ok) {
        const err = new Error('Export cancelled')
        err.name = 'AbortError'
        throw err
      }
    }
    onProgress(0.15)
    const hydrated = await hydrateSurveyPhotosForExport(jobId, latestSurvey.current)
    onProgress(0.35)
    const blob = await downloadPdfReport(hydrated, analyzeReadiness(hydrated))
    onProgress(1)
    return blob
  }

  async function exportWordRun({ onProgress }) {
    onProgress(0.2)
    const hydrated = await hydrateSurveyPhotosForExport(jobId, latestSurvey.current)
    onProgress(0.6)
    const html = buildHtmlReport(hydrated, analyzeReadiness(hydrated))
    onProgress(1)
    return new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  }

  async function exportHtmlRun({ onProgress }) {
    onProgress(0.2)
    const hydrated = await hydrateSurveyPhotosForExport(jobId, latestSurvey.current)
    onProgress(0.6)
    const html = buildHtmlReport(hydrated, analyzeReadiness(hydrated))
    onProgress(1)
    return new Blob([html], { type: 'text/html;charset=utf-8' })
  }

  async function exportDraftJsonRun({ onProgress }) {
    onProgress(0.2)
    const hydrated = await hydrateSurveyPhotosForExport(jobId, latestSurvey.current)
    onProgress(0.7)
    const blob = new Blob([JSON.stringify(hydrated, null, 2)], { type: 'application/json' })
    onProgress(1)
    return blob
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

  function renderActivePanel() {
    if (activePanel === 'site') {
      return (
        <SurveySitePanel
          techName={survey.techName}
          phoneCount={survey.phoneCount}
          customer={survey.customer}
          onField={onSiteField}
          onCustomerField={onCustomerField}
        />
      )
    }
    if (activePanel === 'numbers') {
      return (
        <SurveyNumbersPanel
          mainNumbers={survey.mainNumbers || []}
          onAdd={addMainNumber}
          onAddPreset={addMainNumberPreset}
          onUpdate={updateMainNumber}
          onRemove={removeMainNumber}
        />
      )
    }
    if (activePanel === 'users') {
      return (
        <SurveyUsersPanel
          users={survey.users || []}
          onAdd={addUser}
          onAddMany={addUsers}
          onUpdate={updateUser}
          onRemove={removeUser}
        />
      )
    }
    if (activePanel === 'network') {
      return (
        <SurveyNetworkPanel
          speedtests={survey.speedtests || []}
          visualwareRuns={survey.visualwareRuns || []}
          phoneCount={survey.phoneCount}
          readiness={readiness}
          parseNote={parseNote}
          speedRun={speedRun}
          setSpeedRun={setSpeedRun}
          mcRun={mcRun}
          setMcRun={setMcRun}
          onUpdateSpeedtest={onUpdateSpeedtest}
          onUpdateVisualware={onUpdateVisualware}
          onParseReport={parseReport}
          onLoadSample={loadVisualwareSample}
        />
      )
    }
    if (activePanel === 'e911') {
      return (
        <SurveyE911Panel
          e911Locations={survey.e911Locations || []}
          users={survey.users || []}
          onChange={onE911Change}
        />
      )
    }
    if (activePanel === 'topology') {
      return (
        <SurveyTopologyPanel
          topology={survey.topology}
          onChange={onTopologyChange}
        />
      )
    }
    if (activePanel === 'photos') {
      return (
        <SurveyPhotosPanel
          jobId={jobId}
          photos={survey.photos || []}
          onChange={onPhotosChange}
        />
      )
    }
    return null
  }

  return (
    <section className="site-survey">
      <ConflictBanner jobId={jobId} />
      <div className="survey-hero hero-grid">
        <div>
          <div className="survey-kicker">Field tech workspace</div>
          <h1>Site Survey</h1>
          <p>Open a section from the pills below — same flow as System Design. Export when the site is ready.</p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-secondary" onClick={startNew}>New survey</button>
          <DownloadButton
            className="btn-secondary"
            label="Save draft"
            filename={surveyExportFilename(survey, 'json')}
            run={exportDraftJsonRun}
            onError={() => alert('Could not save draft JSON.')}
          />
          <DownloadButton
            className="btn-primary"
            label="Export PDF"
            filename={surveyExportFilename(survey, 'pdf')}
            run={exportPdfRun}
            onError={() => alert('Could not create the PDF. Try Export HTML as a backup.')}
          />
          <details className="export-menu">
            <summary className="btn btn-secondary">More</summary>
            <div className="export-menu-panel">
              <button type="button" onClick={() => importRef.current?.click()}>Import draft</button>
              <DownloadButton
                label="Export Word"
                filename={surveyExportFilename(survey, 'doc')}
                run={exportWordRun}
              />
              <DownloadButton
                label="Export HTML"
                filename={surveyExportFilename(survey, 'html')}
                run={exportHtmlRun}
              />
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
              {renderActivePanel()}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
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
  if (id === 'e911') {
    const locs = survey.e911Locations || []
    const named = (survey.users || []).filter(u => String(u.name || '').trim())
    const assigned = named.filter(u => u.e911LocationId).length
    const locFilled = locs.filter(l => String(l.name || '').trim() && String(l.address || '').trim()).length
    const filled = locFilled + assigned
    const total = Math.max(1, locs.length + Math.max(named.length, 1))
    return { filled, total, ratio: filled / total }
  }
  if (id === 'photos') {
    const n = survey.photos?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  return { filled: 0, total: 1, ratio: 0 }
}

function Score({ label, value }) {
  return (
    <div className="survey-score">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
