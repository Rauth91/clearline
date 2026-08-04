/**
 * Call-flow map — compact preview, fullscreen follow mode, plain-language labels.
 */

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EXPANDED_LAYOUT,
  PREVIEW_LAYOUT,
  buildFlowModel,
  defaultFlowDestination,
  livePathMembership,
  validateFlowGraph,
  walkLivePath,
} from '../lib/flowMapModel.js'
import { prefersReducedMotion } from '../lib/motion.js'

const PREVIEW = PREVIEW_LAYOUT
const EXPANDED = EXPANDED_LAYOUT

export default function CallFlowDiagram({ design, compact = false, onGoToSection }) {
  const [expanded, setExpanded] = useState(false)
  const warnings = useMemo(() => validateFlowGraph(design), [design])

  if (compact) {
    return <FlowExplorer design={design} mode="compact" warnings={warnings} onGoToSection={onGoToSection} />
  }

  return (
    <>
      <FlowPreview design={design} warnings={warnings} onOpen={() => setExpanded(true)} />
      {expanded && createPortal(
        <FlowOverlay
          design={design}
          warnings={warnings}
          onClose={() => setExpanded(false)}
          onGoToSection={(key) => {
            setExpanded(false)
            onGoToSection?.(key)
          }}
        />,
        document.body,
      )}
    </>
  )
}

