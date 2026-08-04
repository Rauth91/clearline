import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { DUR, SNAP, prefersReducedMotion } from '../lib/motion.js'

/**
 * One accent for the whole dock.
 *
 * This used to be five colours — lime, violet, yellow, cyan, rose — one per
 * tab. That made the dock change identity on every navigation and put a
 * chartreuse bead on top of a violet-and-cyan app. Tab identity isn't state,
 * so it doesn't get to own a colour.
 *
 * To go back to per-tab colours, give a tab its own `color` again; the
 * renderer still honours it.
 */
const DOCK_ACCENT = '#22d3ee'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'job', label: 'Job' },
  { id: 'tools', label: 'Tools' },
  { id: 'settings', label: 'Settings' },
]

const PAD = 40
const R = 27
const BAR = 56
const H = 92
const CORNER = 28

/**
 * Melting skin path — top edge rises into a circular socket around the bead.
 * Geometry matches the _code_and_chill_ melting dock (shoulders + meniscus).
 */
function buildSkinPath(W, cx) {
  const top = H - BAR
  const cy = top
  const cr = CORNER

  // Trailing shoulders — how far the melt spreads.
  // 2.05 read as a notch punched in the bar. Surface tension needs a long,
  // shallow lift; the reference sits around 3.4.
  const shoulder = R * 3.4
  const left = Math.max(cr + 4, cx - shoulder)
  const right = Math.min(W - cr - 4, cx + shoulder)

  // Socket attach points on the circle (slightly below equator so melt looks seated)
  const attachY = cy + R * 0.18
  const attachDx = Math.sqrt(Math.max(0, R * R - (attachY - cy) ** 2))
  const socketL = cx - attachDx
  const socketR = cx + attachDx

  // Power-blend shoulder controls (reference uses sqrt / power)
  const spanL = Math.max(8, socketL - left)
  const spanR = Math.max(8, right - socketR)
  const k = 0.42

  return [
    `M ${cr} ${H}`,
    `H ${W - cr}`,
    `Q ${W} ${H} ${W} ${H - cr}`,
    `V ${top + cr}`,
    `Q ${W} ${top} ${W - cr} ${top}`,
    `H ${right}`,
    // Right shoulder → socket (smooth lift)
    `C ${right - spanR * k} ${top} ${socketR + spanR * 0.08} ${top} ${socketR} ${attachY}`,
    // Arc over the TOP of the bead (CCW from right → left through north)
    `A ${R} ${R} 0 1 0 ${socketL} ${attachY}`,
    // Left socket → shoulder settle
    `C ${socketL - spanL * 0.08} ${top} ${left + spanL * k} ${top} ${left} ${top}`,
    `H ${cr}`,
    `Q 0 ${top} 0 ${top + cr}`,
    `V ${H - cr}`,
    `Q 0 ${H} ${cr} ${H}`,
    'Z',
  ].join(' ')
}

function Icon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
        </svg>
      )
    case 'accounts':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
        </svg>
      )
    case 'job':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" />
        </svg>
      )
    case 'tools':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4.5 4.5 0 0 0-6.2 6.2L3 18l3 3 5.5-5.5a4.5 4.5 0 0 0 6.2-6.2L15 11l-1.3-1.3 2.5-2.5z" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )
    default:
      return null
  }
}

