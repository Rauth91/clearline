/**
 * Memoized System Design panel bodies — each receives only its state slice + stable handlers.
 */

import { memo, useRef } from 'react'
import QuickCard from './QuickCard.jsx'
import { useCrumpleDelete } from './CrumpleDelete.jsx'
import TipChips, { insertTipHeading } from './TipChips.jsx'

const YES_NO_FIELDS = new Set(['enabled', 'needed', 'perUser'])

const LONG_FIELDS = new Set([
  'summary', 'notes', 'list', 'closedMessage', 'overflow', 'didPlan',
  'greeting', 'menuPrompt', 'option0', 'option1', 'option2', 'option3', 'option4',
  'option5', 'option6', 'option7', 'option8', 'option9', 'timeoutAction', 'invalidAction',
  'destination', 'message', 'generalMailbox', 'daytimePath', 'afterHoursPath',
  'ringGroups', 'queues', 'failover', 'networkGear', 'firewall',
])

export const DesignSectionPanel = memo(function DesignSectionPanel({ id, data, onUpdate }) {
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
})

export const DesignMainNumbersPanel = memo(function DesignMainNumbersPanel({
  mainNumbers,
  onAdd,
  onUpdate,
  onRemove,
  onImportFromSurvey,
}) {
  const rows = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()
  return (
    <div>
      {bin}
      <div className="design-list-head">
        <div>
          <h3>Main numbers</h3>
          <p>Company lines used for the design and auto attendant.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onAdd}>Add number</button>
      </div>
      <div className="design-table">
        <div className="design-table-row design-table-head">
          <span>Label</span><span>Number</span><span>Notes</span><span />
        </div>
        {(mainNumbers || []).length === 0 && (
          <div className="empty-hint-action">
            <p>No main numbers yet. Import from Site Survey or add the primary line.</p>
            <button type="button" className="btn btn-primary" onClick={onImportFromSurvey}>Import from Survey</button>
          </div>
        )}
        {(mainNumbers || []).map(entry => (
          <div
            className="design-table-row"
            key={entry.id}
            ref={el => {
              if (el) rows.current.set(entry.id, el)
              else rows.current.delete(entry.id)
            }}
          >
            <input value={entry.label} onChange={e => onUpdate(entry.id, 'label', e.target.value)} placeholder="Main line" />
            <input value={entry.number} onChange={e => onUpdate(entry.id, 'number', e.target.value)} placeholder="337-555-0100" />
            <input value={entry.notes} onChange={e => onUpdate(entry.id, 'notes', e.target.value)} placeholder="Rings to AA" />
            <button type="button" onClick={() => crumple(rows.current.get(entry.id), () => onRemove(entry.id))}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
})

export const DesignUsersPanel = memo(function DesignUsersPanel({
  users,
  onAdd,
  onUpdate,
  onRemove,
  onImportFromSurvey,
}) {
  const rows = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()
  return (
    <div>
      {bin}
      <div className="design-list-head">
        <div>
          <h3>Users, extensions, and DIDs</h3>
          <p>Who gets an extension, email, which DID, and whether they need voicemail.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onAdd}>Add user</button>
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
        {(users || []).length === 0 && (
          <div className="empty-hint-action">
            <p>No users yet. Pull them from the Site Survey draft.</p>
            <button type="button" className="btn btn-primary" onClick={onImportFromSurvey}>Import from Survey</button>
          </div>
        )}
        {(users || []).map(user => (
          <div
            className="design-table-row"
            key={user.id}
            ref={el => {
              if (el) rows.current.set(user.id, el)
              else rows.current.delete(user.id)
            }}
          >
            <input value={user.name} onChange={e => onUpdate(user.id, 'name', e.target.value)} placeholder="Jane Tech" />
            <input value={user.username} onChange={e => onUpdate(user.id, 'username', e.target.value)} placeholder="jane.tech" />
            <input type="email" value={user.email || ''} onChange={e => onUpdate(user.id, 'email', e.target.value)} placeholder="jane@company.com" />
            <input value={user.extension} onChange={e => onUpdate(user.id, 'extension', e.target.value)} placeholder="1001" />
            <input value={user.did} onChange={e => onUpdate(user.id, 'did', e.target.value)} placeholder="337-555-0101" />
            <input value={user.location} onChange={e => onUpdate(user.id, 'location', e.target.value)} placeholder="Front desk" />
            <input value={user.role} onChange={e => onUpdate(user.id, 'role', e.target.value)} placeholder="User" />
            <select value={user.voicemail || 'Yes'} onChange={e => onUpdate(user.id, 'voicemail', e.target.value)}>
              <option>Yes</option>
              <option>No</option>
            </select>
            <button type="button" onClick={() => crumple(rows.current.get(user.id), () => onRemove(user.id))}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
})

export const DesignAssumptionsPanel = memo(function DesignAssumptionsPanel({ assumptions, onChange }) {
  const tips = [
    'Assumptions',
    'Carrier dependencies',
    'Number port timing',
    'Holiday overrides',
    'Customer decisions',
  ]
  return (
    <label className="survey-field full">
      Notes and assumptions
      <TipChips
        tips={tips}
        value={assumptions}
        onInsert={(tip) => onChange(insertTipHeading(assumptions, tip))}
      />
      <textarea
        value={assumptions}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. Port FOC is firm for Friday"
        rows={10}
      />
    </label>
  )
})

export const DesignQuickCardPanel = memo(function DesignQuickCardPanel({ jobId, design }) {
  return (
    <QuickCard
      embedded
      jobId={jobId}
      design={design}
    />
  )
})

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

function labelize(value) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
}
