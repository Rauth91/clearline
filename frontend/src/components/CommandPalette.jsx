/**
 * Command palette — search jobs, accounts, reference, and routes.
 * Ctrl/Cmd-K is typically wired by App; also export CommandPaletteTrigger.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listAccounts } from '../lib/accountModel.js'
import { listJobs, jobWorkspacePath } from '../lib/jobModel.js'
import { searchReference } from '../lib/referenceIndex.js'
import { setActiveAccountId, setActiveJobId } from '../lib/repo.js'
import { navigate } from '../lib/router.js'

const CodecRef = lazy(() => import('./CodecRef.jsx'))
const FirmwareRefs = lazy(() => import('./FirmwareRefs.jsx'))

const ROUTES = [
  { id: 'route-home', label: 'Home', path: '#/', keywords: ['home', 'my day'] },
  { id: 'route-accounts', label: 'Accounts', path: '/accounts', keywords: ['accounts', 'jobs', 'customers', 'call flow'] },
  { id: 'route-settings', label: 'Settings', path: '/settings', keywords: ['settings', 'admin'] },
  { id: 'route-callanalysis', label: 'Call Analysis', path: '/tools/callanalysis', keywords: ['tools', 'sip', 'ladder', 'netsapiens', 'pcap', 'wireshark', 'rtp', 'capture', 'diagnostic'] },
  { id: 'route-readiness', label: 'Readiness', path: '/tools/readiness', keywords: ['tools', 'network', 'visualware', 'jitter', 'mos', 'nat', 'ports', 'firewall', 'router', 'sip alg', 'qos', 'meraki', 'cisco'] },
  { id: 'route-deviceconfig', label: 'Device Config', path: '/tools/deviceconfig', keywords: ['tools', 'yealink', 'codes', 'algo', 'paging', 'device'] },
  { id: 'route-quickcard', label: 'Quick Card', path: '/tools/quickcard', keywords: ['tools', 'quick card'] },
  { id: 'route-codec', label: 'Codec & QoS', path: '/tools/codec', keywords: ['tools', 'codec', 'dscp', 'sip', 'reference'] },
  { id: 'route-firmware', label: 'Firmware Refs', path: '/tools/firmware', keywords: ['tools', 'firmware', 'yealink', 'polycom', 'reference'] },
]

const SOURCE_GROUP = {
  yealink: 'Yealink',
  codec: 'Codec',
  firmware: 'Firmware',
}

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

function codecTabForRecord(record) {
  const hay = `${record?.title || ''} ${record?.subtitle || ''} ${record?.keywords?.join(' ') || ''}`.toLowerCase()
  if (hay.includes('sip ') || /^\s*sip\b/.test(hay) || record?.title?.startsWith('SIP ')) return 'SIP Response Codes'
  if (hay.includes('dscp') || hay.includes('qos')) return 'QoS / DSCP'
  return 'Codecs'
}

function buildItems(query, sourceFilter) {
  const q = String(query || '').toLowerCase().trim()
  /** @type {Array<{ id: string, group: string, label: string, subtitle?: string, path?: string, score: number, kind?: string, record?: object }>} */
  const items = []

  if (!sourceFilter) {
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
            path: jobWorkspacePath(job),
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
  }

  const refs = (q || sourceFilter)
    ? searchReference(q, {
      limit: sourceFilter ? 40 : 12,
      source: sourceFilter || undefined,
    })
    : []

  for (const ref of refs) {
    items.push({
      id: `ref-${ref.source}-${ref.title}`,
      group: SOURCE_GROUP[ref.source] || 'Reference',
      label: ref.title,
      subtitle: ref.subtitle,
      score: ref.score || (q ? 0 : 1),
      kind: 'ref',
      record: ref,
      path: ref.source === 'yealink'
        ? `/tools/deviceconfig?tab=yealink&q=${encodeURIComponent(q || ref.title)}`
        : undefined,
    })
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

export default function CommandPalette({
  open,
  onClose,
  sourceFilter = null,
  initialQuery = '',
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [detail, setDetail] = useState(null)
  const dialogRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const items = useMemo(
    () => (open ? buildItems(query, sourceFilter) : []),
    [open, query, sourceFilter],
  )
  const groups = useMemo(() => groupItems(items), [items])

  useEffect(() => {
    if (!open) return undefined
    setQuery(initialQuery || '')
    setActiveIndex(0)
    setDetail(null)
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(t)
      document.body.style.overflow = prevOverflow
    }
  }, [open, initialQuery, sourceFilter])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open || detail) return undefined
    const el = listRef.current?.querySelector(`[data-palette-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, items, detail])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (detail) {
          setDetail(null)
          return
        }
        onClose?.()
        return
      }
      if (detail) return
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
  }, [open, items, activeIndex, onClose, detail])

  function selectItem(item) {
    if (item?.kind === 'ref' && item.record?.source !== 'yealink') {
      setDetail(item.record)
      return
    }
    if (!item?.path) return
    const [pathPart, queryPart] = item.path.split('?')
    const normalized = pathPart.startsWith('#') ? pathPart.slice(1) : pathPart
    if (normalized === '/' || normalized === '') {
      setActiveJobId(null)
      setActiveAccountId(null)
    }
    if (queryPart) {
      const nextQuery = {}
      for (const pair of queryPart.split('&')) {
        const [k, v = ''] = pair.split('=')
        nextQuery[decodeURIComponent(k)] = decodeURIComponent(v)
      }
      navigate(pathPart, { query: nextQuery })
    } else {
      navigate(pathPart)
    }
    onClose?.()
  }

  if (!open || typeof document === 'undefined') return null

  let flatIndex = 0
  const filterLabel = sourceFilter === 'codec'
    ? 'Codec & QoS'
    : sourceFilter === 'firmware'
      ? 'Firmware'
      : null

  return createPortal(
    <div
      className="section-modal-backdrop cmd-palette-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`section-modal cmd-palette${detail ? ' has-detail' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-palette-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="section-modal-head cmd-palette-head">
          <div>
            <div className="survey-kicker">Command</div>
            <h2 id="cmd-palette-title">{filterLabel || 'Search'}</h2>
          </div>
          <div className="section-modal-nav">
            {detail && (
              <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
                Back
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="section-modal-body cmd-palette-body">
          {detail ? (
            <div className="cmd-palette-detail">
              <div className="cmd-palette-detail-hit">
                <strong>{detail.title}</strong>
                {detail.subtitle ? <span>{detail.subtitle}</span> : null}
                {detail.body ? <p>{detail.body}</p> : null}
              </div>
              <Suspense fallback={<p className="muted">Loading reference…</p>}>
                {detail.source === 'codec' && (
                  <CodecRef initialTab={codecTabForRecord(detail)} />
                )}
                {detail.source === 'firmware' && (
                  <FirmwareRefs />
                )}
              </Suspense>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                className="cmd-palette-input"
                type="search"
                placeholder={sourceFilter
                  ? `Search ${filterLabel}…`
                  : 'Jobs, accounts, tools, reference…'}
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
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
