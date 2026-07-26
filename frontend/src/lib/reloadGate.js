/**
 * Before SW-driven reload: flush open workspace drafts, then check outbox.
 * Workspaces register a flush fn; reload waits for it so we never wipe unsaved edits.
 */

import { listOutbox } from './db.js'

const FLUSH_EVENT = 'clearline:flush-before-reload'

/** @type {Set<() => void | Promise<void>>} */
const flushers = new Set()

export function registerWorkspaceFlush(fn) {
  if (typeof fn !== 'function') return () => {}
  flushers.add(fn)
  return () => { flushers.delete(fn) }
}

export function requestWorkspaceFlush() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FLUSH_EVENT))
  }
  return Promise.all([...flushers].map(async (fn) => {
    try {
      await fn()
    } catch (err) {
      console.error(err)
    }
  }))
}

/**
 * Flush editors, wait for debounced saves to land, return pending outbox count.
 * @returns {Promise<{ pending: number, flushed: boolean }>}
 */
export async function prepareForAppReload() {
  await requestWorkspaceFlush()
  // Allow SiteSurvey / SystemDesign / GoLive 450ms debounce + IDB write to finish
  await new Promise(r => setTimeout(r, 550))
  try {
    const rows = await listOutbox()
    const pending = (rows || []).filter(e => e.status === 'pending' || e.status === 'conflicted').length
    return { pending, flushed: true }
  } catch {
    return { pending: 0, flushed: true }
  }
}

export { FLUSH_EVENT }
