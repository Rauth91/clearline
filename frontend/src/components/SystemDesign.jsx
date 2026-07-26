import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CallFlowDiagram from './CallFlowDiagram.jsx'
import {
  EMPTY_AUTO_ATTENDANT,
  EMPTY_CALL_FLOW_NOTES,
  EMPTY_HOURS,
  EMPTY_NIGHT_BUTTON,
  EMPTY_VOICEMAIL,
  createEmptyCallFlowPayload,
} from '../lib/callFlowShape.js'
import {
  downloadDesignPdf,
  exportDesignDoc,
  exportDesignHtml,
  sectionProgress,
} from '../lib/designModel.js'
import { makeId } from '../lib/surveyModel.js'
import {
  applySurveyToDesign,
  isDesignOutOfDate,
  loadJobDesign,
  loadJobSurvey,
  saveJobDesign,
} from '../lib/jobModel.js'
import { canApplyRemoteRefresh, onDataChanged } from '../lib/dataEvents.js'
import { registerWorkspaceFlush } from '../lib/reloadGate.js'
import { ConflictBanner } from './ConflictReview.jsx'
import {
  DesignAssumptionsPanel,
  DesignMainNumbersPanel,
  DesignQuickCardPanel,
  DesignSectionPanel,
  DesignUsersPanel,
} from './designPanels.jsx'

const EMPTY_DESIGN = {
  project: {
    customer: '',
    site: '',
    designer: '',
    targetDate: '',
    summary: '',
  },
  platform: {
    provider: '',
    pbx: '',
    sipTrunks: '',
    notes: '',
  },
  ...createEmptyCallFlowPayload(),
  hours: { ...EMPTY_HOURS },
  autoAttendant: { ...EMPTY_AUTO_ATTENDANT },
  nightButton: { ...EMPTY_NIGHT_BUTTON },
  voicemail: { ...EMPTY_VOICEMAIL },
  callFlow: { ...EMPTY_CALL_FLOW_NOTES },
  holidays: {
    list: '',
    closedMessage: '',
    overflow: '',
    notes: '',
  },
  numbering: {
    mainNumbers: '',
    extensionRange: '',
    didPlan: '',
    emergency: '',
  },
  users: [],
  devices: {
    phones: '',
    conference: '',
    analog: '',
    networkGear: '',
  },
  network: {
    voiceVlan: '',
    ipPlan: '',
    qos: '',
    firewall: '',
    poe: '',
  },
  assumptions: '',
}

/** Pill rail + modal sections (order = navigation order) */
const PANELS = [
  ['project', 'Project', 'Customer, site, designer, and design intent'],
  ['platform', 'Platform', 'PBX, carrier, SIP trunks, and provider notes'],
  ['hours', 'Hours', 'Weekday / weekend open hours and timezone'],
  ['holidays', 'Holidays', 'Closed dates, holiday greeting, and overflow'],
  ['numbering', 'Numbering', 'Main numbers, DID plan, extension range, E911'],
  ['autoAttendant', 'Auto attendant', 'Menu options and what each option does'],
  ['nightButton', 'Night button', 'Who toggles night mode and where calls go'],
  ['voicemail', 'Voicemail', 'Per-user, general mailbox, email, and retention'],
  ['callFlow', 'Call notes', 'Day, after-hours, ring groups, queues, failover'],
  ['devices', 'Devices', 'Phones, analog, conference, and network gear'],
  ['network', 'Network', 'VLAN, IP plan, QoS, PoE, firewall'],
  ['mainNumbers', 'Main numbers', 'Company lines used for AA and design'],
  ['users', 'Users & DIDs', 'Extensions, emails, DIDs, and voicemail per user'],
  ['assumptions', 'Assumptions', 'Risks, dependencies, and follow-ups'],
  ['quickCard', 'Quick cards', 'Print desk cards autofilled from users on this job'],
]

const MemoCallFlowDiagram = memo(CallFlowDiagram)

