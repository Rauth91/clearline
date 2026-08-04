import { useEffect, useId, useRef, useState } from 'react'
import BrandMark from './BrandMark.jsx'
import OtpInput from './OtpInput.jsx'
import {
  acceptInvite,
  createOrg,
  signInWithMagicLink,
  verifyEmailOtp,
} from '../lib/authModel.js'
import { prefersReducedMotion } from '../lib/motion.js'

/** Restrained gooey metaball hero for Flow-style auth. */
function AuthGooeyHero() {
  const gRef = useRef(null)
  const pull = useRef({ x: 0, y: 0 })
  const uid = useId().replace(/:/g, '')
  const filterId = `auth-goo-${uid}`
  const gradId = `auth-blob-${uid}`

  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const blobs = [
      { el: null, x: 70, y: 36, r: 22, sp: 0.0011, phase: 0 },
      { el: null, x: 118, y: 42, r: 16, sp: 0.0016, phase: 1.2 },
      { el: null, x: 96, y: 58, r: 14, sp: 0.0013, phase: 2.4 },
    ]
    const root = gRef.current
    if (!root) return undefined
    const circles = root.querySelectorAll('circle')
    blobs.forEach((b, i) => { b.el = circles[i] })

    let raf = 0
    function loop(t) {
      const px = pull.current.x * 10
      const py = pull.current.y * 8
      blobs.forEach((b) => {
        const dx = Math.cos(t * b.sp + b.phase) * b.r * 0.35 + px
        const dy = Math.sin(t * b.sp * 1.1 + b.phase) * b.r * 0.28 + py
        b.el?.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`)
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    function onMove(e) {
      const card = root.closest('.auth-card')
      if (!card) return
      const r = card.getBoundingClientRect()
      pull.current = {
        x: ((e.clientX - r.left) / r.width - 0.5) * 2,
        y: ((e.clientY - r.top) / r.height - 0.5) * 2,
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="auth-gooey" aria-hidden="true">
      <svg viewBox="0 0 200 90" className="auth-gooey-svg">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <g ref={gRef} filter={`url(#${filterId})`}>
          <circle cx="70" cy="40" r="22" fill={`url(#${gradId})`} opacity="0.95" />
          <circle cx="118" cy="44" r="16" fill={`url(#${gradId})`} opacity="0.9" />
          <circle cx="96" cy="58" r="14" fill={`url(#${gradId})`} opacity="0.85" />
        </g>
      </svg>
    </div>
  )
}

function maskEmail(email) {
  const value = String(email || '').trim()
  const at = value.indexOf('@')
  if (at < 1) return value
  const user = value.slice(0, at)
  const domain = value.slice(at)
  const keep = Math.min(2, user.length)
  return `${user.slice(0, keep)}${'•'.repeat(Math.max(1, user.length - keep))}${domain}`
}

export function SignInScreen({ onSent, onVerified }) {
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
      <div className="auth-card auth-card--flow">
        <AuthGooeyHero />
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">ClearLine</div>
            <div className="brand-tag">Good to see you. Dive back in.</div>
          </div>
        </div>

        {sent ? (
          <div className="auth-sent">
            <h1>Check your email</h1>
            <p>
              We sent a magic link to <strong>{email.trim()}</strong>.
              Open it on this device, or enter the code if you’re on another one.
            </p>
            <OtpInput
              length={6}
              hint={maskEmail(email)}
              title="Enter your invite code"
              onComplete={async (code) => {
                const res = await verifyEmailOtp(email.trim(), code)
                if (!res.ok) {
                  setError(res.message || 'That code is not valid')
                  return false
                }
                setError(null)
                onVerified?.(res.session)
                return true
              }}
            />
            {error && <div className="parse-note parse-error">{error}</div>}
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
            <button type="submit" className="btn btn-primary btn-melt" disabled={busy || !email.trim()}>
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
      <div className="auth-card auth-card--flow">
        <AuthGooeyHero />
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
              <button type="button" className="btn btn-primary btn-melt" onClick={() => setMode('create')}>
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
              <button type="submit" className="btn btn-primary btn-melt" disabled={busy}>
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
              <button type="submit" className="btn btn-primary btn-melt" disabled={busy}>
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
