import { useEffect, useRef, useState } from 'react'
import { authEnabled, signOut } from '../lib/authModel.js'

export default function HeaderMenu({
  theme,
  onToggleTheme,
  profile,
  onOpenSettings,
  onSignedOut,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = (profile?.display_name || profile?.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?'

  const isAdmin = profile?.role === 'admin'

  async function handleSignOut() {
    setOpen(false)
    try {
      await signOut()
    } catch (err) {
      console.error(err)
    }
    onSignedOut?.()
  }

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        type="button"
        className="header-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
        title={profile?.display_name || 'Menu'}
      >
        <span className="header-menu-avatar" aria-hidden="true">{initials}</span>
        <span className="header-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="header-menu-panel" role="menu">
          {profile?.display_name && (
            <div className="header-menu-label">{profile.display_name}</div>
          )}
          <button
            type="button"
            className="header-menu-item"
            role="menuitem"
            onClick={() => {
              onToggleTheme?.()
              setOpen(false)
            }}
          >
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="header-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onOpenSettings?.()
              }}
            >
              Admin settings
            </button>
          )}
          {authEnabled() && profile && (
            <button
              type="button"
              className="header-menu-item header-menu-danger"
              role="menuitem"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
