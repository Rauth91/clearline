/**
 * Memoized Site Survey panel bodies — each receives only its state slice + stable handlers.
 */

import { memo, useRef } from 'react'
import SurveyPhotos from './SurveyPhotos.jsx'
import TopologyEditor from './TopologyEditor.jsx'
import E911Section from './E911Section.jsx'
import { useCrumpleDelete } from './CrumpleDelete.jsx'
import TipChips, { insertTipHeading } from './TipChips.jsx'
import {
  NETWORK_RUN_COUNT,
  QUALITY_THRESHOLDS,
  networkRunProgress,
} from '../lib/networkReadiness.js'
import { NetworkScoreStrip } from './NetworkShared.jsx'

const MAIN_NUMBER_PRESETS = ['Main line', 'Fax', 'Toll-free', 'Auto-attendant']

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

export const SurveySitePanel = memo(function SurveySitePanel({
  techName,
  phoneCount,
  customer,
  onField,
  onCustomerField,
}) {
  return (
    <>
      <div className="survey-form-grid">
        <Field label="Field tech name" value={techName || ''} onChange={v => onField('techName', v)} />
        <Field label="Company" value={customer.company} onChange={v => onCustomerField('company', v)} />
        <Field label="Site name" value={customer.siteName} onChange={v => onCustomerField('siteName', v)} />
        <Field label="Ticket / project" value={customer.ticketId} onChange={v => onCustomerField('ticketId', v)} />
        <Field label="Phones planned" type="number" value={phoneCount} onChange={v => onField('phoneCount', v)} />
        <Field label="Contact name" value={customer.contactName} onChange={v => onCustomerField('contactName', v)} />
        <Field label="Contact phone" value={customer.contactPhone} onChange={v => onCustomerField('contactPhone', v)} />
        <Field label="Contact email" value={customer.contactEmail} onChange={v => onCustomerField('contactEmail', v)} />
        <Field label="Address" value={customer.address} onChange={v => onCustomerField('address', v)} />
      </div>
      <label className="survey-field full">
        Site / access notes
        <TipChips
          tips={['Parking', 'MDF location', 'VLAN notes', 'Firewall owner', 'Access instructions']}
          value={customer.notes}
          onInsert={(tip) => onCustomerField('notes', insertTipHeading(customer.notes, tip))}
        />
        <textarea
          value={customer.notes}
          onChange={e => onCustomerField('notes', e.target.value)}
          placeholder="e.g. MDF is in the basement cage"
        />
      </label>
    </>
  )
})

export const SurveyNumbersPanel = memo(function SurveyNumbersPanel({
  mainNumbers,
  onAdd,
  onAddPreset,
  onUpdate,
  onRemove,
}) {
  const rows = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()
  return (
    <>
      {bin}
      <div className="design-list-head">
        <div>
          <h3>Company main numbers</h3>
          <p>Primary business line, fax, toll-free, and auto-attendant DIDs.</p>
        </div>
        <div className="btn-row">
          {MAIN_NUMBER_PRESETS.map(label => (
            <button key={label} type="button" className="btn btn-secondary" onClick={() => onAddPreset(label)}>{label}</button>
          ))}
          <button type="button" className="btn btn-primary" onClick={onAdd}>Custom</button>
        </div>
      </div>
      <div className="main-number-table">
        <div className="main-number-row main-number-head">
          <span>Label</span><span>Number</span><span>Notes</span><span />
        </div>
        {mainNumbers.length === 0 && (
          <div className="empty-hint-action">
            <p>No main numbers yet. Start with the primary business line.</p>
            <button type="button" className="btn btn-primary" onClick={() => onAddPreset('Main line')}>Add main line</button>
          </div>
        )}
        {mainNumbers.map(entry => (
          <div
            className="main-number-row"
            key={entry.id}
            ref={el => {
              if (el) rows.current.set(entry.id, el)
              else rows.current.delete(entry.id)
            }}
          >
            <input value={entry.label} onChange={e => onUpdate(entry.id, 'label', e.target.value)} placeholder="Main line / Fax / Toll-free" />
            <input value={entry.number} onChange={e => onUpdate(entry.id, 'number', e.target.value)} placeholder="337-555-0100" />
            <input value={entry.notes} onChange={e => onUpdate(entry.id, 'notes', e.target.value)} placeholder="Rings to reception, port from carrier..." />
            <button type="button" onClick={() => crumple(rows.current.get(entry.id), () => onRemove(entry.id))}>Remove</button>
          </div>
        ))}
      </div>
    </>
  )
})

