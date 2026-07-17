/**
 * Auto-generated provisioning view from Survey + Design.
 */

import { useMemo } from 'react'

export function buildProvisionData(survey, design) {
  const designUsers = design?.users || []
  const surveyUsers = survey?.users || []

  const users = designUsers.length
    ? designUsers.map(u => ({
      name: u.name || '',
      extension: u.extension || '',
      did: u.did || '',
      role: u.role || 'User',
      voicemail: u.voicemail || 'Yes',
      location: u.location || '',
    }))
    : surveyUsers.map(u => ({
      name: u.name || '',
      extension: u.extension || '',
      did: u.phone || '',
      role: u.role || 'User',
      voicemail: 'Yes',
      location: u.location || '',
    }))

  const mainNumbers = (design?.mainNumbers?.length ? design.mainNumbers : survey?.mainNumbers || [])
    .map(n => ({
      label: n.label || '',
      number: n.number || '',
      notes: n.notes || '',
    }))

  const aaOptions = []
  const aa = design?.autoAttendant || {}
  for (let i = 0; i <= 9; i += 1) {
    const action = String(aa[`option${i}`] || '').trim()
    if (action) aaOptions.push({ digit: String(i), action })
  }

  return {
    users,
    mainNumbers,
    aaOptions,
    hours: design?.hours || null,
    nightButton: design?.nightButton || null,
    greeting: aa.greeting || '',
    menuPrompt: aa.menuPrompt || '',
    hasData: users.length > 0 || mainNumbers.length > 0 || aaOptions.length > 0,
  }
}

export default function ProvisioningSheet({ survey, design }) {
  const data = useMemo(() => buildProvisionData(survey, design), [survey, design])

  if (!data.hasData) {
    return (
      <div className="empty-hint-action">
        <p>No provisioning data yet. Complete Site Survey users/numbers or System Design, then return here.</p>
      </div>
    )
  }

  return (
    <div className="provision-sheet">
      <div className="provision-block">
        <h3>Main numbers</h3>
        <div className="design-table">
          <div className="design-table-row design-table-head">
            <span>Label</span><span>Number</span><span>Notes</span>
          </div>
          {data.mainNumbers.length === 0 && <p className="empty-hint">No main numbers</p>}
          {data.mainNumbers.map((n, i) => (
            <div className="design-table-row provision-row" key={`${n.number}-${i}`}>
              <span>{n.label || '—'}</span>
              <span className="mono">{n.number || '—'}</span>
              <span>{n.notes || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="provision-block">
        <h3>Users / extensions / DIDs</h3>
        <div className="design-table design-user-table">
          <div className="design-table-row design-table-head">
            <span>Name</span><span>Ext</span><span>DID</span><span>Role</span><span>VM</span><span>Location</span>
          </div>
          {data.users.length === 0 && <p className="empty-hint">No users</p>}
          {data.users.map((u, i) => (
            <div className="design-table-row provision-row" key={`${u.extension}-${i}`}>
              <span>{u.name || '—'}</span>
              <span className="mono">{u.extension || '—'}</span>
              <span className="mono">{u.did || '—'}</span>
              <span>{u.role || '—'}</span>
              <span>{u.voicemail || '—'}</span>
              <span>{u.location || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="provision-block">
        <h3>Auto attendant menu</h3>
        {(data.greeting || data.menuPrompt) && (
          <p className="provision-script">
            {data.greeting && <><strong>Greeting:</strong> {data.greeting}<br /></>}
            {data.menuPrompt && <><strong>Menu:</strong> {data.menuPrompt}</>}
          </p>
        )}
        <div className="design-table">
          <div className="design-table-row design-table-head">
            <span>Digit</span><span>Action</span>
          </div>
          {data.aaOptions.length === 0 && <p className="empty-hint">No AA options filled in Design yet</p>}
          {data.aaOptions.map(o => (
            <div className="design-table-row provision-row provision-aa-row" key={o.digit}>
              <span className="mono">Press {o.digit}</span>
              <span>{o.action}</span>
            </div>
          ))}
        </div>
      </div>

      {data.hours && (
        <div className="provision-block">
          <h3>Hours</h3>
          <p className="provision-script">
            Weekday {data.hours.weekdayOpen || '—'} – {data.hours.weekdayClose || '—'}
            {data.hours.timezone ? ` · ${data.hours.timezone}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