export default function FluidDock({ activeId, onSelect, onWarm }) {
  const frameRef = useRef(null)
  const trackRef = useRef(null)
  const uid = useId().replace(/:/g, '')

  const [beadPx, setBeadPx] = useState(0)
  const [frameW, setFrameW] = useState(400)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const dragRef = useRef(false)
  const hoverRef = useRef(false)
  const reduceMotion = prefersReducedMotion()
  const warmedRef = useRef(new Set())

  const warmAround = useCallback((index) => {
    if (typeof onWarm !== 'function') return
    for (const j of [index - 1, index, index + 1]) {
      const tab = TABS[j]
      if (!tab || warmedRef.current.has(tab.id)) continue
      warmedRef.current.add(tab.id)
      onWarm(tab.id)
    }
  }, [onWarm])

  const indexOf = useCallback((id) => {
    const i = TABS.findIndex(t => t.id === id)
    return i < 0 ? 0 : i
  }, [])

  const positionForIndex = useCallback((index) => {
    const frame = frameRef.current
    const track = trackRef.current
    if (!frame || !track) return frameW / 2
    const buttons = track.querySelectorAll('[role="tab"]')
    const btn = buttons[index]
    if (!btn) return frameW / 2
    const fr = frame.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    return br.left - fr.left + br.width / 2
  }, [frameW])

  const clampBead = useCallback((clientX) => {
    const frame = frameRef.current
    if (!frame) return beadPx
    const rect = frame.getBoundingClientRect()
    return Math.min(Math.max(clientX - rect.left, PAD), rect.width - PAD)
  }, [beadPx])

  const nearestIndex = useCallback((clientX) => {
    const track = trackRef.current
    if (!track) return 0
    const buttons = [...track.querySelectorAll('[role="tab"]')]
    let best = 0
    let bestDist = Infinity
    buttons.forEach((btn, i) => {
      const r = btn.getBoundingClientRect()
      const mid = r.left + r.width / 2
      const d = Math.abs(clientX - mid)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }, [])

  const snapToActive = useCallback(() => {
    const frame = frameRef.current
    if (frame) setFrameW(frame.getBoundingClientRect().width || 400)
    setBeadPx(positionForIndex(indexOf(activeId)))
    setHoverIndex(null)
  }, [activeId, indexOf, positionForIndex])

  useLayoutEffect(() => {
    if (hoverRef.current || dragRef.current) return
    snapToActive()
  }, [snapToActive])

  useEffect(() => {
    const onResize = () => {
      if (!hoverRef.current && !dragRef.current) snapToActive()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [snapToActive])

  function followPointer(clientX) {
    setBeadPx(clampBead(clientX))
    const i = nearestIndex(clientX)
    setHoverIndex(i)
    if (dragRef.current) warmAround(i)
  }

  function onFrameEnter(e) {
    hoverRef.current = true
    setHovering(true)
    followPointer(e.clientX)
  }

  function onFrameMove(e) {
    if (!hoverRef.current && !dragRef.current) return
    followPointer(e.clientX)
  }

  function onFrameLeave() {
    if (dragRef.current) return
    hoverRef.current = false
    setHovering(false)
    snapToActive()
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    const tabBtn = e.target.closest?.('[role="tab"]')
    if (tabBtn) {
      const buttons = [...(trackRef.current?.querySelectorAll('[role="tab"]') || [])]
      warmAround(buttons.indexOf(tabBtn))
      return
    }
    e.preventDefault()
    dragRef.current = true
    hoverRef.current = true
    setDragging(true)
    setHovering(true)
    frameRef.current?.setPointerCapture?.(e.pointerId)
    followPointer(e.clientX)
    warmAround(nearestIndex(e.clientX))
  }

  function onPointerUp(e) {
    if (!dragRef.current) {
      if (e.target.closest?.('[role="tab"]')) return
      onSelect?.(TABS[nearestIndex(e.clientX)].id)
      return
    }
    dragRef.current = false
    setDragging(false)
    const i = nearestIndex(e.clientX)
    onSelect?.(TABS[i].id)
    if (!hoverRef.current) {
      setBeadPx(positionForIndex(i))
      setHoverIndex(null)
    }
  }

  function onKeyDown(e) {
    const i = indexOf(activeId)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      onSelect?.(TABS[Math.min(i + 1, TABS.length - 1)].id)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      onSelect?.(TABS[Math.max(i - 1, 0)].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onSelect?.(TABS[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      onSelect?.(TABS[TABS.length - 1].id)
    }
  }

  const colorIndex = hoverIndex != null ? hoverIndex : indexOf(activeId)
  const accent = TABS[colorIndex]?.color || DOCK_ACCENT
  const cx = beadPx || frameW / 2
  const cy = H - BAR
  const W = Math.max(frameW, 300)
  const skin = buildSkinPath(W, cx)
  const live = hovering || dragging || reduceMotion
  const moveEase = live ? 'none' : `${DUR.glide}ms ${SNAP}`

  return (
    <nav className="fluid-dock" aria-label="Primary">
      <div
        className={`fluid-dock-frame${hovering ? ' is-hover' : ''}${dragging ? ' is-drag' : ''}`}
        ref={frameRef}
        style={{ '--acc': accent }}
        onPointerEnter={onFrameEnter}
        onPointerMove={onFrameMove}
        onPointerLeave={onFrameLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = false
          hoverRef.current = false
          setDragging(false)
          setHovering(false)
          snapToActive()
        }}
      >
        <svg
          className="fluid-dock-svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.11)" />
              <stop offset="40%" stopColor="rgba(24,20,44,0.96)" />
              <stop offset="100%" stopColor="rgba(8,6,16,0.98)" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`${uid}-clip`}>
              <path d={skin} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${uid}-clip)`}>
            <ellipse
              cx={cx}
              cy={cy + 10}
              rx={R * 3.1}
              ry={R * 0.9}
              fill={accent}
              opacity={0.14}
              style={{ transition: live ? 'none' : `cx ${moveEase}` }}
            />
          </g>

          <path
            className="fluid-dock-skin"
            d={skin}
            fill={`url(#${uid}-plate)`}
            stroke={accent}
            strokeOpacity="0.28"
            strokeWidth="1.4"
          />

          <circle
            cx={cx}
            cy={cy}
            r={R - 2.5}
            fill="rgba(10,8,20,0.95)"
            stroke={accent}
            strokeWidth="2.25"
            filter={`url(#${uid}-glow)`}
            style={{ transition: live ? 'none' : `cx ${moveEase}` }}
          />
        </svg>

        <div
          className="fluid-dock-track"
          ref={trackRef}
          role="tablist"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
        >
          {TABS.map((tab, i) => {
            const hot = hoverIndex === i || (hoverIndex == null && activeId === tab.id)
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeId === tab.id}
                tabIndex={activeId === tab.id ? 0 : -1}
                className={`fluid-dock-tab${activeId === tab.id ? ' is-active' : ''}${hot ? ' is-hot' : ''}`}
                style={{ '--tab-accent': tab.color || DOCK_ACCENT }}
                onClick={() => onSelect?.(tab.id)}
                onPointerDown={() => warmAround(i)}
              >
                <span
                  className="fluid-dock-icon"
                  style={hot ? { color: accent } : undefined}
                >
                  <Icon name={tab.id} />
                </span>
                <span className="fluid-dock-tab-label">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export { TABS as FLUID_DOCK_TABS, DOCK_ACCENT }
