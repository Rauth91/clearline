/**
 * Command palette — search jobs, accounts, reference, and routes.
 * Ctrl/Cmd-K is typically wired by App; also export CommandPaletteTrigger.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listAccounts } from '../lib/accountModel.js'
import { listJobs } from '../lib/jobModel.js'
import { searchReference } from '../lib/referenceIndex.js'
import { setActiveAccountId, setActiveJobId } from '../lib/repo.js'
import { navigate } from '../lib/router.js'

const ROUTES = [
  { id: 'route-home', label: 'Home', path: '#/', keywords: ['home', 'my day'] },
  { id: 'route-jobs', label: 'Jobs', path: '/jobs', keywords: ['jobs', 'customers'] },
  { id: 'route-accounts', label: 'Accounts', path: '/accounts', keywords: ['accounts', 'call flow'] },
  { id: 'route-settings', label: 'Settings', path: '/settings', keywords: ['settings', 'admin'] },
  { id: 'route-calldiag', label: 'Call Diagnostic', path: '/tools/calldiag', keywords: ['tools', 'sip', 'ladder', 'netsapiens'] },
  { id: 'route-pcap', label: 'Packet Capture', path: '/tools/pcap', keywords: ['tools', 'pcap', 'wireshark', 'rtp', 'capture'] },
  { id: 'route-netcheck', label: 'Network Check', path: '/tools/netcheck', keywords: ['tools', 'network', 'visualware', 'jitter', 'mos', 'nat'] },
  { id: 'route-router', label: 'Router Advisor', path: '/tools/router', keywords: ['tools', 'router', 'firewall', 'sip alg', 'qos', 'meraki', 'cisco'] },
  { id: 'route-yealink', label: 'Yealink Codes', path: '/tools/yealink', keywords: ['tools', 'yealink', 'codes'] },
  { id: 'route-symptom', label: 'Symptom Wizard', path: '/tools/symptom', keywords: ['tools', 'troubleshoot', 'wizard'] },
  { id: 'route-ports', label: 'Port Checklist', path: '/tools/ports', keywords: ['tools', 'firewall', 'ports'] },
  { id: 'route-algo', label: 'Algo Config', path: '/tools/algo', keywords: ['tools', 'algo', 'paging'] },
  { id: 'route-quickcard', label: 'Quick Card', path: '/tools/quickcard', keywords: ['tools', 'quick card'] },
  { id: 'route-codec', label: 'Codec & QoS', path: '/tools/codec', keywords: ['tools', 'codec', 'dscp', 'sip'] },
  { id: 'route-ref', label: 'Tools · Reference hub', path: '/tools/reference', keywords: ['tools', 'search'] },
  { id: 'route-trouble', label: 'Tools · Troubleshoot hub', path: '/tools/troubleshoot', keywords: ['tools', 'hub'] },
  { id: 'route-config', label: 'Tools · Config hub', path: '/tools/config', keywords: ['tools', 'hub'] },
]

function scoreText(hay, q) {
  const t = String(hay || '').toLowerCase()
  if (!t || !q) return 0
  let score = 0
  if (t.startsWith(q)) score += 12
  else if (t.includes(q)) score += 6
  for (const word of t.split(/[\s/·,;:|()\-]+/).filter(Boolean)) {
    if (word.startsWith(q)) score += 4
    else if (word.includes(q)) score += 1
  }
  return score
}

function buildItems(query) {
  const q = String(query || '').toLowerCase().trim()
  /** @type {Array<{ id: string, group: string, label: string, subtitle?: string, path: string, score: number }>} */
  const items = []

  try {
    for (const job of listJobs()) {
      const label = job.customer || 'Untitled job'
      const subtitle = job.site || ''
      const score = q
        ? scoreText(label, q) * 2
          + scoreText(subtitle, q)
          + scoreText(job.ticket, q)
          + scoreText(job.id, q)
        : 1
      if (!q || score > 0) {
        items.push({
          id: `job-${job.id}`,
          group: 'Jobs',
          label,
          subtitle: subtitle || 'Job',
          path: `/job/${job.id}`,
          score,
        })
      }
    }
  } catch { /* repo not ready */ }

  try {
    for (const acct of listAccounts()) {
      const label = acct.name || 'Untitled account'
      const subtitle = [acct.site, acct.mainDid].filter(Boolean).join(' · ')
      const score = q
        ? scoreText(label, q) * 2 + scoreText(subtitle, q) + scoreText(acct.id, q)
        : 1
      if (!q || score > 0) {
        items.push({
          id: `acct-${acct.id}`,
          group: 'Accounts',
          label,
          subtitle: subtitle || 'Account',
          path: `/account/${acct.id}`,
          score,
        })
      }
    }
  } catch { /* repo not ready */ }

  for (const route of ROUTES) {
    const score = q
      ? scoreText(route.label, q) * 2
        + route.keywords.reduce((s, k) => s + scoreText(k, q), 0)
      : 1
    if (!q || score > 0) {
      items.push({
        id: route.id,
        group: 'Go to',
        label: route.label,
        subtitle: route.path,
        path: route.path,
        score,
      })
    }
  }

  if (q) {
    for (const ref of searchReference(q, { limit: 12 })) {
      const path = ref.source === 'yealink'
        ? '/tools/reference'
        : '/tools/reference'
      items.push({
        id: `ref-${ref.source}-${ref.title}`,
        group: ref.source === 'yealink' ? 'Yealink' : 'Codec',
        label: ref.title,
        subtitle: ref.subtitle,
        path: `${path}?q=${encodeURIComponent(q)}`,
        score: ref.score,
      })
    }
  }

  return items
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 40)
}

