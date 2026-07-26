/**
 * PWA update banner — shown when a new service worker is waiting.
 * Never auto-reloads; flushes workspace drafts before applying update.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { prepareForAppReload } from '../lib/reloadGate.js'

export default function PwaUpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const updateSWRef = useRef(null)

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        // Shell cached — no banner required
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration?.waiting) setNeedRefresh(true)
      },
    })
  }, [])

  const handleReload = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const { pending } = await prepareForAppReload()
      if (pending > 0) {
        const ok = window.confirm(
          `There ${pending === 1 ? 'is 1 pending sync item' : `are ${pending} pending sync items`} still saving.\n\nReload anyway? Local data is kept; sync will resume after reload.`,
        )
        if (!ok) {
          setBusy(false)
          return
        }
      }
      if (typeof updateSWRef.current === 'function') {
        await updateSWRef.current(true)
      } else {
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      window.location.reload()
    }
  }, [busy])

  if (!needRefresh) return null

  return (
    <div className="app-save-banner is-warn pwa-update-banner" role="status">
      <span>Update ready — Reload</span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleReload}
        disabled={busy}
        aria-label="Reload to apply update"
      >
        {busy ? 'Saving…' : 'Reload'}
      </button>
    </div>
  )
}