export const SurveyUsersPanel = memo(function SurveyUsersPanel({
  users,
  onAdd,
  onAddMany,
  onUpdate,
  onRemove,
}) {
  const rows = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()
  return (
    <>
      {bin}
      <div className="design-list-head">
        <div>
          <h3>Users and phones</h3>
          <p>Who gets a phone, email, extension, and DID at this site.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => onAddMany(5)}>Add 5 users</button>
          <button type="button" className="btn btn-primary" onClick={onAdd}>Add user</button>
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
        {users.length === 0 && (
          <div className="empty-hint-action">
            <p>No users yet. Add the first extension or bulk-add five rows.</p>
            <button type="button" className="btn btn-primary" onClick={onAdd}>Add user</button>
          </div>
        )}
        {users.map(user => (
          <div
            className="user-row"
            key={user.id}
            ref={el => {
              if (el) rows.current.set(user.id, el)
              else rows.current.delete(user.id)
            }}
          >
            <input value={user.name} onChange={e => onUpdate(user.id, 'name', e.target.value)} placeholder="Jane Tech" />
            <input value={user.username} onChange={e => onUpdate(user.id, 'username', e.target.value)} placeholder="jane.tech" />
            <input type="email" value={user.email || ''} onChange={e => onUpdate(user.id, 'email', e.target.value)} placeholder="jane@company.com" />
            <input value={user.extension || ''} onChange={e => onUpdate(user.id, 'extension', e.target.value)} placeholder="1001" />
            <input value={user.phone || ''} onChange={e => onUpdate(user.id, 'phone', e.target.value)} placeholder="337-555-0100" />
            <input value={user.location || ''} onChange={e => onUpdate(user.id, 'location', e.target.value)} placeholder="Front desk" />
            <input value={user.role} onChange={e => onUpdate(user.id, 'role', e.target.value)} placeholder="User" />
            <button type="button" onClick={() => crumple(rows.current.get(user.id), () => onRemove(user.id))}>Remove</button>
          </div>
        ))}
      </div>
    </>
  )
})

export const SurveyNetworkPanel = memo(function SurveyNetworkPanel({
  speedtests,
  visualwareRuns,
  phoneCount,
  readiness,
  parseNote,
  speedRun,
  setSpeedRun,
  mcRun,
  setMcRun,
  onUpdateSpeedtest,
  onUpdateVisualware,
  onParseReport,
  onLoadSample,
}) {
  const st = speedtests[speedRun] || {}
  const vw = visualwareRuns[mcRun] || {}
  const netProg = networkRunProgress({ speedtests, visualwareRuns, phoneCount })

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
      <NetworkScoreStrip
        jitter={readiness.summary.jitter}
        loss={readiness.summary.loss}
        mos={readiness.summary.mos}
        callsLabel={readiness.summary.supported != null
          ? `${readiness.summary.supported}/${readiness.summary.requested}`
          : '-'}
      />

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
          <Field label="Download Mbps" type="number" value={st.downloadMbps || ''} onChange={v => onUpdateSpeedtest(speedRun, 'downloadMbps', v)} />
          <Field label="Upload Mbps" type="number" value={st.uploadMbps || ''} onChange={v => onUpdateSpeedtest(speedRun, 'uploadMbps', v)} />
          <Field label="Latency ms" type="number" value={st.latencyMs || ''} onChange={v => onUpdateSpeedtest(speedRun, 'latencyMs', v)} />
          <Field label="Server" value={st.server || ''} onChange={v => onUpdateSpeedtest(speedRun, 'server', v)} />
          <Field label="Tested at" type="datetime-local" value={st.testedAt || ''} onChange={v => onUpdateSpeedtest(speedRun, 'testedAt', v)} />
          <Field label="Notes" value={st.notes || ''} onChange={v => onUpdateSpeedtest(speedRun, 'notes', v)} />
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
            <button type="button" className="btn btn-secondary" onClick={onLoadSample}>Load sample</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onParseReport(mcRun)}
              disabled={!String(vw.rawPaste || '').trim()}
            >
              Parse run {mcRun + 1}
            </button>
          </div>
        </div>
        <textarea
          className="report-textarea"
          value={vw.rawPaste || ''}
          onChange={e => onUpdateVisualware(mcRun, 'rawPaste', e.target.value)}
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
})

export const SurveyE911Panel = memo(function SurveyE911Panel({ e911Locations, users, onChange }) {
  return (
    <E911Section
      survey={{ e911Locations, users }}
      onChange={onChange}
    />
  )
})

export const SurveyTopologyPanel = memo(function SurveyTopologyPanel({ topology, onChange }) {
  return <TopologyEditor topology={topology} onChange={onChange} />
})

export const SurveyPhotosPanel = memo(function SurveyPhotosPanel({ jobId, photos, onChange }) {
  return <SurveyPhotos jobId={jobId} photos={photos} onChange={onChange} />
})

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="survey-field">
      {label}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </label>
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
