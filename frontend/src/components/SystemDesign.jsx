import { useEffect, useMemo, useRef, useState } from 'react'
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
]

const YES_NO_FIELDS = new Set(['enabled', 'needed', 'perUser'])

const LONG_FIELDS = new Set([
  'summary', 'notes', 'list', 'closedMessage', 'overflow', 'didPlan',
  'greeting', 'menuPrompt', 'option0', 'option1', 'option2', 'option3', 'option4',
  'option5', 'option6', 'option7', 'option8', 'option9', 'timeoutAction', 'invalidAction',
  'destination', 'message', 'generalMailbox', 'daytimePath', 'afterHoursPath',
  'ringGroups', 'queues', 'failover', 'networkGear', 'firewall',
])

export default function SystemDesign({ jobId }) {
  const [design, setDesign] = useState(() => loadDesign(jobId))
  const [importNote, setImportNote] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [activePanel, setActivePanel] = useState(null)
  const [surveyDrift, setSurveyDrift] = useState(() => isDesignOutOfDate(jobId))

  useEffect(() => {
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

  const panelMeta = activePanel
    ? PANELS.find(([id]) => id === activePanel)
    : null

  function movePanel(delta) {
    setActivePanel(current => {
      if (!current) return current
      const idx = PANELS.findIndex(([id]) => id === current)
      if (idx < 0) return current
      const next = PANELS[idx + delta]
      return next ? next[0] : current
    })
  }

  function update(section, field, value) {
    setDesign(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }))
  }

  function importFromSurvey() {
    const survey = loadJobSurvey(jobId)
    setDesign(prev => applySurveyToDesign(prev, survey))
    const mainCount = (survey.mainNumbers || []).filter(n => n.number || n.label).length
    const userCount = (survey.users || []).filter(u => u.name || u.extension || u.phone).length
    setImportNote({
      type: 'ok',
      text: `Synced from Site Survey: ${mainCount} main number(s), ${userCount} user(s).`,
    })
    setSurveyDrift(false)
  }

  function reset() {
    if (!confirm('Clear this system design draft?')) return
    setDesign(EMPTY_DESIGN)
    setImportNote(null)
    setActivePanel(null)
  }

  function addMainNumber() {
    setDesign(prev => ({
      ...prev,
      mainNumbers: [...(prev.mainNumbers || []), { id: makeId(), label: '', number: '', notes: '' }],
    }))
  }

  function updateMainNumber(id, field, value) {
    setDesign(prev => ({
      ...prev,
      mainNumbers: (prev.mainNumbers || []).map(n => n.id === id ? { ...n, [field]: value } : n),
    }))
  }

  function removeMainNumber(id) {
    setDesign(prev => ({
      ...prev,
      mainNumbers: (prev.mainNumbers || []).filter(n => n.id !== id),
    }))
  }

  function addUser() {
    setDesign(prev => ({
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
  }

  function updateUser(id, field, value) {
    setDesign(prev => ({
      ...prev,
      users: (prev.users || []).map(u => u.id === id ? { ...u, [field]: value } : u),
    }))
  }

  function removeUser(id) {
    setDesign(prev => ({
      ...prev,
      users: (prev.users || []).filter(u => u.id !== id),
    }))
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

  const panelIndex = activePanel ? PANELS.findIndex(([id]) => id === activePanel) : -1

  return (
    <section className="system-design">
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
        <CallFlowDiagram design={design} />
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
              <PanelBody
                id={activePanel}
                design={design}
                setDesign={setDesign}
                onUpdate={update}
                importFromSurvey={importFromSurvey}
                addMainNumber={addMainNumber}
                updateMainNumber={updateMainNumber}
                removeMainNumber={removeMainNumber}
                addUser={addUser}
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

function PanelBody({
  id,
  design,
  setDesign,
  onUpdate,
  importFromSurvey,
  addMainNumber,
  updateMainNumber,
  removeMainNumber,
  addUser,
  updateUser,
  removeUser,
}) {
  if (id === 'mainNumbers') {
    return (
      <div>
        <div className="design-list-head">
          <div>
            <h3>Main numbers</h3>
            <p>Company lines used for the design and auto attendant.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={addMainNumber}>Add number</button>
        </div>
        <div className="design-table">
          <div className="design-table-row design-table-head">
            <span>Label</span><span>Number</span><span>Notes</span><span />
          </div>
          {(design.mainNumbers || []).length === 0 && (
            <div className="empty-hint-action">
              <p>No main numbers yet. Import from Site Survey or add the primary line.</p>
              <button type="button" className="btn btn-primary" onClick={importFromSurvey}>Import from Survey</button>
            </div>
          )}
          {(design.mainNumbers || []).map(entry => (
            <div className="design-table-row" key={entry.id}>
              <input value={entry.label} onChange={e => updateMainNumber(entry.id, 'label', e.target.value)} placeholder="Main line" />
              <input value={entry.number} onChange={e => updateMainNumber(entry.id, 'number', e.target.value)} placeholder="337-555-0100" />
              <input value={entry.notes} onChange={e => updateMainNumber(entry.id, 'notes', e.target.value)} placeholder="Rings to AA" />
              <button type="button" onClick={() => removeMainNumber(entry.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (id === 'users') {
    return (
      <div>
        <div className="design-list-head">
          <div>
            <h3>Users, extensions, and DIDs</h3>
            <p>Who gets an extension, email, which DID, and whether they need voicemail.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={addUser}>Add user</button>
        </div>
        <div className="design-table design-user-table">
          <div className="design-table-row design-table-head">
            <span>Name</span>
            <span>Username</span>
            <span>Email</span>
            <span>Ext</span>
            <span>DID</span>
            <span>Location</span>
            <span>Role</span>
            <span>VM</span>
            <span />
          </div>
          {(design.users || []).length === 0 && (
            <div className="empty-hint-action">
              <p>No users yet. Pull them from the Site Survey draft.</p>
              <button type="button" className="btn btn-primary" onClick={importFromSurvey}>Import from Survey</button>
            </div>
          )}
          {(design.users || []).map(user => (
            <div className="design-table-row" key={user.id}>
              <input value={user.name} onChange={e => updateUser(user.id, 'name', e.target.value)} placeholder="Jane Tech" />
              <input value={user.username} onChange={e => updateUser(user.id, 'username', e.target.value)} placeholder="jane.tech" />
              <input type="email" value={user.email || ''} onChange={e => updateUser(user.id, 'email', e.target.value)} placeholder="jane@company.com" />
              <input value={user.extension} onChange={e => updateUser(user.id, 'extension', e.target.value)} placeholder="1001" />
              <input value={user.did} onChange={e => updateUser(user.id, 'did', e.target.value)} placeholder="337-555-0101" />
              <input value={user.location} onChange={e => updateUser(user.id, 'location', e.target.value)} placeholder="Front desk" />
              <input value={user.role} onChange={e => updateUser(user.id, 'role', e.target.value)} placeholder="User" />
              <select value={user.voicemail || 'Yes'} onChange={e => updateUser(user.id, 'voicemail', e.target.value)}>
                <option>Yes</option>
                <option>No</option>
              </select>
              <button type="button" onClick={() => removeUser(user.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (id === 'assumptions') {
    return (
      <label className="survey-field full">
        Notes and assumptions
        <textarea
          value={design.assumptions}
          onChange={e => setDesign(prev => ({ ...prev, assumptions: e.target.value }))}
          placeholder="Document assumptions, carrier dependencies, number port timing, holiday overrides, customer decisions..."
          rows={10}
        />
      </label>
    )
  }

  return <SectionFields id={id} data={design[id]} onUpdate={onUpdate} />
}

function panelProgress(design, id) {
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

function SectionFields({ id, data, onUpdate }) {
  return (
    <div className="design-fields">
      {Object.entries(data || {}).map(([field, value]) => (
        <label key={field} className={LONG_FIELDS.has(field) ? 'span-2' : ''}>
          <span>{fieldLabel(id, field)}</span>
          {YES_NO_FIELDS.has(field) ? (
            <select value={value || ''} onChange={e => onUpdate(id, field, e.target.value)}>
              <option value="">—</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          ) : LONG_FIELDS.has(field) ? (
            <textarea
              value={value}
              onChange={e => onUpdate(id, field, e.target.value)}
              placeholder={placeholderFor(id, field)}
            />
          ) : (
            <input
              value={value}
              onChange={e => onUpdate(id, field, e.target.value)}
              placeholder={placeholderFor(id, field)}
            />
          )}
        </label>
      ))}
    </div>
  )
}

function fieldLabel(section, field) {
  const labels = {
    weekdayOpen: 'Weekday open',
    weekdayClose: 'Weekday close',
    saturdayOpen: 'Saturday open',
    saturdayClose: 'Saturday close',
    sundayOpen: 'Sunday open',
    sundayClose: 'Sunday close',
    lunchHours: 'Lunch / mid-day break',
    closedMessage: 'Holiday closed message',
    overflow: 'Holiday call overflow',
    didPlan: 'DID plan',
    emergency: 'E911 / emergency notes',
    option0: 'Press 0',
    option1: 'Press 1',
    option2: 'Press 2',
    option3: 'Press 3',
    option4: 'Press 4',
    option5: 'Press 5',
    option6: 'Press 6',
    option7: 'Press 7',
    option8: 'Press 8',
    option9: 'Press 9',
    timeoutAction: 'Timeout action',
    invalidAction: 'Invalid digit action',
    menuPrompt: 'Menu prompt script',
    whoUses: 'Who uses night button',
    whenUsed: 'When it is used',
    destination: 'Night destination',
    needed: 'Voicemail needed',
    perUser: 'Per-user voicemail',
    generalMailbox: 'General / group mailbox',
    emailNotification: 'Email notification',
    retention: 'Message retention',
    daytimePath: 'Daytime call path',
    afterHoursPath: 'After-hours call path',
    ringGroups: 'Ring groups',
    queues: 'Queues',
    failover: 'Failover path',
    sipTrunks: 'SIP trunks',
    pbx: 'PBX / platform',
  }
  return labels[field] || labelize(field)
}

function placeholderFor(section, field) {
  const map = {
    'autoAttendant.greeting': 'Thank you for calling...',
    'autoAttendant.option1': 'Sales — ring group 200',
    'autoAttendant.option2': 'Support — queue 300',
    'autoAttendant.option0': 'Operator — ext 100',
    'nightButton.destination': 'Night AA / after-hours mailbox',
    'holidays.list': 'New Year’s Day, Memorial Day, July 4, Thanksgiving, Christmas...',
    'callFlow.daytimePath': 'Main DID → AA → menu options',
    'callFlow.afterHoursPath': 'Main DID → night greeting → mailbox / on-call',
  }
  return map[`${section}.${field}`] || ''
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

  function walk(obj, parentKey = '') {
    if (obj == null || typeof obj !== 'object') return
    Object.entries(obj).forEach(([key, value]) => {
      if (key === 'mainNumbers' || key === 'users' || key === 'surveyImport') return
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, key)
        return
      }
      if (skipKeys.has(key) && (value === '' || value === 'Yes' || value === 'No')) {
        // Still count if they explicitly set Yes/No as a decision? Only if non-empty AND we want credit
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
  // Treat lists as up to a soft target so empty stays 0%
  const listTotal = 2
  const listFilled = (userRows.length > 0 ? 1 : 0) + (numberRows.length > 0 ? 1 : 0)
  return {
    filled: filled + listFilled,
    total: Math.max(1, total + listTotal),
  }
}

function flattenValues(value) {
  if (value == null || typeof value !== 'object') return [value]
  return Object.values(value).flatMap(flattenValues)
}

function labelize(value) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
}
