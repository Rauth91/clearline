import { useState } from 'react'
import BrandMark from './BrandMark.jsx'
import {
  acceptInvite,
  createOrg,
  signInWithMagicLink,
} from '../lib/authModel.js'

export function SignInScreen({ onSent }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e?.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      await signInWithMagicLink(value)
      setSent(true)
      onSent?.(value)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not send magic link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">ClearLine</div>
            <div className="brand-tag">Sign in to sync with your team</div>
          </div>
        </div>

        {sent ? (
          <div className="auth-sent">
            <h1>Check your email</h1>
            <p>
              We sent a magic link to <strong>{email.trim()}</strong>.
              Open it on this device to continue.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setSent(false); setError(null) }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <h1>Sign in</h1>
            <p>Enter your work email. We’ll send a one-time magic link — no password.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>
            {error && <div className="parse-note parse-error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function OnboardingScreen({ onComplete }) {
  const [mode, setMode] = useState(null) // 'create' | 'invite' | null
  const [orgName, setOrgName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e?.preventDefault()
    if (!orgName.trim() || !displayName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await createOrg(orgName, displayName)
      onComplete?.(result.profile)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not create company')
    } finally {
      setBusy(false)
    }
  }

  async function handleAccept(e) {
    e?.preventDefault()
    if (!displayName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await acceptInvite(displayName)
      onComplete?.(result.profile)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No pending invite found for this email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">ClearLine</div>
            <div className="brand-tag">Set up your team</div>
          </div>
        </div>

        {!mode && (
          <div className="auth-form">
            <h1>Welcome</h1>
            <p>Create a company for your team, or join one you were invited to.</p>
            <div className="auth-choice-row">
              <button type="button" className="btn btn-primary" onClick={() => setMode('create')}>
                Create a company
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setMode('invite')}>
                I was invited
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <form className="auth-form" onSubmit={handleCreate}>
            <h1>Create a company</h1>
            <p>You’ll be the admin. Invite techs after setup.</p>
            <label className="field">
              <span>Company name</span>
              <input
                autoFocus
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Acme Voice"
                required
              />
            </label>
            <label className="field">
              <span>Your display name</span>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Alex Rivera"
                required
              />
            </label>
            {error && <div className="parse-note parse-error">{error}</div>}
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create company'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setMode(null); setError(null) }}>
                Back
              </button>
            </div>
          </form>
        )}

        {mode === 'invite' && (
          <form className="auth-form" onSubmit={handleAccept}>
            <h1>Join your team</h1>
            <p>Accept the invite sent to the email you signed in with.</p>
            <label className="field">
              <span>Your display name</span>
              <input
                autoFocus
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Alex Rivera"
                required
              />
            </label>
            {error && <div className="parse-note parse-error">{error}</div>}
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setMode(null); setError(null) }}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
