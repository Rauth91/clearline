/**
 * Live call-flow map from System Design fields.
 * SVG telemetry style — no heavy library.
 */

import { useMemo } from 'react'

const NODE_W = 148
const NODE_H = 44
const DIAMOND = 54

export default function CallFlowDiagram({ design, compact = false }) {
  const model = useMemo(() => buildFlowModel(design), [design])

  return (
    <div className={`call-flow${compact ? ' call-flow-compact' : ''}`}>
      {!compact && (
        <div className="call-flow-meta">
          <div>
            <div className="survey-kicker">Live map</div>
            <h2>Call flow</h2>
            <p>Updates as you fill hours, auto attendant, night button, and destinations.</p>
          </div>
          <div className="call-flow-legend">
            <span><i className="cf-dot cf-dot-main" /> Entry</span>
            <span><i className="cf-dot cf-dot-branch" /> Decision</span>
            <span><i className="cf-dot cf-dot-leaf" /> Destination</span>
          </div>
        </div>
      )}
      <div className="call-flow-canvas">
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`}
          width="100%"
          style={{ display: 'block', maxHeight: compact ? 260 : 520 }}
          role="img"
          aria-label="Call flow diagram"
        >
          <defs>
            <pattern id="cf-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.08" />
            </pattern>
          </defs>
          <rect width={model.width} height={model.height} fill="url(#cf-grid)" />
          {model.edges.map((edge, i) => (
            <g key={`e-${i}`} className="cf-edge" style={{ animationDelay: `${80 + i * 40}ms` }}>
              <path d={edge.path} fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
              {edge.label && (
                <text x={edge.labelX} y={edge.labelY} className="cf-edge-label">{edge.label}</text>
              )}
            </g>
          ))}
          {model.nodes.map((node, i) => (
            <g
              key={node.id}
              className={`cf-node cf-node-${node.kind}`}
              transform={`translate(${node.x}, ${node.y})`}
              style={{ animationDelay: `${120 + i * 55}ms` }}
            >
              {node.kind === 'branch' ? (
                <polygon
                  points={`${DIAMOND / 2},0 ${DIAMOND},${DIAMOND / 2} ${DIAMOND / 2},${DIAMOND} 0,${DIAMOND / 2}`}
                  className="cf-shape"
                />
              ) : (
                <rect width={NODE_W} height={NODE_H} rx="8" className="cf-shape" />
              )}
              <text
                x={node.kind === 'branch' ? DIAMOND / 2 : NODE_W / 2}
                y={node.kind === 'branch' ? DIAMOND / 2 + 4 : NODE_H / 2 + 4}
                textAnchor="middle"
                className="cf-label"
              >
                {truncate(node.label, node.kind === 'branch' ? 10 : 22)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function buildFlowModel(design = {}) {
  const main = (design.mainNumbers || []).find(n => n.number || n.label)
  const mainLabel = main
    ? (main.number || main.label)
    : (design.numbering?.mainNumbers?.split('\n')[0] || 'Main DID')

  const aaOn = (design.autoAttendant?.enabled || 'Yes') !== 'No'
  const nightOn = (design.nightButton?.enabled || 'No') === 'Yes'
  const hoursLabel = [
    design.hours?.weekdayOpen,
    design.hours?.weekdayClose,
  ].filter(Boolean).join('–') || 'Open hours'

  const options = []
  for (let i = 0; i <= 9; i += 1) {
    const value = String(design.autoAttendant?.[`option${i}`] || '').trim()
    if (value) options.push({ digit: String(i), label: `Press ${i}`, detail: value })
  }

  const nightDest = String(design.nightButton?.destination || design.callFlow?.afterHoursPath || '').trim()
    || (design.voicemail?.needed !== 'No' ? 'After-hours mailbox' : 'Night greeting')

  const nodes = []
  const edges = []

  const layerGapY = 88
  const startY = 28
  const centerX = 420

  const mainId = 'main'
  nodes.push({
    id: mainId,
    kind: 'main',
    label: truncate(mainLabel, 22),
    x: centerX - NODE_W / 2,
    y: startY,
  })

  const hoursId = 'hours'
  nodes.push({
    id: hoursId,
    kind: 'branch',
    label: 'Hours?',
    x: centerX - DIAMOND / 2,
    y: startY + layerGapY,
  })
  edges.push(link(mainId, hoursId, nodes, hoursLabel))

  const dayId = aaOn ? 'aa' : 'day'
  nodes.push({
    id: dayId,
    kind: aaOn ? 'main' : 'leaf',
    label: aaOn ? 'Auto attendant' : (design.callFlow?.daytimePath || 'Day path'),
    x: centerX - 210 - NODE_W / 2,
    y: startY + layerGapY * 2,
  })
  edges.push(link(hoursId, dayId, nodes, 'Open'))

  const nightId = 'night'
  nodes.push({
    id: nightId,
    kind: 'leaf',
    label: truncate(nightDest, 22),
    x: centerX + 210 - NODE_W / 2,
    y: startY + layerGapY * 2,
  })
  edges.push(link(hoursId, nightId, nodes, nightOn ? 'Closed / Night' : 'Closed'))

  let optionLayerY = startY + layerGapY * 3
  if (aaOn && options.length) {
    const span = Math.min(options.length, 6)
    const shown = options.slice(0, 6)
    const gap = 168
    const totalW = (span - 1) * gap
    const left = centerX - 210 - totalW / 2
    shown.forEach((opt, idx) => {
      const id = `opt-${opt.digit}`
      nodes.push({
        id,
        kind: 'leaf',
        label: truncate(`${opt.label}: ${opt.detail}`, 22),
        x: left + idx * gap - NODE_W / 2,
        y: optionLayerY,
      })
      edges.push(link(dayId, id, nodes, opt.digit))
    })
    if (options.length > 6) {
      nodes.push({
        id: 'opt-more',
        kind: 'leaf',
        label: `+${options.length - 6} more`,
        x: left + span * gap - NODE_W / 2,
        y: optionLayerY,
      })
      edges.push(link(dayId, 'opt-more', nodes, '…'))
    }
  } else if (aaOn) {
    const timeout = String(design.autoAttendant?.timeoutAction || '').trim() || 'Menu options'
    nodes.push({
      id: 'aa-empty',
      kind: 'leaf',
      label: truncate(timeout, 22),
      x: centerX - 210 - NODE_W / 2,
      y: optionLayerY,
    })
    edges.push(link(dayId, 'aa-empty', nodes, 'Menu'))
  }

  if (design.voicemail?.needed !== 'No' && design.voicemail?.generalMailbox) {
    const vmY = optionLayerY + layerGapY
    nodes.push({
      id: 'vm',
      kind: 'leaf',
      label: truncate(design.voicemail.generalMailbox, 22),
      x: centerX + 210 - NODE_W / 2,
      y: vmY,
    })
    edges.push(link(nightId, 'vm', nodes, 'VM'))
    optionLayerY = vmY
  }

  const maxX = Math.max(...nodes.map(n => n.x + (n.kind === 'branch' ? DIAMOND : NODE_W)), 700)
  const maxY = Math.max(...nodes.map(n => n.y + (n.kind === 'branch' ? DIAMOND : NODE_H)), 240) + 36

  return { nodes, edges, width: Math.max(840, maxX + 40), height: maxY }
}

function nodeCenter(node) {
  if (node.kind === 'branch') {
    return { x: node.x + DIAMOND / 2, y: node.y + DIAMOND / 2 }
  }
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 }
}

function link(fromId, toId, nodes, label) {
  const from = nodes.find(n => n.id === fromId)
  const to = nodes.find(n => n.id === toId)
  const a = nodeCenter(from)
  const b = nodeCenter(to)
  const midY = (a.y + b.y) / 2
  const path = `M ${a.x} ${a.y + (from.kind === 'branch' ? DIAMOND / 2 - 4 : NODE_H / 2 - 4)} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - (to.kind === 'branch' ? DIAMOND / 2 : NODE_H / 2)}`
  return {
    path,
    label,
    labelX: (a.x + b.x) / 2,
    labelY: midY - 4,
  }
}

function truncate(value, max) {
  const text = String(value || '').trim() || '—'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