function FlowPreview({ design, warnings = [], onOpen }) {
  const model = useMemo(() => buildFlowModel(design, PREVIEW), [design])
  const warnCount = warnings.filter(w => w.severity === 'warn').length
  return (
    <div className="call-flow call-flow-preview">
      <div className="call-flow-meta">
        <div>
          <div className="survey-kicker">Call flow</div>
          <h2>Map preview{warnCount > 0 ? <span className="cf-warn-badge">{warnCount}</span> : null}</h2>
          <p>Open the full map to zoom, follow each hop, and read every destination.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onOpen}>
          Open full map
        </button>
      </div>
      <button type="button" className="call-flow-preview-hit" onClick={onOpen} aria-label="Open full call flow map">
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`}
          className="call-flow-preview-svg"
          role="img"
          aria-hidden="true"
        >
          <StaticMapSvg model={model} selectedId={null} truncateMax={22} warnings={warnings} />
        </svg>
        <span className="call-flow-preview-cta">Click to open full map</span>
      </button>
    </div>
  )
}

function FlowOverlay({ design, warnings = [], onClose, onGoToSection }) {
  return (
    <div
      className="section-modal-backdrop call-flow-overlay-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="call-flow-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-flow-overlay-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <FlowExplorer design={design} mode="expanded" warnings={warnings} onClose={onClose} onGoToSection={onGoToSection} />
      </div>
    </div>
  )
}

function FlowExplorer({ design, mode = 'expanded', warnings = [], onClose, onGoToSection }) {
  const layout = mode === 'expanded' ? EXPANDED : PREVIEW
  const model = useMemo(() => buildFlowModel(design, layout), [design, layout])
  const [selectedId, setSelectedId] = useState(null)
  const [destId, setDestId] = useState(null)
  const [followIndex, setFollowIndex] = useState(-1)
  const [mapOpen, setMapOpen] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const viewportRef = useRef(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const railDest = destId || selectedId
  const railPath = useMemo(
    () => (railDest ? walkLivePath(model, railDest) : []),
    [model, railDest],
  )
  const railPathRef = useRef(railPath)
  railPathRef.current = railPath

  const selected = model.nodes.find(n => n.id === selectedId) || null
  const following = followIndex >= 0
  const truncateMax = mode === 'expanded' ? 36 : 24

  const fitView = useCallback(() => {
    const el = viewportRef.current
    if (!el) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const pad = mode === 'expanded' ? 40 : 20
    const availW = Math.max(el.clientWidth - pad * 2, 120)
    const availH = Math.max(el.clientHeight - pad * 2, 120)
    const scale = Math.min(1, availW / model.width, availH / model.height)
    const nextZoom = Math.max(0.35, Math.min(mode === 'expanded' ? 1.05 : 1, scale))
    setZoom(nextZoom)
    setPan({
      x: (el.clientWidth - model.width * nextZoom) / 2,
      y: Math.max(pad, (el.clientHeight - model.height * nextZoom) / 2),
    })
  }, [model.width, model.height, mode])

  useEffect(() => {
    setSelectedId(null)
    setDestId(null)
    setFollowIndex(-1)
    const t = requestAnimationFrame(() => fitView())
    return () => cancelAnimationFrame(t)
  }, [design, fitView])

  useEffect(() => {
    const onResize = () => fitView()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitView])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const sync = () => setMapOpen(!mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const panToNode = useCallback((id, z = zoomRef.current) => {
    const node = model.nodes.find(n => n.id === id)
    const el = viewportRef.current
    if (!node || !el) return
    const nx = node.x + (node.w ?? 0) / 2
    const ny = node.y + (node.h ?? 0) / 2
    setPan({
      x: el.clientWidth / 2 - nx * z,
      y: el.clientHeight / 2 - ny * z,
    })
  }, [model.nodes])

  function selectNode(id, { follow = false } = {}) {
    setSelectedId(id)
    if (!follow) {
      setFollowIndex(-1)
      setDestId(id)
    }
    panToNode(id)
  }

  function startFollow() {
    const dest = destId || selectedId || defaultFlowDestination(model)
    if (!dest) return
    const path = walkLivePath(model, dest)
    if (!path.length) return
    setDestId(path[path.length - 1].id)
    setFollowIndex(0)
    setSelectedId(path[0].id)
    panToNode(path[0].id)
  }

  function followDelta(delta) {
    let path = railPathRef.current
    if (!path.length) {
      const dest = destId || selectedId || defaultFlowDestination(model)
      if (!dest) return
      path = walkLivePath(model, dest)
      if (!path.length) return
      setDestId(path[path.length - 1].id)
    }
    const base = followIndex < 0 ? (delta > 0 ? -1 : 0) : followIndex
    const next = Math.min(path.length - 1, Math.max(0, base + delta))
    setFollowIndex(next)
    setSelectedId(path[next].id)
    panToNode(path[next].id)
  }

  useEffect(() => {
    if (mode !== 'expanded') return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault()
        setFollowIndex((idx) => {
          const path = railPathRef.current
          if (!path.length) return idx
          const base = idx < 0 ? -1 : idx
          const next = Math.min(path.length - 1, Math.max(0, base + 1))
          const id = path[next].id
          setSelectedId(id)
          requestAnimationFrame(() => panToNode(id))
          return next
        })
      }
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault()
        setFollowIndex((idx) => {
          const path = railPathRef.current
          if (!path.length) return idx
          const base = idx < 0 ? 0 : idx
          const next = Math.min(path.length - 1, Math.max(0, base - 1))
          const id = path[next].id
          setSelectedId(id)
          requestAnimationFrame(() => panToNode(id))
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose, panToNode])

  function zoomBy(delta) {
    setZoom(z => Math.min(2.4, Math.max(0.35, Math.round((z + delta) * 100) / 100)))
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    if (e.target.closest('.cf-node-hit')) return
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    setDragging(true)
  }

  function onPointerMove(e) {
    if (!dragRef.current) return
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y })
  }

  function onPointerUp() {
    dragRef.current = null
    setDragging(false)
  }

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    zoomBy(e.deltaY > 0 ? -0.1 : 0.1)
  }

  function onRailChip(i) {
    const node = railPath[i]
    if (!node) return
    setFollowIndex(i)
    selectNode(node.id, { follow: true })
  }

  const viewportH = mode === 'expanded' ? 'min(70vh, 720px)' : 280
  const canFollow = railPath.length > 0 || Boolean(defaultFlowDestination(model))

  return (
    <div className={`call-flow call-flow-explore call-flow-mode-${mode}`}>
      <div className="call-flow-meta">
        <div>
          <div className="survey-kicker">{mode === 'expanded' ? 'Fullscreen' : 'Call flow'}</div>
          <h2 id="call-flow-overlay-title">Call flow map</h2>
          <p>
            {mode === 'expanded'
              ? 'Walk the path rail with Next, or tap a hop. Drag to pan · ⌘/Ctrl+scroll to zoom · Esc to close.'
              : 'Explore routing hops.'}
          </p>
        </div>
        <div className="call-flow-meta-actions">
          {mode === 'expanded' && (
            <>
              <button type="button" className="btn btn-primary" onClick={startFollow} disabled={!canFollow}>
                Start follow
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => followDelta(-1)} disabled={!railPath.length}>
                Prev
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => followDelta(1)} disabled={!railPath.length}>
                Next
              </button>
              {following && railPath.length > 0 && (
                <span className="call-flow-follow-pos">
                  {followIndex + 1} / {railPath.length}
                </span>
              )}
              {onClose && (
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Close
                </button>
              )}
            </>
          )}
          <div className="call-flow-legend">
            <span><i className="cf-dot cf-dot-main" /> Entry / open</span>
            <span><i className="cf-dot cf-dot-branch" /> Decision</span>
            <span><i className="cf-dot cf-dot-leaf" /> Destination</span>
            <span><i className="cf-dot cf-dot-night" /> After hours</span>
          </div>
        </div>
      </div>

      <div className="call-flow-explorer">
        <div className="call-flow-map-wrap">
          <nav className="cf-path-rail" aria-label="Call path">
            {railPath.length === 0 ? (
              <span className="cf-path-rail-empty">Select a destination to trace the path</span>
            ) : (
              railPath.map((node, i) => (
                <Fragment key={node.id}>
                  {i > 0 && <span className="cf-path-rail-sep" aria-hidden="true">→</span>}
                  <button
                    type="button"
                    className={`cf-path-chip${selectedId === node.id ? ' is-active' : ''}${followIndex === i ? ' is-follow' : ''}`}
                    onClick={() => onRailChip(i)}
                  >
                    <span className="cf-path-chip-kind">{railKind(node)}</span>
                    <span className="cf-path-chip-name">{node.title}</span>
                  </button>
                </Fragment>
              ))
            )}
          </nav>

          <button
            type="button"
            className="cf-map-toggle"
            aria-expanded={mapOpen}
            onClick={() => setMapOpen(open => !open)}
          >
            {mapOpen ? 'Hide map' : 'Show map'}
          </button>

          <div className={`call-flow-canvas-panel${mapOpen ? ' is-open' : ''}`}>
            <div className="call-flow-toolbar" role="toolbar" aria-label="Map controls">
              <button type="button" className="btn btn-secondary" onClick={() => zoomBy(0.15)}>+</button>
              <button type="button" className="btn btn-secondary" onClick={() => zoomBy(-0.15)}>−</button>
              <button type="button" className="btn btn-secondary" onClick={fitView}>Fit</button>
              <span className="call-flow-zoom-label">{Math.round(zoom * 100)}%</span>
            </div>

            <div
              ref={viewportRef}
              className={`call-flow-viewport${dragging ? ' is-dragging' : ''}`}
              style={{ height: viewportH }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onWheel={onWheel}
            >
              <svg
                width={model.width}
                height={model.height}
                viewBox={`0 0 ${model.width} ${model.height}`}
                className="call-flow-svg"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                role="img"
                aria-label="Call flow diagram"
              >
                <StaticMapSvg
                  model={model}
                  selectedId={selectedId}
                  pathEndId={railDest}
                  followId={following ? railPath[followIndex]?.id : null}
                  truncateMax={truncateMax}
                  warnings={warnings}
                  onSelect={(id) => {
                    selectNode(id)
                  }}
                />
              </svg>
            </div>
          </div>

          <div className="call-flow-detail" role="status">
            {selected ? (
              <>
                <div className="call-flow-detail-kicker">{kindLabel(selected.kind, selected.tone)}</div>
                <h3>{selected.title}</h3>
                {selected.detail
                  ? <p>{selected.detail}</p>
                  : <p className="muted">No extra detail on this step.</p>}
                {selected.edgeIn && (
                  <p className="call-flow-detail-edge">Reached via: <strong>{selected.edgeIn}</strong></p>
                )}
                {warnings.filter(w => w.nodeId === selected.id).map((w, i) => (
                  <p key={i} className={`cf-detail-warning cf-detail-warning-${w.severity}`}>
                    ⚠ {w.message}
                  </p>
                ))}
                {onGoToSection && selected.sectionKey && (
                  <button
                    type="button"
                    className="btn btn-secondary call-flow-edit-btn"
                    onClick={() => onGoToSection(selected.sectionKey)}
                  >
                    Edit in form →
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="call-flow-detail-kicker">Follow the flow</div>
                <h3>Pick a hop or press Start follow</h3>
                <p className="muted">The rail shows entry to destination. Next walks each hop.</p>
                {warnings.length > 0 && (
                  <div className="cf-warnings-list">
                    {warnings.map((w, i) => (
                      <div key={i} className={`cf-warning-item cf-warning-${w.severity}`}>
                        ⚠ {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// StaticMapSvg — shared between preview and expanded modes.
// Uses node.w / node.h (assigned by layoutGraph) — no layout object needed for sizing.
function StaticMapSvg({
  model,
  selectedId,
  pathEndId = null,
  followId = null,
  truncateMax = 28,
  onSelect,
  warnings = [],
}) {
  const uid = useId().replace(/:/g, '')
  const reduce = prefersReducedMotion()
  const pathSets = useMemo(
    () => livePathMembership(model, pathEndId || selectedId),
    [model, pathEndId, selectedId],
  )
  const dimming = Boolean(pathSets)

  const orderIndex = useMemo(() => {
    const map = new Map()
    model.outline.forEach((step, i) => map.set(step.id, i))
    model.nodes.forEach((node) => {
      if (!map.has(node.id)) map.set(node.id, map.size)
    })
    return map
  }, [model])

  const warnMap = {}
  warnings.forEach(w => {
    if (!warnMap[w.nodeId]) warnMap[w.nodeId] = w.severity
    else if (w.severity === 'warn') warnMap[w.nodeId] = 'warn'
  })

  const dotsId = `cf-dots-${uid}`

  return (
    <g className={`cf-map${dimming ? ' is-dimming' : ''}${reduce ? ' is-reduced' : ''}`}>
      <defs>
        <pattern id={dotsId} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.8" fill="currentColor" opacity="0.055" />
        </pattern>
      </defs>
      <rect width={model.width} height={model.height} fill={`url(#${dotsId})`} />

      {model.edges.map((edge, i) => {
        const onPath = !pathSets || pathSets.edges.has(i)
        return (
          <g
            key={`e-${i}`}
            className={`cf-edge${edge.tone === 'night' ? ' cf-edge-night' : ''}${onPath ? ' is-on-path' : ''}`}
            style={{ '--i': i }}
          >
            <path className="track" d={edge.path} pathLength="1" />
            <path className="pulse" d={edge.path} pathLength="1" />
            {edge.label && (
              <text x={edge.labelX} y={edge.labelY} className="cf-edge-label">{edge.label}</text>
            )}
          </g>
        )
      })}

      {model.nodes.map((node) => {
        if (node.x == null || node.y == null) return null
        const active = selectedId === node.id
        const follow = followId === node.id
        const onPath = !pathSets || pathSets.nodes.has(node.id)
        const w = node.w ?? 200
        const h = node.h ?? 52
        const isDiamond = node.kind === 'branch'
        const titleY = node.detail ? Math.round(h * 0.42) : Math.round(h * 0.62)
        const detailY = Math.round(h * 0.76)
        const i = orderIndex.get(node.id) ?? 0

        return (
          <g
            key={node.id}
            className={`cf-node cf-node-${node.kind}${node.tone ? ` cf-tone-${node.tone}` : ''}${active ? ' is-selected' : ''}${follow ? ' is-follow' : ''}${onPath ? ' is-on-path' : ''}${warnMap[node.id] ? ` cf-node-warn-${warnMap[node.id]}` : ''}`}
            transform={`translate(${node.x}, ${node.y})`}
            style={{ '--i': i }}
          >
            <title>{[node.title, node.detail].filter(Boolean).join(' — ')}</title>

            {isDiamond ? (
              <polygon
                points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
                className="cf-shape"
              />
            ) : (
              <rect width={w} height={h} rx="10" className="cf-shape" />
            )}

            {onSelect && (
              <rect
                x={-3} y={-3} width={w + 6} height={h + 6}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}
              />
            )}

            {isDiamond ? (
              <text x={w / 2} y={h / 2 + 4} textAnchor="middle" className="cf-label">
                {truncate(node.title, 10)}
              </text>
            ) : (
              <>
                <text x={14} y={titleY} className="cf-label cf-label-left">
                  {truncate(node.title, truncateMax)}
                </text>
                {node.detail && (
                  <text x={14} y={detailY} className="cf-sublabel">
                    {truncate(node.detail, truncateMax + 6)}
                  </text>
                )}
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

function railKind(node) {
  if (node.tone === 'night') return 'NIGHT'
  if (node.kind === 'main') return 'ENTRY'
  if (node.kind === 'branch') return 'BRANCH'
  return 'DEST'
}

function kindLabel(kind, tone) {
  if (tone === 'night') return 'After hours'
  if (kind === 'main') return 'Entry / open path'
  if (kind === 'branch') return 'Decision'
  return 'Destination'
}

function truncate(value, max) {
  const text = String(value || '').trim() || '—'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
