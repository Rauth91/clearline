/**
 * Save / storage pressure status events (shared by repo + UI).
 */

const SAVE_EVENT = 'clearline-save-status'
/** Soft warn when localStorage payload approaches typical 5MB browser quotas. */
const STORAGE_WARN_BYTES = 3.5 * 1024 * 1024

export function emitSaveStatus(detail) {
  try {
    window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail }))
  } catch {
    // ignore (SSR / tests)
  }
}

export function subscribeSaveStatus(handler) {
  const fn = (e) => handler(e.detail)
  window.addEventListener(SAVE_EVENT, fn)
  return () => window.removeEventListener(SAVE_EVENT, fn)
}

export function getLocalStorageBytes() {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      const val = localStorage.getItem(key) || ''
      total += key.length + val.length
    }
  } catch {
    return 0
  }
  // UTF-16 ≈ 2 bytes per char in most browsers' quota accounting
  return total * 2
}

export function checkStoragePressure() {
  const used = getLocalStorageBytes()
  if (used < STORAGE_WARN_BYTES) return null
  return {
    type: 'warn',
    message: `Browser storage is getting full (~${Math.round(used / (1024 * 1024))} MB). Export job files and delete finished jobs, or remove site photos.`,
    usedBytes: used,
  }
}
