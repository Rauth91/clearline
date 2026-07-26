/**
 * clearline:data-changed — broadcast after remote pull/realtime upserts.
 */

import { pendingOutboxFor } from './repo.js'

export function emitDataChanged(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('clearline:data-changed', { detail: detail || {} }))
}

/**
 * @param {(detail: { kind?: string, ids?: string[] }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onDataChanged(handler) {
  if (typeof window === 'undefined') return () => {}
  const fn = (e) => {
    try {
      handler(e.detail || {})
    } catch (err) {
      console.error(err)
    }
  }
  window.addEventListener('clearline:data-changed', fn)
  return () => window.removeEventListener('clearline:data-changed', fn)
}

/**
 * True when this client should accept a remote refresh for entityId.
 */
export async function canApplyRemoteRefresh(entityId, { hasLocalConflicts } = {}) {
  if (!entityId) return false
  try {
    const pending = await pendingOutboxFor(entityId)
    if (pending.length > 0) return false
  } catch {
    return false
  }
  if (typeof hasLocalConflicts === 'function' && hasLocalConflicts()) return false
  if (hasLocalConflicts === true) return false
  return true
}