function groupItems(items) {
  const order = []
  const map = new Map()
  for (const item of items) {
    if (!map.has(item.group)) {
      map.set(item.group, [])
      order.push(item.group)
    }
    map.get(item.group).push(item)
  }
  return order.map(g => ({ group: g, items: map.get(g) }))
}

function getFocusable(root) {
  if (!root) return []
  return Array.from(
    root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export function CommandPaletteTrigger({ onClick, className, label = 'Search' }) {
  const isMac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad/.test(navigator.platform || '')
  return (
    <button
      type="button"
      className={className || 'btn btn-secondary header-search-btn'}
      aria-label="Open command palette"
      onClick={onClick}
    >
      <span>{label}</span>
      <kbd className="cmd-palette-kbd">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
    </button>
  )
}

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const items = useMemo(() => (open ? buildItems(query) : []), [open, query])
  const groups = useMemo(() => groupItems(items), [items])

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setActiveIndex(0)
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(t)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return undefined
    const el = listRef.current?.querySelector(`[data-palette-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, items])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (items.length ? (i + 1) % items.length : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (items.length ? (i - 1 + items.length) % items.length : 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[activeIndex]
        if (item) selectItem(item)
        return
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable(dialogRef.current)
        if (focusable.length < 2) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, activeIndex, onClose])

  function selectItem(item) {
    if (!item?.path) return
    const [pathPart, queryPart] = item.path.split('?')
    const normalized = pathPart.startsWith('#') ? pathPart.slice(1) : pathPart
    if (normalized === '/' || normalized === '') {
      setActiveJobId(null)
      setActiveAccountId(null)
    }
    if (queryPart) {
      const query = {}
      for (const pair of queryPart.split('&')) {
        const [k, v = ''] = pair.split('=')
        query[decodeURIComponent(k)] = decodeURIComponent(v)
      }
      navigate(pathPart, { query })
    } else {
      navigate(pathPart)
    }
    onClose?.()
  }

  if (!open || typeof document === 'undefined') return null

  let flatIndex = 0

  return createPortal(
    <div
      className="section-modal-backdrop cmd-palette-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="section-modal cmd-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-palette-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="section-modal-head cmd-palette-head">
          <div>
            <div className="survey-kicker">Command</div>
            <h2 id="cmd-palette-title">Search</h2>
          </div>
          <div className="section-modal-nav">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="section-modal-body cmd-palette-body">
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="search"
            placeholder="Jobs, accounts, tools, reference…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="cmd-palette-list"
            autoComplete="off"
          />
          <div
            id="cmd-palette-list"
            className="cmd-palette-list"
            role="listbox"
            ref={listRef}
          >
            {items.length === 0 ? (
              <p className="cmd-palette-empty">No matches.</p>
            ) : (
              groups.map(({ group, items: groupItems }) => (
                <div key={group} className="cmd-palette-group" role="group" aria-label={group}>
                  <div className="cmd-palette-group-label">{group}</div>
                  {groupItems.map(item => {
                    const index = flatIndex++
                    const active = index === activeIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-palette-index={index}
                        className={`cmd-palette-item${active ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectItem(item)}
                      >
                        <span className="cmd-palette-item-label">{item.label}</span>
                        {item.subtitle ? (
                          <span className="cmd-palette-item-sub">{item.subtitle}</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
