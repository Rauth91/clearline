/**
 * Call-flow map — compact preview, fullscreen follow mode, plain-language labels.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EXPANDED_LAYOUT,
  PREVIEW_LAYOUT,
  buildFlowModel,
} from '../lib/flowMapModel.js'

const PREVIEW = PREVIEW_LAYOUT
const EXPANDED = EXPANDED_LAYOUT

export default function CallFlowDiagram({ design, compact = false }) {
  const [expanded, setExpanded] = useState(false)

  if (compact) {
    return <FlowExplorer design={design} mode="compact" />
  }

  return (
    <>
      <FlowPreview design={design} onOpen={() => setExpanded(true)} />
      {expanded && createPortal(
        <FlowOverlay design={design} onClose={() => setExpanded(false)} />,
        document.body,
      )}
    </>
  )
}

function FlowPreview({ design, onOpen }) {
  const model = useMemo(() => buildFlowModel(design, PREVIEW), [design])
  return (
    <div className="call-flow call-flow-preview">
      <div className="call-flow-meta">
        <div>
          <div className="survey-kicker">Call flow</div>
          <h2>Map preview</h2>
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
          <StaticMapSvg model={model} layout={PREVIEW} selectedId={null} truncateMax={22} />
        </svg>
        <span className="call-flow-preview-cta">Click to open full map</span>
      </button>
    </div>
  )
}

function FlowOverlay({ design, onClose }) {
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
        <FlowExplorer design={design} mode="expanded" onClose={onClose} />
      </div>
    </div>
  )
}

function FlowExplorer({ design, mode = 'expanded', onClose }) {
  const layout = mode === 'expanded' ? EXPANDED : PREVIEW
  const model = useMemo(() => buildFlowModel(design, layout), [design, layout])
  const [selectedId, setSelectedId] = useState(null)
  const [followIndex, setFollowIndex] = useState(-1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const viewportRef = useRef(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

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
    // Prefer fitting the whole tree; avoid over-zooming which clips side branches
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
    setFollowIndex(-1)
    const t = requestAnimationFrame(() => fitView())
    return () => cancelAnimationFrame(t)
  }, [design, fitView])

  useEffect(() => {
    const onResize = () => fitView()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitView])

  const panToNode = useCallback((id, z = zoomRef.current) => {
    const node = model.nodes.find(n => n.id === id)
    const el = viewportRef.current
    if (!node || !el) return
    const nx = node.x + (node.kind === 'branch' ? layout.diamond / 2 : layout.nodeW / 2)
    const ny = node.y + (node.kind === 'branch' ? layout.diamond / 2 : layout.nodeH / 2)
    setPan({
      x: el.clientWidth / 2 - nx * z,
      y: el.clientHeight / 2 - ny * z,
    })
  }, [model.nodes, layout])

  function selectNode(id, { follow = false } = {}) {
    setSelectedId(id)
    if (!follow) setFollowIndex(-1)
    panToNode(id)
  }

  function startFollow() {
    if (!model.outline.length) return
    setFollowIndex(0)
    const id = model.outline[0].id
    setSelectedId(id)
    panToNode(id)
  }

  function followDelta(delta) {
    if (!model.outline.length) return
    const base = followIndex < 0 ? (delta > 0 ? -1 : 0) : followIndex
    const next = Math.min(model.outline.length - 1, Math.max(0, base + delta))
    setFollowIndex(next)
    const id = model.outline[next].id
    setSelectedId(id)
    panToNode(id)
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
          if (!model.outline.length) return idx
          const base = idx < 0 ? -1 : idx
          const next = Math.min(model.outline.length - 1, Math.max(0, base + 1))
          const id = model.outline[next].id
          setSelectedId(id)
          requestAnimationFrame(() => panToNode(id))
          return next
        })
      }
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault()
        setFollowIndex((idx) => {
          if (!model.outline.length) return idx
          const base = idx < 0 ? 0 : idx
          const next = Math.min(model.outline.length - 1, Math.max(0, base - 1))
          const id = model.outline[next].id
          setSelectedId(id)
          requestAnimationFrame(() => panToNode(id))
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose, model.outline, panToNode])

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

  const viewportH = mode === 'expanded' ? 'min(70vh, 720px)' : 280

  return (
    <div className={`call-flow call-flow-explore call-flow-mode-${mode}`}>
      <div className="call-flow-meta">
        <div>
          <div className="survey-kicker">{mode === 'expanded' ? 'Fullscreen' : 'Call flow'}</div>
          <h2 id="call-flow-overlay-title">Call flow map</h2>
          <p>
            {mode === 'expanded'
              ? 'Follow the path with Next, or click any step. Drag to pan · ⌘/Ctrl+scroll to zoom · Esc to close.'
              : 'Explore routing hops.'}
          </p>
        </div>
        <div className="call-flow-meta-actions">
          {mode === 'expanded' && (
            <>
              <button type="button" className="btn btn-primary" onClick={startFollow}>
                Start follow
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => followDelta(-1)} disabled={!model.outline.length}>
                Prev
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => followDelta(1)} disabled={!model.outline.length}>
                Next
              </button>
              {following && (
                <span className="call-flow-follow-pos">
                  {followIndex + 1} / {model.outline.length}
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
        <aside className="call-flow-steps" aria-label="Call flow steps">
          <div className="call-flow-steps-head">Steps</div>
          <ol className="call-flow-step-list">
            {model.outline.map((step, i) => (
              <li key={step.id}>
                <button
                  type="button"
                  className={`call-flow-step${selectedId === step.id ? ' is-active' : ''}${followIndex === i ? ' is-follow' : ''}`}
                  onClick={() => {
                    setFollowIndex(i)
                    selectNode(step.id, { follow: true })
                  }}
                >
                  <span className="call-flow-step-idx">{i + 1}</span>
                  <span className="call-flow-step-body">
                    <strong>{step.title}</strong>
                    {step.detail && <span>{step.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="call-flow-map-wrap">
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
                layout={layout}
                selectedId={selectedId}
                followId={following ? model.outline[followIndex]?.id : null}
                truncateMax={truncateMax}
                onSelect={(id) => {
                  const idx = model.outline.findIndex(s => s.id === id)
                  if (idx >= 0) setFollowIndex(idx)
                  selectNode(id, { follow: idx >= 0 })
                }}
              />
            </svg>
          </div>

          <div className="call-flow-detail" role="status">
            {selected ? (
              <>
                <div className="call-flow-detail-kicker">{kindLabel(selected.kind, selected.tone)}</div>
                <h3>{selected.title}</h3>
                {selected.detail ? <p>{selected.detail}</p> : <p className="muted">No extra detail on this step.</p>}
                {selected.edgeIn && (
                  <p className="call-flow-detail-edge">Reached via: <strong>{selected.edgeIn}</strong></p>
                )}
              </>
            ) : (
              <>
                <div className="call-flow-detail-kicker">Follow the flow</div>
                <h3>Pick a step or press Start follow</h3>
                <p className="muted">Next walks each hop so you can read the full destination text.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StaticMapSvg({ model, layout, selectedId, followId = null, truncateMax = 28, onSelect }) {
  const { nodeW, nodeH, diamond } = layout
  return (
    <>
      <defs>
        <pattern id="cf-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.08" />
        </pattern>
        <marker id="cf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.45" />
        </marker>
      </defs>
      <rect width={model.width} height={model.height} fill="url(#cf-grid)" />
      {model.edges.map((edge, i) => (
        <g key={`e-${i}`} className={`cf-edge${edge.tone === 'night' ? ' cf-edge-night' : ''}`}>
          <path
            d={edge.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            opacity="0.45"
            markerEnd="url(#cf-arrow)"
          />
          {edge.label && (
            <text x={edge.labelX} y={edge.labelY} className="cf-edge-label">{edge.label}</text>
          )}
        </g>
      ))}
      {model.nodes.map((node) => {
        const active = selectedId === node.id
        const follow = followId === node.id
        return (
          <g
            key={node.id}
            className={`cf-node cf-node-${node.kind}${node.tone ? ` cf-tone-${node.tone}` : ''}${active ? ' is-selected' : ''}${follow ? ' is-follow' : ''}`}
            transform={`translate(${node.x}, ${node.y})`}
          >
            <title>{[node.title, node.detail].filter(Boolean).join(' — ')}</title>
            {node.kind === 'branch' ? (
              <polygon
                points={`${diamond / 2},0 ${diamond},${diamond / 2} ${diamond / 2},${diamond} 0,${diamond / 2}`}
                className="cf-shape"
              />
            ) : (
              <rect width={nodeW} height={nodeH} rx="12" className="cf-shape" />
            )}
            {onSelect && (
              <rect
                className="cf-node-hit"
                x={node.kind === 'branch' ? -4 : -2}
                y={node.kind === 'branch' ? -4 : -2}
                width={(node.kind === 'branch' ? diamond : nodeW) + 8}
                height={(node.kind === 'branch' ? diamond : nodeH) + 8}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(node.id)
                }}
              />
            )}
            {node.kind === 'branch' ? (
              <text x={diamond / 2} y={diamond / 2 + 4} textAnchor="middle" className="cf-label">
                {truncate(node.title, 12)}
              </text>
            ) : (
              <>
                <text x={16} y={node.detail ? 24 : 38} className="cf-label cf-label-left">
                  {truncate(node.title, truncateMax)}
                </text>
                {node.detail && (
                  <text x={16} y={46} className="cf-sublabel">
                    {truncate(node.detail, truncateMax + 4)}
                  </text>
                )}
              </>
            )}
          </g>
        )
      })}
    </>
  )
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