export default function SystemDesign({ jobId }) {
  const [design, setDesign] = useState(() => loadDesign(jobId))
  const [importNote, setImportNote] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [activePanel, setActivePanel] = useState(null)
  const [surveyDrift, setSurveyDrift] = useState(() => isDesignOutOfDate(jobId))
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = false
    setDesign(loadDesign(jobId))
    setImportNote(null)
    setActivePanel(null)
    setSurveyDrift(isDesignOutOfDate(jobId))
  }, [jobId])

  const latestDesign = useRef(design)
  latestDesign.current = design

  useEffect(() => {
    if (!jobId) return undefined
    const t = setTimeout(() => {
      saveJobDesign(jobId, latestDesign.current)
      dirtyRef.current = false
      setSurveyDrift(isDesignOutOfDate(jobId))
    }, 450)
    return () => clearTimeout(t)
  }, [design, jobId])

  useEffect(() => () => {
    if (jobId) {
      saveJobDesign(jobId, latestDesign.current)
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return undefined
    return registerWorkspaceFlush(() => {
      saveJobDesign(jobId, latestDesign.current)
    })
  }, [jobId])

  useEffect(() => {
    if (!jobId) return undefined
    return onDataChanged(async (detail) => {
      if (detail.kind !== 'job') return
      if (!(detail.ids || []).includes(jobId)) return
      if (dirtyRef.current) return
      const ok = await canApplyRemoteRefresh(jobId)
      if (!ok) return
      setDesign(loadDesign(jobId))
      setSurveyDrift(isDesignOutOfDate(jobId))
    })
  }, [jobId])

  useEffect(() => {
    if (!jobId) return undefined
    function onFocus() {
      setSurveyDrift(isDesignOutOfDate(jobId))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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

  const completion = useMemo(() => {
    const meaningful = countMeaningfulDesignFields(design)
    return {
      filled: meaningful.filled,
      total: meaningful.total,
      percent: meaningful.total ? Math.round((meaningful.filled / meaningful.total) * 100) : 0,
    }
  }, [design])

  const chips = useMemo(() => PANELS.map(([id, title]) => {
    const prog = panelProgress(design, id)
    return { id, title, ...prog }
  }), [design])

  /** Only flow-relevant slices — typing in assumptions/devices/etc. must not re-render the map. */
  const flowDesign = useMemo(() => ({
    hours: design.hours,
    autoAttendant: design.autoAttendant,
    nightButton: design.nightButton,
    voicemail: design.voicemail,
    callFlow: design.callFlow,
    numbering: design.numbering,
    mainNumbers: design.mainNumbers,
  }), [
    design.hours,
    design.autoAttendant,
    design.nightButton,
    design.voicemail,
    design.callFlow,
    design.numbering,
    design.mainNumbers,
  ])

  const panelMeta = activePanel
    ? PANELS.find(([id]) => id === activePanel)
    : null

  const markDirty = useCallback((updater) => {
    dirtyRef.current = true
    setDesign(updater)
  }, [])

  const update = useCallback((section, field, value) => {
    markDirty(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }))
  }, [markDirty])

  const importFromSurvey = useCallback(() => {
    const survey = loadJobSurvey(jobId)
    markDirty(prev => applySurveyToDesign(prev, survey))
    const mainCount = (survey.mainNumbers || []).filter(n => n.number || n.label).length
    const userCount = (survey.users || []).filter(u => u.name || u.extension || u.phone).length
    setImportNote({
      type: 'ok',
      text: `Synced from Site Survey: ${mainCount} main number(s), ${userCount} user(s).`,
    })
    setSurveyDrift(false)
  }, [jobId, markDirty])

  const addMainNumber = useCallback(() => {
    markDirty(prev => ({
      ...prev,
      mainNumbers: [...(prev.mainNumbers || []), { id: makeId(), label: '', number: '', notes: '' }],
    }))
  }, [markDirty])

  const updateMainNumber = useCallback((id, field, value) => {
    markDirty(prev => ({
      ...prev,
      mainNumbers: (prev.mainNumbers || []).map(n => (n.id === id ? { ...n, [field]: value } : n)),
    }))
  }, [markDirty])

  const removeMainNumber = useCallback((id) => {
    markDirty(prev => ({
      ...prev,
      mainNumbers: (prev.mainNumbers || []).filter(n => n.id !== id),
    }))
  }, [markDirty])

  const addUser = useCallback(() => {
    markDirty(prev => ({
      ...prev,
      users: [...(prev.users || []), {
        id: makeId(),
        name: '',
        username: '',
        email: '',
        extension: '',
        did: '',
        location: '',
        role: 'User',
        voicemail: 'Yes',
      }],
    }))
  }, [markDirty])

  const updateUser = useCallback((id, field, value) => {
    markDirty(prev => ({
      ...prev,
      users: (prev.users || []).map(u => (u.id === id ? { ...u, [field]: value } : u)),
    }))
  }, [markDirty])

  const removeUser = useCallback((id) => {
    markDirty(prev => ({
      ...prev,
      users: (prev.users || []).filter(u => u.id !== id),
    }))
  }, [markDirty])

  const onAssumptionsChange = useCallback((value) => {
    markDirty(prev => ({ ...prev, assumptions: value }))
  }, [markDirty])

  function reset() {
    if (!confirm('Clear this system design draft?')) return
    dirtyRef.current = true
    setDesign(EMPTY_DESIGN)
    setImportNote(null)
    setActivePanel(null)
  }

  async function exportPdf() {
    setExportingPdf(true)
    try {
      await downloadDesignPdf(design, completion)
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

  function renderActivePanel() {
    if (activePanel === 'quickCard') {
      return <DesignQuickCardPanel jobId={jobId} design={design} />
    }
    if (activePanel === 'mainNumbers') {
      return (
        <DesignMainNumbersPanel
          mainNumbers={design.mainNumbers || []}
          onAdd={addMainNumber}
          onUpdate={updateMainNumber}
          onRemove={removeMainNumber}
          onImportFromSurvey={importFromSurvey}
        />
      )
    }
    if (activePanel === 'users') {
      return (
        <DesignUsersPanel
          users={design.users || []}
          onAdd={addUser}
          onUpdate={updateUser}
          onRemove={removeUser}
          onImportFromSurvey={importFromSurvey}
        />
      )
    }
    if (activePanel === 'assumptions') {
      return (
        <DesignAssumptionsPanel
          assumptions={design.assumptions}
          onChange={onAssumptionsChange}
        />
      )
    }
    if (activePanel) {
      return (
        <DesignSectionPanel
          id={activePanel}
          data={design[activePanel]}
          onUpdate={update}
        />
      )
    }
    return null
  }

  const panelIndex = activePanel ? PANELS.findIndex(([id]) => id === activePanel) : -1

  return (
    <section className="system-design">
      <ConflictBanner jobId={jobId} />
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">System design</div>
          <h1>Voice architecture</h1>
          <p>
            Open a section from the pills below — no long page scroll. The call flow map stays live as you fill fields.
          </p>
        </div>
        <div className="design-score">
          <span>Plan completion</span>
          <strong>{completion.percent}%</strong>
          <small>{completion.filled}/{completion.total} fields</small>
        </div>
      </div>

      <div className="design-actions survey-actions">
        <button type="button" className="btn btn-secondary" onClick={importFromSurvey}>
          Import from Survey
        </button>
        <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exportingPdf}>
          {exportingPdf ? 'Creating PDF…' : 'Export PDF'}
        </button>
        <details className="export-menu">
          <summary className="btn btn-secondary">More</summary>
          <div className="export-menu-panel">
            <button type="button" onClick={() => exportDesignDoc(design, completion)}>Export Word</button>
            <button type="button" onClick={() => exportDesignHtml(design, completion)}>Export HTML</button>
            <button type="button" onClick={reset}>Clear design</button>
          </div>
        </details>
      </div>

      {surveyDrift && (
        <div className="parse-note parse-warn design-drift-note">
          <span>Site Survey numbers or users changed after the last import. Design may be out of date.</span>
          <button type="button" className="btn btn-primary" onClick={importFromSurvey}>
            Re-sync from Survey
          </button>
        </div>
      )}

      {importNote && (
        <div className={importNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {importNote.text}
        </div>
      )}

      <div className="progress-chips" aria-label="Design sections">
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

      <div className="design-flow-wrap" id="design-flow-map">
        <MemoCallFlowDiagram design={flowDesign} />
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
            className={`section-modal${activePanel === 'quickCard' ? ' section-modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="section-modal-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">
                  Section {panelIndex + 1} of {PANELS.length}
                </div>
                <h2 id="section-modal-title">{panelMeta[1]}</h2>
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

function panelProgress(design, id) {
  if (id === 'quickCard') {
    const n = (design.users || []).filter(u =>
      String(u.name || '').trim() || String(u.extension || '').trim() || String(u.did || '').trim(),
    ).length
    return { filled: n > 0 ? 1 : 0, total: 1, ratio: n > 0 ? 1 : 0 }
  }
  if (id === 'mainNumbers') {
    const n = design.mainNumbers?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  if (id === 'users') {
    const n = design.users?.length || 0
    return { filled: n, total: Math.max(1, n), ratio: n > 0 ? 1 : 0 }
  }
  if (id === 'assumptions') {
    const filled = String(design.assumptions || '').trim() ? 1 : 0
    return { filled, total: 1, ratio: filled }
  }
  return sectionProgress(design, id)
}

function loadDesign(jobId) {
  try {
    const saved = loadJobDesign(jobId)
    return saved ? mergeDesign(saved) : EMPTY_DESIGN
  } catch {
    return EMPTY_DESIGN
  }
}

function mergeDesign(saved) {
  return {
    ...EMPTY_DESIGN,
    ...saved,
    project: { ...EMPTY_DESIGN.project, ...saved.project },
    platform: { ...EMPTY_DESIGN.platform, ...saved.platform },
    hours: { ...EMPTY_DESIGN.hours, ...saved.hours },
    holidays: { ...EMPTY_DESIGN.holidays, ...saved.holidays },
    numbering: { ...EMPTY_DESIGN.numbering, ...saved.numbering },
    autoAttendant: { ...EMPTY_DESIGN.autoAttendant, ...saved.autoAttendant },
    nightButton: { ...EMPTY_DESIGN.nightButton, ...saved.nightButton },
    voicemail: { ...EMPTY_DESIGN.voicemail, ...saved.voicemail },
    callFlow: { ...EMPTY_DESIGN.callFlow, ...saved.callFlow },
    devices: { ...EMPTY_DESIGN.devices, ...saved.devices },
    network: { ...EMPTY_DESIGN.network, ...saved.network },
    mainNumbers: Array.isArray(saved.mainNumbers) ? saved.mainNumbers : [],
    users: Array.isArray(saved.users) ? saved.users : [],
    surveyImport: saved.surveyImport || null,
  }
}

function omitArrays(design) {
  const { mainNumbers, users, ...rest } = design
  return rest
}

/** Only count real content — ignore empty Yes/No placeholders */
function countMeaningfulDesignFields(design) {
  const skipKeys = new Set(['enabled', 'needed', 'perUser'])
  let filled = 0
  let total = 0

  function walk(obj) {
    if (obj == null || typeof obj !== 'object') return
    Object.entries(obj).forEach(([key, value]) => {
      if (key === 'mainNumbers' || key === 'users' || key === 'surveyImport') return
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value)
        return
      }
      if (skipKeys.has(key) && (value === '' || value === 'Yes' || value === 'No')) {
        if (value === 'Yes' || value === 'No') {
          total += 1
          filled += 1
        } else {
          total += 1
        }
        return
      }
      total += 1
      if (String(value || '').trim()) filled += 1
    })
  }

  walk(omitArrays(design))
  const userRows = (design.users || []).filter(u => String(u.name || '').trim() || String(u.extension || '').trim() || String(u.did || '').trim())
  const numberRows = (design.mainNumbers || []).filter(n => String(n.number || '').trim() || String(n.label || '').trim())
  const listTotal = 2
  const listFilled = (userRows.length > 0 ? 1 : 0) + (numberRows.length > 0 ? 1 : 0)
  return {
    filled: filled + listFilled,
    total: Math.max(1, total + listTotal),
  }
}
