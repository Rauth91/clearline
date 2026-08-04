/**
 * E911Section — locations table + assign on user rows
 */

import { useRef } from 'react'
import { emptyE911Location, makeId } from '../lib/surveyModel.js'
import { useCrumpleDelete } from './CrumpleDelete.jsx'

export default function E911Section({ survey, onChange }) {
  const locations = survey.e911Locations || []
  const users = survey.users || []
  const rows = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()

  function setLocations(next) {
    onChange({ e911Locations: next })
  }

  function setUsers(next) {
    onChange({ users: next })
  }

  function addLocation() {
    setLocations([...locations, emptyE911Location({ name: `Location ${locations.length + 1}` })])
  }

  function updateLocation(id, field, value) {
    setLocations(locations.map(l => (l.id === id ? { ...l, [field]: value } : l)))
  }

  function removeLocation(id) {
    setLocations(locations.filter(l => l.id !== id))
    setUsers(users.map(u => (u.e911LocationId === id ? { ...u, e911LocationId: '' } : u)))
  }

  function assignUser(userId, locationId) {
    setUsers(users.map(u => (u.id === userId ? { ...u, e911LocationId: locationId } : u)))
  }

  return (
    <div className="e911-section">
      {bin}
      <div className="design-list-head">
        <div>
          <h3>E911 locations</h3>
          <p>Physical addresses for emergency routing. Assign each user to a location.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={addLocation}>
          Add location
        </button>
      </div>

      {locations.length === 0 && (
        <div className="empty-hint-action">
          <p>No E911 locations yet. Add the site address and any remote/satellite sites.</p>
          <button type="button" className="btn btn-primary" onClick={addLocation}>
            Add location
          </button>
        </div>
      )}

      <div className="e911-locations">
        {locations.map(loc => (
          <div
            key={loc.id}
            className="e911-location-row"
            data-focus={loc.id}
            ref={el => {
              if (el) rows.current.set(loc.id, el)
              else rows.current.delete(loc.id)
            }}
          >
            <label className="field">
              <span>Name</span>
              <input
                value={loc.name}
                onChange={e => updateLocation(loc.id, 'name', e.target.value)}
                placeholder="Main office / Warehouse"
              />
            </label>
            <label className="field field-span">
              <span>Address</span>
              <input
                value={loc.address}
                onChange={e => updateLocation(loc.id, 'address', e.target.value)}
                placeholder="123 Main St, City, ST ZIP"
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <input
                value={loc.notes || ''}
                onChange={e => updateLocation(loc.id, 'notes', e.target.value)}
                placeholder="Suite / floor"
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => crumple(rows.current.get(loc.id), () => removeLocation(loc.id))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="design-list-head" style={{ marginTop: 24 }}>
        <div>
          <h3>Assign users</h3>
          <p>Map each named user to an E911 location.</p>
        </div>
      </div>

      {users.length === 0 ? (
        <p className="muted">Add users in the Users section first.</p>
      ) : (
        <div className="e911-assign-table">
          <div className="e911-assign-head">
            <span>User</span>
            <span>Ext / DID</span>
            <span>E911 location</span>
          </div>
          {users.map(user => (
            <div className="e911-assign-row" key={user.id || makeId()}>
              <span>{user.name || 'Unnamed'}</span>
              <span className="muted">{[user.extension, user.phone].filter(Boolean).join(' · ') || '—'}</span>
              <select
                value={user.e911LocationId || ''}
                onChange={e => assignUser(user.id, e.target.value)}
                disabled={!locations.length}
              >
                <option value="">Unassigned</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name || 'Untitled location'}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
