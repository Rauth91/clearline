/**
 * YealinkCodes — Searchable Yealink config code generator
 * Covers programmable keys, basic settings, LED, network, SIP, audio, display, and more.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { YEALINK_CODES } from '../data/yealinkCodes.js'
import {
  YEALINK_MODEL_FAMILIES,
  YEALINK_TASKS,
  matchesYealinkModel,
} from '../lib/yealinkShape.js'
import Why from './Why.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODEL_STORAGE_KEY = 'voip-ops-yealink-model'

function resolveCode(template, vars) {
  let out = template
  for (const [id, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${id}}`, val || `{${id}}`)
  }
  return out
}

function resolveAll(codes, varValues) {
  return codes.map(c => resolveCode(c, varValues)).join('\n')
}

function loadSavedModel() {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY)
    if (saved && YEALINK_MODEL_FAMILIES.includes(saved)) return saved
  } catch { /* ignore */ }
  return 'all'
}

// ─── Component ───────────────────────────────────────────────────────────────

function CodeCard({ item }) {
  const initVars = Object.fromEntries((item.variables || []).map(v => [v.id, v.default]))
  const [varValues, setVarValues] = useState(initVars)
  const [copied, setCopied] = useState(false)
  const [openDetails, setOpenDetails] = useState(false)

  const primaryCode = resolveCode(item.codes?.[0] || '', varValues)
  const resolved = resolveAll(item.codes || [], varValues)
  const hasExtras = Boolean(
    item.caveat
    || (item.variables && item.variables.length > 0)
    || (item.codes && item.codes.length > 1),
  )

  function handleCopy(e) {
    e?.stopPropagation?.()
    navigator.clipboard.writeText(resolved).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <article className={`yk-card yk-card-compact${item.severity ? ` is-${item.severity}` : ''}`}>
      <div className="yk-card-top">
        <div className="yk-card-main">
          <div className="yk-code-row">
            <code className="yk-code-inline" title={primaryCode}>{primaryCode}</code>
            <button
              type="button"
              className={`yk-copy-btn${copied ? ' yk-copied' : ''}`}
              onClick={handleCopy}
              aria-label={`Copy config for ${item.name}`}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="yk-card-name">{item.name}</div>
          {item.description && <p className="yk-card-desc">{item.description}</p>}
          <div className="yk-model-badges" aria-label="Model families">
            {(item.models || ['all']).map(m => (
              <span key={m} className="yk-model-badge">{m}</span>
            ))}
          </div>
        </div>
      </div>

      {hasExtras && (
        <details
          className="yk-card-details"
          open={openDetails}
          onToggle={e => setOpenDetails(e.currentTarget.open)}
        >
          <summary>Variables, caveats & full config</summary>
          {item.caveat && (
            <Why label="Caveat">
              <p>{item.caveat}</p>
            </Why>
          )}
          {item.variables && item.variables.length > 0 && (
            <div className="yk-vars">
              {item.variables.map(v => (
                <label key={v.id} className="yk-var-label">
                  <span>{v.label}</span>
                  <input
                    className="yk-var-input"
                    type="text"
                    value={varValues[v.id] ?? v.default}
                    onChange={e => setVarValues(prev => ({ ...prev, [v.id]: e.target.value }))}
                    placeholder={v.default}
                    aria-label={v.label}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="yk-code-wrap">
            <pre className="yk-code">{resolved}</pre>
            <button
              type="button"
              className={`yk-copy-btn${copied ? ' yk-copied' : ''}`}
              onClick={handleCopy}
              aria-label={`Copy full config for ${item.name}`}
            >
              {copied ? 'Copied' : 'Copy all'}
            </button>
          </div>
        </details>
      )}
    </article>
  )
}

export default function YealinkCodes({ initialSearch = '' } = {}) {
  const searchRef = useRef(null)
  const [search, setSearch] = useState(() => String(initialSearch || ''))
  const [taskFilter, setTaskFilter] = useState('All')
  const [model, setModel] = useState(loadSavedModel)
  const [openTasks, setOpenTasks] = useState(() => new Set())

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    if (initialSearch != null && initialSearch !== '') {
      setSearch(String(initialSearch))
    }
  }, [initialSearch])

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, model)
    } catch { /* ignore */ }
  }, [model])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return YEALINK_CODES.filter(item => {
      if (!matchesYealinkModel(item, model)) return false
      if (taskFilter !== 'All' && item.task !== taskFilter) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q)
        || item.description?.toLowerCase().includes(q)
        || item.task?.toLowerCase().includes(q)
        || item.category?.toLowerCase().includes(q)
        || item.caveat?.toLowerCase().includes(q)
        || (item.models || []).some(m => m.toLowerCase().includes(q))
        || item.codes.some(c => c.toLowerCase().includes(q))
      )
    })
  }, [search, taskFilter, model])

  const grouped = useMemo(() => {
    const map = new Map(YEALINK_TASKS.map(t => [t, []]))
    for (const item of filtered) {
      const list = map.get(item.task) || []
      list.push(item)
      map.set(item.task, list)
    }
    return YEALINK_TASKS
      .map(task => ({ task, items: map.get(task) || [] }))
      .filter(g => g.items.length > 0)
  }, [filtered])

  // Searching / single-task filter: expand matching groups. Default view stays collapsed.
  useEffect(() => {
    if (search.trim() || taskFilter !== 'All') {
      const q = search.toLowerCase().trim()
      const next = new Set()
      for (const item of YEALINK_CODES) {
        if (!matchesYealinkModel(item, model)) continue
        if (taskFilter !== 'All' && item.task !== taskFilter) continue
        if (q) {
          const hit = (
            item.name.toLowerCase().includes(q)
            || item.description?.toLowerCase().includes(q)
            || item.task?.toLowerCase().includes(q)
            || item.category?.toLowerCase().includes(q)
            || item.caveat?.toLowerCase().includes(q)
            || (item.models || []).some(m => m.toLowerCase().includes(q))
            || item.codes.some(c => c.toLowerCase().includes(q))
          )
          if (!hit) continue
        }
        next.add(item.task)
      }
      setOpenTasks(next)
    } else {
      setOpenTasks(new Set())
    }
  }, [search, taskFilter, model])

  function toggleTask(task) {
    setOpenTasks(prev => {
      const next = new Set(prev)
      if (next.has(task)) next.delete(task)
      else next.add(task)
      return next
    })
  }

  const taskChips = useMemo(() => {
    const counts = Object.fromEntries(YEALINK_TASKS.map(t => [t, 0]))
    for (const item of YEALINK_CODES) {
      if (!matchesYealinkModel(item, model)) continue
      if (counts[item.task] != null) counts[item.task] += 1
    }
    return [
      { id: 'All', label: 'All', count: YEALINK_CODES.filter(i => matchesYealinkModel(i, model)).length },
      ...YEALINK_TASKS.map(t => ({ id: t, label: t, count: counts[t] || 0 })),
    ]
  }, [model])

  return (
    <section className="yk-root">
      <div className="yk-header">
        <h2 className="yk-title">Yealink codes</h2>
        <p className="yk-subtitle">
          Task-first lookup — search, filter by model, expand a group, copy the config line.
        </p>
        <label className="yk-search-label" htmlFor="yk-search-input">
          <span className="visually-hidden">Search Yealink codes</span>
          <input
            id="yk-search-input"
            ref={searchRef}
            className="yk-search"
            type="search"
            placeholder="Search — e.g. park, BLF, VLAN, reset…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </label>

        <div className="yk-toolbar">
          <div className="yk-task-chips" role="toolbar" aria-label="Task groups">
            {taskChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={`yk-cat-btn${taskFilter === chip.id ? ' yk-cat-active' : ''}`}
                onClick={() => setTaskFilter(chip.id)}
              >
                {chip.label}
                <span className="yk-chip-count">{chip.count}</span>
              </button>
            ))}
          </div>
          <label className="yk-model-filter">
            <span>Model</span>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              aria-label="Filter by Yealink model family"
            >
              {YEALINK_MODEL_FAMILIES.map(m => (
                <option key={m} value={m}>{m === 'all' ? 'All models' : m}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="yk-empty">No codes match this search / model.</div>
      ) : (
        <div className="yk-groups">
          {grouped.map(group => {
            const open = openTasks.has(group.task)
            return (
              <section key={group.task} className="yk-group">
                <button
                  type="button"
                  className="yk-group-toggle"
                  aria-expanded={open}
                  onClick={() => toggleTask(group.task)}
                >
                  <span className="yk-group-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="yk-group-title">{group.task}</span>
                  <span className="yk-chip-count">{group.items.length}</span>
                </button>
                {open && (
                  <div className="yk-grid">
                    {group.items.map(item => (
                      <CodeCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <div className="yk-count">{filtered.length} of {YEALINK_CODES.length} codes shown</div>
    </section>
  )
}
