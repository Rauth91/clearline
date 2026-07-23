/**
 * Tiny hash router — no dependencies.
 * Paths: #/jobs, #/job/:id/survey, #/tools/reference?q=…, etc.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'

function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  let path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  const query = {}
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue
      const [k, v = ''] = pair.split('=')
      query[decodeURIComponent(k)] = decodeURIComponent(v)
    }
  }

  const segments = path.split('/').filter(Boolean)
  const params = {}
  let name = 'home'

  if (segments.length === 0) {
    name = 'home'
  } else if (segments[0] === 'jobs') {
    name = 'jobs'
  } else if (segments[0] === 'settings') {
    name = 'settings'
  } else if (segments[0] === 'accounts') {
    name = 'accounts'
  } else if (segments[0] === 'account' && segments[1]) {
    name = 'account'
    params.accountId = segments[1]
  } else if (segments[0] === 'job' && segments[1]) {
    params.jobId = segments[1]
    const section = segments[2]
    if (!section) name = 'cockpit'
    else if (section === 'survey') name = 'survey'
    else if (section === 'design') name = 'design'
    else if (section === 'golive') name = 'golive'
    else if (section === 'runbook') name = 'runbook'
    else name = 'cockpit'
  } else if (segments[0] === 'tools') {
    const tool = segments[1] || 'calldiag'
    const groups = new Set(['reference', 'troubleshoot', 'config'])
    const singles = new Set([
      'calldiag', 'yealink', 'symptom', 'ports', 'algo', 'quickcard', 'codec',
    ])
    if (groups.has(tool)) {
      name = `tools-${tool}`
      params.toolGroup = tool
      if (segments[2]) params.toolTab = segments[2]
    } else if (singles.has(tool)) {
      name = 'tool'
      params.toolId = tool
    } else {
      name = 'tool'
      params.toolId = 'calldiag'
    }
  }

  return { path, name, params, query, segments }
}

function getSnapshot() {
  return typeof window !== 'undefined' ? window.location.hash || '#/' : '#/'
}

const listeners = new Set()

function subscribe(cb) {
  listeners.add(cb)
  const onHash = () => {
    for (const l of listeners) l()
  }
  if (listeners.size === 1) {
    window.addEventListener('hashchange', onHash)
    subscribe._onHash = onHash
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && subscribe._onHash) {
      window.removeEventListener('hashchange', subscribe._onHash)
    }
  }
}

export function getRoute() {
  return parseHash(getSnapshot())
}

/**
 * @param {string} path e.g. "/jobs" or "/job/abc/survey"
 * @param {{ replace?: boolean, query?: Record<string, string> }} [opts]
 */
export function navigate(path, opts = {}) {
  let next = path.startsWith('#') ? path.slice(1) : path
  if (!next.startsWith('/')) next = `/${next}`
  if (opts.query && Object.keys(opts.query).length) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (qs) next += `?${qs}`
  }
  const hash = `#${next}`
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`
    window.history.replaceState(null, '', url)
    // replaceState does not fire hashchange
    for (const l of listeners) l()
  } else if (window.location.hash === hash) {
    for (const l of listeners) l()
  } else {
    window.location.hash = next
  }
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '#/')
  return parseHash(hash)
}

/** Set document.title from route + optional labels */
export function applyDocumentTitle({ customer, section, tool } = {}) {
  if (tool) {
    document.title = `${tool} · ClearLine`
  } else if (customer && section) {
    document.title = `${customer} — ${section} · ClearLine`
  } else if (customer) {
    document.title = `${customer} · ClearLine`
  } else {
    document.title = 'ClearLine'
  }
}

export function useHashFocus(paramKey = 'focus') {
  const route = useRoute()
  const focusId = route.query[paramKey]
  useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(focusId) || document.querySelector(`[data-focus="${focusId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }) } catch { /* ignore */ }
      }
    }
  }, [focusId, route.path])
  return focusId
}
