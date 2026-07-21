import {
  makeId,
  newTopologyNode,
  nextTopologyPosition,
  topologyCanvasSize,
  assignLinkSlots,
  cableGeometry,
  defaultPortCount,
  normalizePort,
  portLabel,
  portPresets,
  TOPO_NODE_HALF_W,
  TOPO_NODE_HALF_H,
} from '../lib/surveyModel.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const NODE_TYPES = ['Firewall', 'Router', 'Switch', 'AP', 'Phone', 'PC', 'Server', 'Other']
const NODE_HALF_W = TOPO_NODE_HALF_W
const NODE_HALF_H = TOPO_NODE_HALF_H
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.15

function isPhoneNode(node) {
  return node?.type === 'Phone'
}

export default function TopologyEditor({ topology, onChange }) {
  const nodes = topology.nodes || []
  const links = topology.links || []
  const scrollRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPort, setSelectedPort] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const canvas = topologyCanvasSize(nodes)
  const selected = nodes.find(n => n.id === selectedId) || null

  function addNode(type) {
    const pos = nextTopologyPosition(nodes)
    const node = newTopologyNode(type, { x: pos.x, y: pos.y })
    onChange({
      ...topology,
      nodes: [...nodes, node],
    })
    setSelectedId(node.id)
    setSelectedPort(null)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const next = topologyCanvasSize([...nodes, { x: pos.x, y: pos.y }])
      el.scrollTop = Math.max(0, (pos.y / next.height) * el.scrollHeight * zoom - el.clientHeight * 0.45)
    })
  }

  function updateNode(id, patch) {
    onChange({
      ...topology,
      nodes: nodes.map(n => n.id === id ? { ...n, ...patch } : n),
    })
  }

  function removeNode(id) {
    onChange({
      ...topology,
      nodes: nodes.filter(n => n.id !== id),
      links: links.filter(l => l.from !== id && l.to !== id),
    })
    if (selectedId === id) {
      setSelectedId(null)
      setSelectedPort(null)
    }
  }

  function addLink(from, to, fromPort = '', toPort = '', media = 'Cat6', notes = '') {
    if (!from || !to || from === to) return
    if (links.some(l => (l.from === from && l.to === to) || (l.from === to && l.to === from))) return
    onChange({
      ...topology,
      links: [...links, {
        id: makeId(),
        from,
        to,
        fromPort: fromPort.trim(),
        toPort: toPort.trim(),
        media,
        label: '',
        notes,
      }],
    })
  }

  function updateLink(id, patch) {
    onChange({
      ...topology,
      links: links.map(l => l.id === id ? { ...l, ...patch } : l),
    })
  }

  function removeLink(id) {
    onChange({ ...topology, links: links.filter(l => l.id !== id) })
  }

  function setZoomClamped(next) {
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100)))
  }

  function onWheel(evt) {
    if (!(evt.ctrlKey || evt.metaKey)) return
    evt.preventDefault()
    setZoomClamped(zoom + (evt.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }

  function dragNode(evt, node) {
    evt.preventDefault()
    evt.stopPropagation()
    const svg = evt.currentTarget.closest('svg')
    const start = point(evt, svg)
    const origin = { x: node.x, y: node.y }
    let moved = false
    let last = { x: node.x, y: node.y }

    function move(moveEvt) {
      const current = point(moveEvt, svg)
      const dx = current.x - start.x
      const dy = current.y - start.y
      if (Math.hypot(dx, dy) > 3) moved = true
      last = {
        x: Math.max(NODE_HALF_W + 12, origin.x + dx),
        y: Math.max(NODE_HALF_H + 12, origin.y + dy),
      }
      setDragPos({ id: node.id, ...last })
    }

    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDragPos(null)
      if (moved) {
        updateNode(node.id, last)
      } else {
        setSelectedId(node.id)
        setSelectedPort(null)
      }
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const displayNodes = dragPos
    ? nodes.map(n => (n.id === dragPos.id ? { ...n, x: dragPos.x, y: dragPos.y } : n))
    : nodes
  const nodeMap = Object.fromEntries(displayNodes.map(n => [n.id, n]))
  const displayW = canvas.width * zoom
  const displayH = canvas.height * zoom
  const slots = assignLinkSlots(displayNodes, links)

  return (
    <div className="topology-editor">
      <div className="topology-toolbar">
        <div className="topo-add-group">
          {NODE_TYPES.map(type => (
            <button key={type} type="button" className="topo-chip" onClick={() => addNode(type)}>
              + {type}
            </button>
          ))}
        </div>
        <div className="topo-zoom">
          <button type="button" className="topo-zoom-btn" onClick={() => setZoomClamped(zoom - ZOOM_STEP)} aria-label="Zoom out">-</button>
          <span className="topo-zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="topo-zoom-btn" onClick={() => setZoomClamped(zoom + ZOOM_STEP)} aria-label="Zoom in">+</button>
          <button type="button" className="topo-zoom-btn topo-zoom-reset" onClick={() => setZoom(1)}>Reset</button>
        </div>
      </div>

      <div className="topology-canvas-scroll" ref={scrollRef} onWheel={onWheel}>
        <svg
          className="topology-canvas"
          width={displayW}
          height={displayH}
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          onClick={() => setSelectedId(null)}
        >
          <defs>
            <pattern id="topo-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--line)" strokeWidth="0.7" opacity="0.55" />
            </pattern>
          </defs>
          <rect width={canvas.width} height={canvas.height} fill="url(#topo-grid)" />

          {links.map(link => {
            const from = nodeMap[link.from]
            const to = nodeMap[link.to]
            if (!from || !to) return null
            const cable = cableGeometry(from, to, slots[link.id])
            return (
              <g
                key={link.id}
                className={`topo-cable${selectedId && (link.from === selectedId || link.to === selectedId) ? ' is-related' : ''}`}
                onDoubleClick={e => {
                  e.stopPropagation()
                  removeLink(link.id)
                }}
                onClick={e => e.stopPropagation()}
              >
                <path d={cable.path} className="cable-jacket" />
                <path d={cable.path} className="cable-core" />
              </g>
            )
          })}

          {displayNodes.map(node => {
            const isSelected = node.id === selectedId
            return (
              <g
                key={node.id}
                className={`topo-node${isSelected ? ' is-selected' : ''}`}
                transform={`translate(${node.x},${node.y})`}
                onMouseDown={e => dragNode(e, node)}
                onClick={e => e.stopPropagation()}
              >
                <rect
                  x={-NODE_HALF_W}
                  y={-NODE_HALF_H}
                  width={NODE_HALF_W * 2}
                  height={NODE_HALF_H * 2}
                  rx="8"
                />
                <text y="-3" textAnchor="middle" className="topo-type">
                  {truncate(node.label || node.type, 14)}
                </text>
                <text y="10" textAnchor="middle" className="topo-label">{node.type}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <p className="topo-hint">
        Click a device to open its faceplate and ports. Drag devices to lay out the overview.
        Use the connections table for the handoff details. Double-click a cable to remove it.
      </p>

      {selected && (
        <DeviceInspector
          node={selected}
          nodes={nodes}
          links={links}
          nodeMap={nodeMap}
          selectedPort={selectedPort}
          onSelectPort={setSelectedPort}
          onUpdateNode={patch => updateNode(selected.id, patch)}
          onUpdateLink={updateLink}
          onRemoveLink={removeLink}
          onCreateLink={addLink}
          onRemoveNode={() => removeNode(selected.id)}
          onClose={() => {
            setSelectedId(null)
            setSelectedPort(null)
          }}
        />
      )}

      <div className="topology-details">
        <div>
          <div className="mini-section-title">Device list</div>
          <div className="device-list">
            {nodes.map(node => (
              <button
                type="button"
                key={node.id}
                className={`device-list-item${node.id === selectedId ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedId(node.id)
                  setSelectedPort(null)
                }}
              >
                <span className="device-list-type">{node.type}</span>
                <span className="device-list-label">{node.label || 'Unnamed'}</span>
                <span className="device-list-meta">
                  {deviceListMeta(node)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mini-section-title">Add cable</div>
          <LinkCreator nodes={nodes} onCreate={addLink} />
          <ConnectionsTable links={links} nodeMap={nodeMap} onUpdateLink={updateLink} onRemoveLink={removeLink} />
        </div>
      </div>
    </div>
  )
}

function deviceListMeta(node) {
  if (isPhoneNode(node)) {
    return [node.extension && `Ext ${node.extension}`, node.phone].filter(Boolean).join(' · ') || '—'
  }
  return [node.ip, node.location].filter(Boolean).join(' · ') || '—'
}

function DeviceInspector({
  node,
  nodes,
  links,
  nodeMap,
  selectedPort,
  onSelectPort,
  onUpdateNode,
  onUpdateLink,
  onRemoveLink,
  onCreateLink,
  onRemoveNode,
  onClose,
}) {
  const count = Number(node.portCount || defaultPortCount(node.type))
  const presets = portPresets(node.type)
  const portLinks = links.filter(l => l.from === node.id || l.to === node.id)
  const selectedLink = selectedPort ? portLinks.find(l => portForNode(l, node.id) === selectedPort) : null

  function setPortCount(value) {
    const next = Number(value)
    const overflow = portLinks.some(l => {
      const port = Number(portForNode(l, node.id))
      return Number.isFinite(port) && port > next
    })
    if (overflow && !confirm('Some connections use ports above this count. Keep the larger port count?')) return
    onUpdateNode({ portCount: next })
  }

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(evt) {
      if (evt.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="device-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="device-inspector" role="dialog" aria-modal="true" aria-label={`${node.label || node.type} details`} onMouseDown={e => e.stopPropagation()}>
        <div className="device-detail-head">
          <div>
            <div className="mini-section-title">Device faceplate</div>
            <strong>{node.label || node.type}</strong>
          </div>
          <div className="device-modal-actions">
            <button type="button" onClick={onRemoveNode}>Remove device</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>

        <div className="device-inspector-layout">
          <div className="faceplate-column">
            <div className="faceplate-toolbar">
              <span>{node.type}</span>
              {presets.length > 1 && (
                <label>
                  Ports
                  <select value={count} onChange={e => setPortCount(e.target.value)}>
                    {presets.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              )}
            </div>
            <Faceplate node={node} links={portLinks} nodeMap={nodeMap} selectedPort={selectedPort} onSelectPort={onSelectPort} />
            <PortEditor
              node={node}
              nodes={nodes}
              link={selectedLink}
              selectedPort={selectedPort}
              onCreateLink={onCreateLink}
              onUpdateLink={onUpdateLink}
              onRemoveLink={onRemoveLink}
            />
          </div>
          <div className="device-fields-panel">
            <div className="mini-section-title">Device details</div>
            <DeviceFields node={node} onUpdateNode={onUpdateNode} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Faceplate({ node, links, nodeMap, selectedPort, onSelectPort }) {
  const count = Number(node.portCount || defaultPortCount(node.type))
  return (
    <div className={`faceplate faceplate-${count > 16 ? 'dense' : 'normal'}`}>
      {Array.from({ length: count }, (_, i) => {
        const port = String(i + 1)
        const link = links.find(l => portForNode(l, node.id) === port)
        const other = link ? otherNode(link, node.id, nodeMap) : null
        return (
          <button
            type="button"
            key={port}
            className={`faceplate-port${link ? ' is-used' : ''}${selectedPort === port ? ' is-selected' : ''}`}
            onClick={() => onSelectPort(port)}
            title={other ? `Connected to ${other.label || other.type}` : 'Empty port'}
          >
            <strong>{portLabel(port, node.type)}</strong>
            <span>{other ? truncate(other.label || other.type, 14) : 'Empty'}</span>
          </button>
        )
      })}
    </div>
  )
}

function PortEditor({ node, nodes, link, selectedPort, onCreateLink, onUpdateLink, onRemoveLink }) {
  const [targetId, setTargetId] = useState('')
  const [targetPort, setTargetPort] = useState('')
  const [media, setMedia] = useState('Cat6')
  const [notes, setNotes] = useState('')

  if (!selectedPort) {
    return <p className="topo-hint">Select a port to assign or edit a connection.</p>
  }

  const other = link ? (link.from === node.id ? link.to : link.from) : targetId
  const farPort = link ? (link.from === node.id ? link.toPort : link.fromPort) : targetPort
  const linkMedia = link ? link.media : media
  const linkNotes = link ? link.notes : notes

  function save() {
    const to = link ? other : targetId
    if (!to || to === node.id) return
    if (link) {
      const patch = {
        media: linkMedia || 'Cat6',
        notes: linkNotes || '',
      }
      if (link.from === node.id) {
        patch.fromPort = selectedPort
        patch.toPort = farPort || ''
      } else {
        patch.toPort = selectedPort
        patch.fromPort = farPort || ''
      }
      onUpdateLink(link.id, patch)
    } else {
      onCreateLink(node.id, to, selectedPort, targetPort, media || 'Cat6', notes)
      setTargetId('')
      setTargetPort('')
      setMedia('Cat6')
      setNotes('')
    }
  }

  return (
    <div className="port-editor">
      <div className="mini-section-title">Port {portLabel(selectedPort, node.type)}</div>
      <div className="port-editor-grid">
        <select value={other || ''} onChange={e => link ? null : setTargetId(e.target.value)} disabled={Boolean(link)}>
          <option value="">Connect to...</option>
          {nodes.filter(n => n.id !== node.id).map(n => <option key={n.id} value={n.id}>{n.label || n.type}</option>)}
        </select>
        <input
          value={farPort || ''}
          onChange={e => link
            ? onUpdateLink(link.id, link.from === node.id ? { toPort: e.target.value } : { fromPort: e.target.value })
            : setTargetPort(e.target.value)}
          placeholder="Far port"
        />
        <input
          value={linkMedia || ''}
          onChange={e => link ? onUpdateLink(link.id, { media: e.target.value }) : setMedia(e.target.value)}
          placeholder="Cat6 / Fiber"
        />
        <input
          value={linkNotes || ''}
          onChange={e => link ? onUpdateLink(link.id, { notes: e.target.value }) : setNotes(e.target.value)}
          placeholder="Notes"
        />
        <button type="button" onClick={save}>{link ? 'Save' : 'Connect'}</button>
        {link && <button type="button" onClick={() => onRemoveLink(link.id)}>Clear</button>}
      </div>
    </div>
  )
}

function DeviceFields({ node, onUpdateNode }) {
  return (
    <div className="device-detail-grid">
      <label>
        <span>Label</span>
        <input value={node.label || ''} onChange={e => onUpdateNode({ label: e.target.value })} />
      </label>
      {isPhoneNode(node) && (
        <>
          <label>
            <span>Phone / DID</span>
            <input value={node.phone || ''} onChange={e => onUpdateNode({ phone: e.target.value })} placeholder="337-555-0100" />
          </label>
          <label>
            <span>Extension</span>
            <input value={node.extension || ''} onChange={e => onUpdateNode({ extension: e.target.value })} placeholder="1001" />
          </label>
        </>
      )}
      <label>
        <span>Location</span>
        <input value={node.location || ''} onChange={e => onUpdateNode({ location: e.target.value })} placeholder="Front desk" />
      </label>
      <label>
        <span>IP</span>
        <input value={node.ip || ''} onChange={e => onUpdateNode({ ip: e.target.value })} placeholder="10.0.0.20" />
      </label>
      <label>
        <span>MAC</span>
        <input value={node.mac || ''} onChange={e => onUpdateNode({ mac: e.target.value })} placeholder="aa:bb:cc:dd:ee:ff" />
      </label>
      <label className="span-2">
        <span>Notes</span>
        <input value={node.notes || ''} onChange={e => onUpdateNode({ notes: e.target.value })} placeholder="Model, VLAN, PoE, etc." />
      </label>
    </div>
  )
}

function ConnectionsTable({ links, nodeMap, onUpdateLink, onRemoveLink }) {
  if (!links.length) return <p className="empty-hint">No cables yet. Add a cable or connect ports from a device faceplate.</p>
  return (
    <div className="connections-table">
      <div className="connection-row connection-head">
        <span>From</span><span>Port</span><span>To</span><span>Port</span><span>Media</span><span>Notes</span><span />
      </div>
      {links.map(link => {
        const from = nodeMap[link.from]
        const to = nodeMap[link.to]
        return (
          <div className="connection-row" key={link.id}>
            <strong>{from?.label || 'Device'}</strong>
            <input value={link.fromPort || ''} onChange={e => onUpdateLink(link.id, { fromPort: e.target.value })} />
            <strong>{to?.label || 'Device'}</strong>
            <input value={link.toPort || ''} onChange={e => onUpdateLink(link.id, { toPort: e.target.value })} />
            <input value={link.media || ''} onChange={e => onUpdateLink(link.id, { media: e.target.value })} />
            <input value={link.notes || ''} onChange={e => onUpdateLink(link.id, { notes: e.target.value })} placeholder="Notes" />
            <button type="button" onClick={() => onRemoveLink(link.id)}>Remove</button>
          </div>
        )
      })}
    </div>
  )
}

function portForNode(link, nodeId) {
  return normalizePort(link.from === nodeId ? link.fromPort : link.toPort)
}

function otherNode(link, nodeId, nodeMap) {
  return nodeMap[link.from === nodeId ? link.to : link.from]
}

function truncate(value, max) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function LinkCreator({ nodes, onCreate }) {
  const first = nodes[0]?.id || ''
  const second = nodes[1]?.id || nodes[0]?.id || ''
  const [from, setFrom] = useState(first)
  const [to, setTo] = useState(second)
  const [fromPort, setFromPort] = useState('')
  const [toPort, setToPort] = useState('')

  const fromId = nodes.some(n => n.id === from) ? from : first
  const toId = nodes.some(n => n.id === to) ? to : second

  return (
    <div className="cable-creator">
      <select value={fromId} onChange={e => setFrom(e.target.value)}>
        {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      <input value={fromPort} onChange={e => setFromPort(e.target.value)} placeholder="Port" />
      <select value={toId} onChange={e => setTo(e.target.value)}>
        {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      <input value={toPort} onChange={e => setToPort(e.target.value)} placeholder="Port" />
      <button
        type="button"
        onClick={() => {
          onCreate(fromId, toId, fromPort, toPort)
          setFromPort('')
          setToPort('')
        }}
      >
        Add cable
      </button>
    </div>
  )
}

function point(evt, svg) {
  const pt = svg.createSVGPoint()
  pt.x = evt.clientX
  pt.y = evt.clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}
