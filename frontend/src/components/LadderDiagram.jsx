/**
 * LadderDiagram — theme-aware SVG SIP sequence ladder
 */

import { useState } from 'react'

const SEVERITY_COLORS = {
  error: '#b42318',
  warning: '#9a6700',
  info: '#175cd3',
}

const METHOD_COLORS = {
  INVITE: '#0b6e6a',
  BYE: '#9f1239',
  CANCEL: '#c2410c',
  ACK: '#1f7a4c',
  OPTIONS: '#64748b',
  REGISTER: '#4338ca',
  PRACK: '#0e7490',
  UPDATE: '#0f766e',
  NOTIFY: '#6d28d9',
  default: '#475569',
}

const RESPONSE_COLORS = {
  1: '#64748b',
  2: '#1f7a4c',
  3: '#9a6700',
  4: '#b42318',
  5: '#b42318',
  6: '#b42318',
}

function getMessageColor(msg) {
  if (msg.is_request) {
    return METHOD_COLORS[msg.method] || METHOD_COLORS.default
  }
  const bucket = Math.floor(msg.response_code / 100)
  return RESPONSE_COLORS[bucket] || '#475569'
}

export default function LadderDiagram({ messages, endpoints, anomalies, onMessageClick }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(null)

  if (!messages || messages.length === 0) return null

  const COL_WIDTH = 180
  const ROW_HEIGHT = 52
  const LEFT_MARGIN = 90
  const TOP_MARGIN = 60
  const ENDPOINT_COLS = endpoints.length
  const SVG_WIDTH = LEFT_MARGIN + ENDPOINT_COLS * COL_WIDTH + 20
  const SVG_HEIGHT = TOP_MARGIN + messages.length * ROW_HEIGHT + 40

  const epIndex = {}
  endpoints.forEach((ep, i) => { epIndex[ep] = i })

  const anomalyByIdx = {}
  anomalies.forEach(a => {
    if (!anomalyByIdx[a.message_index]) anomalyByIdx[a.message_index] = []
    anomalyByIdx[a.message_index].push(a)
  })

  function colX(colIdx) {
    return LEFT_MARGIN + colIdx * COL_WIDTH + COL_WIDTH / 2
  }

  function rowY(rowIdx) {
    return TOP_MARGIN + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2
  }

  function getArrowCols(msg) {
    let srcCol, dstCol
    const srcIdx = msg.src_ip ? epIndex[msg.src_ip] : undefined
    const dstIdx = msg.dst_ip ? epIndex[msg.dst_ip] : undefined

    if (srcIdx !== undefined && dstIdx !== undefined) {
      srcCol = srcIdx
      dstCol = dstIdx
    } else if (msg.direction === 'sent') {
      srcCol = 0
      dstCol = Math.min(1, ENDPOINT_COLS - 1)
    } else if (msg.direction === 'received') {
      srcCol = Math.min(1, ENDPOINT_COLS - 1)
      dstCol = 0
    } else {
      srcCol = msg.is_request ? 0 : Math.min(1, ENDPOINT_COLS - 1)
      dstCol = msg.is_request ? Math.min(1, ENDPOINT_COLS - 1) : 0
    }

    return { srcCol, dstCol }
  }

  const handleClick = (msg) => {
    setSelectedIndex(msg.index)
    if (onMessageClick) onMessageClick(msg)
  }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', background: 'var(--bg1)' }}>
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        style={{ display: 'block', minWidth: SVG_WIDTH }}
      >
        <defs>
          {Object.values({ ...METHOD_COLORS, ...Object.fromEntries(
            Object.entries(RESPONSE_COLORS).map(([k, v]) => [`r${k}`, v])
          ) }).filter((v, i, a) => a.indexOf(v) === i).map(color => (
            <marker
              key={`arrow-${color}`}
              id={`arrow-${color.replace('#', '')}`}
              markerWidth="8" markerHeight="8"
              refX="7" refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={color} />
            </marker>
          ))}
        </defs>

        <rect x={0} y={0} width={SVG_WIDTH} height={TOP_MARGIN} fill="var(--bg2)" />

        {endpoints.map((ep, i) => {
          const x = colX(i)
          return (
            <g key={ep}>
              <rect
                x={x - COL_WIDTH / 2 + 4}
                y={8}
                width={COL_WIDTH - 8}
                height={36}
                rx={6}
                fill="var(--bg1)"
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={x}
                y={22}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={9}
                fontFamily="IBM Plex Mono, monospace"
              >
                {ep.length > 20 ? ep.slice(0, 18) + '…' : ep}
              </text>
              <text
                x={x}
                y={36}
                textAnchor="middle"
                fill="var(--ink)"
                fontSize={11}
                fontWeight="600"
                fontFamily="Outfit, sans-serif"
              >
                {ep.includes('.') || ep.includes(':')
                  ? (i === 0 ? 'UA' : i === 1 ? 'Peer' : `Node ${i + 1}`)
                  : ep}
              </text>

              <line
                x1={x} y1={TOP_MARGIN}
                x2={x} y2={SVG_HEIGHT - 20}
                stroke="var(--line)"
                strokeWidth={1.5}
                strokeDasharray="5,5"
              />
            </g>
          )
        })}

        {messages.map((msg, rowIdx) => {
          const y = rowY(rowIdx)
          const color = getMessageColor(msg)
          const { srcCol, dstCol } = getArrowCols(msg)
          const x1 = colX(srcCol)
          const x2 = colX(dstCol)
          const isSelf = srcCol === dstCol
          const isSelected = selectedIndex === msg.index
          const isHovered = hoveredIndex === msg.index
          const msgAnomalies = anomalyByIdx[msg.index] || []
          const worstSeverity = msgAnomalies.find(a => a.severity === 'error')
            ? 'error'
            : msgAnomalies.find(a => a.severity === 'warning')
            ? 'warning'
            : null

          return (
            <g
              key={msg.index}
              style={{ cursor: 'pointer' }}
              onClick={() => handleClick(msg)}
              onMouseEnter={() => setHoveredIndex(msg.index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {(isSelected || isHovered) && (
                <rect
                  x={0} y={y - ROW_HEIGHT / 2}
                  width={SVG_WIDTH} height={ROW_HEIGHT}
                  fill={isSelected ? 'var(--accent-soft)' : 'var(--bg2)'}
                />
              )}

              {worstSeverity && (
                <rect
                  x={0} y={y - ROW_HEIGHT / 2}
                  width={3} height={ROW_HEIGHT}
                  fill={SEVERITY_COLORS[worstSeverity]}
                />
              )}

              <text
                x={LEFT_MARGIN - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={9}
                fontFamily="IBM Plex Mono, monospace"
              >
                {msg.timestamp
                  ? msg.timestamp.split('T').pop()?.split('.')[0] || msg.timestamp.slice(-8)
                  : `#${rowIdx + 1}`}
              </text>

              {isSelf ? (
                <path
                  d={`M${x1} ${y - 10} Q${x1 + 40} ${y - 10} ${x1 + 40} ${y} Q${x1 + 40} ${y + 10} ${x1} ${y + 10}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.75}
                  markerEnd={`url(#arrow-${color.replace('#', '')})`}
                />
              ) : (
                <line
                  x1={x1 + (x2 > x1 ? 8 : -8)}
                  y1={y}
                  x2={x2 + (x2 > x1 ? -12 : 12)}
                  y2={y}
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.75}
                  markerEnd={`url(#arrow-${color.replace('#', '')})`}
                />
              )}

              {(() => {
                const midX = isSelf ? x1 + 45 : (x1 + x2) / 2
                return (
                  <>
                    <rect
                      x={midX - 42}
                      y={y - 11}
                      width={84}
                      height={16}
                      rx={3}
                      fill="var(--bg1)"
                      stroke="var(--line)"
                      strokeWidth={1}
                    />
                    <text
                      x={midX}
                      y={y + 2}
                      textAnchor="middle"
                      fill={color}
                      fontSize={11}
                      fontWeight="600"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {msg.label.length > 14 ? msg.label.slice(0, 13) + '…' : msg.label}
                    </text>
                  </>
                )
              })()}

              {worstSeverity && (
                <circle
                  cx={SVG_WIDTH - 18}
                  cy={y}
                  r={4}
                  fill={SEVERITY_COLORS[worstSeverity]}
                />
              )}

              {msg.cseq && !worstSeverity && (
                <text
                  x={SVG_WIDTH - 14}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize={9}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {msg.cseq.slice(0, 12)}
                </text>
              )}
            </g>
          )
        })}

        {endpoints.map((ep, i) => (
          <circle
            key={`cap-${i}`}
            cx={colX(i)}
            cy={SVG_HEIGHT - 22}
            r={4}
            fill="var(--bg1)"
            stroke="var(--line-strong)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </div>
  )
}
