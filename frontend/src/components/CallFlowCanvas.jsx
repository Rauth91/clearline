/**
 * CallFlowCanvas — React Flow-based drag-and-drop call flow editor.
 *
 * Replaces the custom SVG renderer in CallFlowDiagram.jsx.
 * Needs: npm install reactflow
 *
 * Node types (color-coded):
 *   incoming   — violet  — DID / main number
 *   ivr        — cyan    — Auto-attendant / IVR
 *   ringgroup  — amber   — Hunt group / ring group
 *   voicemail  — muted   — Voicemail box
 *   external   — rose    — Forward to external number
 *   terminate  — slate   — Hang up / end
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'

// ── Node color palette ────────────────────────────────────────────────────────
const NODE_COLORS = {
  incoming:  { bg: 'rgba(124,58,237,0.14)',  border: '#7c3aed', text: '#7c3aed',  icon: '📞' },
  ivr:       { bg: 'rgba(8,145,178,0.14)',   border: '#0891b2', text: '#0891b2',  icon: '🎛️' },
  ringgroup: { bg: 'rgba(217,119,6,0.14)',   border: '#d97706', text: '#d97706',  icon: '📢' },
  voicemail: { bg: 'rgba(107,101,128,0.14)', border: '#6b6580', text: '#6b6580',  icon: '📬' },
  external:  { bg: 'rgba(220,38,38,0.12)',   border: '#dc2626', text: '#dc2626',  icon: '↗️' },
  terminate: { bg: 'rgba(40,20,70,0.10)',    border: '#4c4560', text: '#4c4560',  icon: '⛔' },
}

const DARK_NODE_COLORS = {
  incoming:  { bg: 'rgba(167,139,250,0.18)', border: '#a78bfa', text: '#a78bfa', icon: '📞' },
  ivr:       { bg: 'rgba(34,211,238,0.16)',  border: '#22d3ee', text: '#22d3ee', icon: '🎛️' },
  ringgroup: { bg: 'rgba(251,191,36,0.16)',  border: '#fbbf24', text: '#fbbf24', icon: '📢' },
  voicemail: { bg: 'rgba(110,104,144,0.20)', border: '#6e6890', text: '#a8a0c8', icon: '📬' },
  external:  { bg: 'rgba(248,113,113,0.14)', border: '#f87171', text: '#f87171', icon: '↗️' },
  terminate: { bg: 'rgba(74,55,107,0.22)',   border: '#6e6890', text: '#6e6890', icon: '⛔' },
}

// ── Custom glass node component ───────────────────────────────────────────────
function GlassNode({ data, selected }) {
  const isDark = document.documentElement.dataset.theme === 'dark'
  const palette = isDark ? DARK_NODE_COLORS : NODE_COLORS
  const colors = palette[data.type] || palette.ivr

  return (
    <div
      style={{
        minWidth: 160,
        maxWidth: 220,
        padding: '10px 14px',
        borderRadius: 12,
        border: `1.5px solid ${selected ? colors.border : colors.border + '88'}`,
        background: colors.bg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: selected
          ? `0 0 0 2px ${colors.border}44, 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)`
          : '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        cursor: 'pointer',
        transition: 'box-shadow 0.18s, border-color 0.18s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{colors.icon}</span>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.text,
          fontFamily: 'Outfit, DM Sans, system-ui, sans-serif',
        }}>
          {data.type}
        </span>
      </div>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: isDark ? '#f2f0ff' : '#12081f',
        fontFamily: 'Outfit, DM Sans, system-ui, sans-serif',
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
      }}>
        {data.label}
      </div>
      {data.sublabel && (
        <div style={{
          fontSize: 11,
          color: isDark ? '#a8a0c8' : '#6b6580',
          marginTop: 4,
          lineHeight: 1.4,
        }}>
          {data.sublabel}
        </div>
      )}
    </div>
  )
}

const NODE_TYPES = { glass: GlassNode }

// ── Edge style ────────────────────────────────────────────────────────────────
const EDGE_STYLE = {
  stroke: 'var(--accent, #22d3ee)',
  strokeWidth: 1.5,
  strokeOpacity: 0.6,
}

// ── Node type toolbar ─────────────────────────────────────────────────────────
const NODE_TYPE_OPTIONS = [
  { type: 'incoming',  label: 'Incoming', icon: '📞' },
  { type: 'ivr',       label: 'Auto-attendant', icon: '🎛️' },
  { type: 'ringgroup', label: 'Ring Group', icon: '📢' },
  { type: 'voicemail', label: 'Voicemail', icon: '📬' },
  { type: 'external',  label: 'External Fwd', icon: '↗️' },
  { type: 'terminate', label: 'Terminate', icon: '⛔' },
]

// ── Inline edit panel ─────────────────────────────────────────────────────────
function EditPanel({ node, onUpdate, onDelete, onClose }) {
  if (!node) return null
  const isDark = document.documentElement.dataset.theme === 'dark'
  const palette = isDark ? DARK_NODE_COLORS : NODE_COLORS
  const colors = palette[node.data.type] || palette.ivr

  return (
    <div style={{
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 280,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderLeft: '1px solid var(--rim)',
      boxShadow: '-4px 0 32px rgba(0,0,0,0.2), inset 1px 0 0 rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      zIndex: 10,
      animation: 'cf-in 180ms ease both',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--rim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{colors.icon}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: colors.text,
            fontFamily: 'Outfit, DM Sans, system-ui, sans-serif',
          }}>
            Edit {node.data.type}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
        }}>×</button>
      </div>

      {/* Fields */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Label
          </span>
          <input
            value={node.data.label || ''}
            onChange={e => onUpdate({ label: e.target.value })}
            style={{
              padding: '8px 10px',
              border: '1px solid var(--rim)',
              borderRadius: 8,
              background: 'var(--glass)',
              backdropFilter: 'blur(8px)',
              color: 'var(--ink)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Detail / Extension
          </span>
          <input
            value={node.data.sublabel || ''}
            onChange={e => onUpdate({ sublabel: e.target.value })}
            placeholder="e.g. ext 1001, press 2…"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--rim)',
              borderRadius: 8,
              background: 'var(--glass)',
              backdropFilter: 'blur(8px)',
              color: 'var(--ink)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Node Type
          </span>
          <select
            value={node.data.type}
            onChange={e => onUpdate({ type: e.target.value })}
            style={{
              padding: '8px 10px',
              border: '1px solid var(--rim)',
              borderRadius: 8,
              background: 'var(--glass)',
              backdropFilter: 'blur(8px)',
              color: 'var(--ink)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            {NODE_TYPE_OPTIONS.map(o => (
              <option key={o.type} value={o.type}>{o.icon} {o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Delete */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--rim)' }}>
        <button
          onClick={onDelete}
          style={{
            width: '100%',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid rgba(220,38,38,0.3)',
            background: 'rgba(220,38,38,0.06)',
            color: 'var(--err, #dc2626)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Delete node
        </button>
      </div>
    </div>
  )
}

// ── Utility: build initial nodes/edges from existing call flow design ─────────
function designToFlow(design) {
  if (!design) return { nodes: [], edges: [] }

  const nodes = []
  const edges = []
  let y = 40

  // Main number → incoming node
  if (design.mainNumber) {
    nodes.push({
      id: 'main',
      type: 'glass',
      position: { x: 80, y },
      data: { type: 'incoming', label: design.mainNumber || 'Main Number', sublabel: 'Incoming call' },
    })
    y += 100
  }

  // IVR / auto-attendant
  if (design.autoAttendant?.enabled) {
    nodes.push({
      id: 'ivr',
      type: 'glass',
      position: { x: 80, y },
      data: { type: 'ivr', label: design.autoAttendant.name || 'Auto-Attendant', sublabel: design.autoAttendant.greeting ? 'Has greeting' : '' },
    })
    if (nodes.length > 1) edges.push({ id: 'e-main-ivr', source: 'main', target: 'ivr', style: EDGE_STYLE, animated: true })
    y += 100
  }

  // Hunt groups / ring groups
  const groups = design.huntGroups || []
  groups.forEach((g, i) => {
    const id = `hg-${i}`
    nodes.push({
      id,
      type: 'glass',
      position: { x: 80 + i * 200, y },
      data: { type: 'ringgroup', label: g.name || `Ring Group ${i+1}`, sublabel: `${(g.members || []).length} members` },
    })
    const prev = nodes[nodes.length - 2]
    if (prev) edges.push({ id: `e-${prev.id}-${id}`, source: prev.id, target: id, style: EDGE_STYLE, animated: false })
  })
  if (groups.length) y += 120

  // Voicemail
  if (design.voicemail?.enabled !== false) {
    nodes.push({
      id: 'vm',
      type: 'glass',
      position: { x: 80, y },
      data: { type: 'voicemail', label: 'Voicemail', sublabel: design.voicemail?.email ? `→ ${design.voicemail.email}` : '' },
    })
    y += 100
  }

  // If nothing loaded, provide a starter canvas
  if (nodes.length === 0) {
    nodes.push(
      { id: '1', type: 'glass', position: { x: 80,  y: 40  }, data: { type: 'incoming',  label: 'Main DID',          sublabel: '(555) 000-0000' } },
      { id: '2', type: 'glass', position: { x: 80,  y: 160 }, data: { type: 'ivr',       label: 'Auto-Attendant',    sublabel: 'Press 1 Sales · 2 Support' } },
      { id: '3', type: 'glass', position: { x: 30,  y: 300 }, data: { type: 'ringgroup', label: 'Sales',             sublabel: '3 agents · 30s timeout' } },
      { id: '4', type: 'glass', position: { x: 240, y: 300 }, data: { type: 'ringgroup', label: 'Support',           sublabel: '5 agents · 45s timeout' } },
      { id: '5', type: 'glass', position: { x: 130, y: 440 }, data: { type: 'voicemail', label: 'Voicemail',         sublabel: '→ ops@company.com' } },
    )
    edges.push(
      { id: 'e1', source: '1', target: '2', style: EDGE_STYLE, animated: true },
      { id: 'e2', source: '2', target: '3', style: EDGE_STYLE },
      { id: 'e3', source: '2', target: '4', style: EDGE_STYLE },
      { id: 'e4', source: '3', target: '5', style: EDGE_STYLE },
      { id: 'e5', source: '4', target: '5', style: EDGE_STYLE },
    )
  }

  return { nodes, edges }
}

// ── Main component ────────────────────────────────────────────────────────────
let nodeCounter = 100

export default function CallFlowCanvas({ design, onDesignChange }) {
  const { nodes: initNodes, edges: initEdges } = useMemo(() => designToFlow(design), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)
  const [selectedNode, setSelectedNode] = useState(null)
  const reactFlowWrapper = useRef(null)

  const onConnect = useCallback(
    (params) => setEdges(eds => addEdge({ ...params, style: EDGE_STYLE }, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((_, node) => setSelectedNode(node), [])
  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  function addNode(type) {
    const id = `node-${++nodeCounter}`
    const colors = NODE_COLORS[type] || NODE_COLORS.ivr
    setNodes(nds => [
      ...nds,
      {
        id,
        type: 'glass',
        position: { x: 100 + Math.random() * 200, y: 80 + Math.random() * 200 },
        data: { type, label: `New ${type}`, sublabel: '' },
      },
    ])
  }

  function updateSelectedNode(patch) {
    if (!selectedNode) return
    setNodes(nds => nds.map(n =>
      n.id === selectedNode.id
        ? { ...n, data: { ...n.data, ...patch } }
        : n
    ))
    setSelectedNode(s => ({ ...s, data: { ...s.data, ...patch } }))
  }

  function deleteSelectedNode() {
    if (!selectedNode) return
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520 }}>
      <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ style: EDGE_STYLE }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color="var(--rim)"
            gap={24}
            size={1}
            style={{ opacity: 0.4 }}
          />
          <Controls
            style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--rim)',
              borderRadius: 10,
              boxShadow: 'var(--shadow)',
            }}
          />
          <MiniMap
            style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--rim)',
              borderRadius: 10,
            }}
            nodeColor={n => {
              const isDark = document.documentElement.dataset.theme === 'dark'
              const p = isDark ? DARK_NODE_COLORS : NODE_COLORS
              return (p[n.data?.type] || p.ivr).border + '88'
            }}
          />

          {/* Add-node toolbar */}
          <Panel position="bottom-center">
            <div style={{
              display: 'flex',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--glass)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--rim)',
              borderRadius: 999,
              boxShadow: 'var(--shadow), inset 0 1px 0 rgba(255,255,255,0.1)',
              marginBottom: 12,
            }}>
              {NODE_TYPE_OPTIONS.map(o => (
                <button
                  key={o.type}
                  onClick={() => addNode(o.type)}
                  title={`Add ${o.label}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid var(--rim)',
                    background: 'transparent',
                    color: 'var(--ink-soft)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'Outfit, DM Sans, system-ui, sans-serif',
                    transition: 'background 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--rim)'; e.currentTarget.style.color = 'var(--ink-soft)' }}
                >
                  <span>{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Inline edit panel */}
      <EditPanel
        node={selectedNode}
        onUpdate={updateSelectedNode}
        onDelete={deleteSelectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  )
}
