import { useEffect, useState } from 'react'
import {
  getOrg,
  inviteMember,
  listOrgMembers,
  updateOrgName,
} from '../lib/authModel.js'

export default function AdminSettings({ onBack }) {
  const [org, setOrg] = useState(null)
  const [members, setMembers] = useState([])
  const [orgName, setOrgName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('tech')
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  const [error, setError] = useState(null)

  async function reload() {
    try {
      const [o, m] = await Promise.all([getOrg(), listOrgMembers()])
      setOrg(o)
      setOrgName(o?.name || '')
      setMembers(m || [])
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not load settings')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSaveOrg(e) {
    e?.preventDefault()
    if (!orgName.trim()) return
    setBusy('org')
    setError(null)
    setNote(null)
    try {
      await updateOrgName(orgName)
      setNote({ type: 'ok', text: 'Company name saved.' })
      await reload()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not update company name')
    } finally {
      setBusy(null)
    }
  }

  async function handleInvite(e) {
    e?.preventDefault()
    if (!inviteEmail.trim()) return
    setBusy('invite')
    setError(null)
    setNote(null)
    try {
      await inviteMember(inviteEmail, inviteRole)
      setNote({ type: 'ok', text: `Invite sent to ${inviteEmail.trim()}.` })
      setInviteEmail('')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not send invite')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="admin-settings">
      <div className="design-hero hero-grid">
        <div>
          <div className="survey-kicker">Admin</div>
          <h1>Team settings</h1>
          <p>Company name, members, and email invites.</p>
        </div>
        <div className="survey-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      {error && <div className="parse-note parse-error">{error}</div>}
      {note && (
        <div className={note.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {note.text}
        </div>
      )}

      <form className="admin-panel" onSubmit={handleSaveOrg}>
        <h2>Company</h2>
        <label className="field">
          <span>Name</span>
          <input
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            placeholder={org?.name || 'Company name'}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy === 'org'}>
          {busy === 'org' ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <div className="admin-panel">
        <h2>Members</h2>
        {members.length === 0 ? (
          <p className="admin-empty">No members loaded yet.</p>
        ) : (
          <ul className="admin-member-list">
            {members.map(m => (
              <li key={m.id}>
                <span className="admin-member-name">{m.display_name || '—'}</span>
                <span className={`admin-role-badge admin-role-${m.role}`}>{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="admin-panel" onSubmit={handleInvite}>
        <h2>Invite by email</h2>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="tech@company.com"
            required
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            <option value="tech">Tech</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy === 'invite'}>
          {busy === 'invite' ? 'Sending…' : 'Send invite'}
        </button>
      </form>
    </section>
  )
}
