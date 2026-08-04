import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DUR, prefersReducedMotion, springOpts } from '../lib/motion.js'
import '../styles/feel.css'

function BinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Crumple-and-toss delete. Call crumple(el, onDone) — onDone fires immediately;
 * a floating clone carries the animation into the bin.
 */
export function useCrumpleDelete() {
  const [open, setOpen] = useState(false)
  const [catching, setCatching] = useState(false)
  const flightRef = useRef(0)
  const binRef = useRef(null)
  const closeTimer = useRef(0)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const bumpBin = useCallback(() => {
    setOpen(true)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setCatching(false)
    }, 900)
  }, [])

  const crumple = useCallback(
    (sourceEl, onDone) => {
      const done = typeof onDone === 'function' ? onDone : () => {}

      if (!sourceEl || prefersReducedMotion()) {
        done()
        return
      }

      const rect = sourceEl.getBoundingClientRect()

      // Clone BEFORE onDone — React may unmount the source immediately after.
      let clone
      try {
        clone = sourceEl.cloneNode(true)
        clone.classList.add('crumple-clone')
        clone.setAttribute('aria-hidden', 'true')
        clone.style.margin = '0'
        clone.style.position = 'fixed'
        clone.style.left = `${rect.left}px`
        clone.style.top = `${rect.top}px`
        clone.style.width = `${rect.width}px`
        clone.style.height = `${rect.height}px`
        clone.style.zIndex = '9390'
        clone.style.pointerEvents = 'none'
        clone.style.transformOrigin = 'center center'
      } catch {
        clone = document.createElement('div')
        clone.className = 'crumple-clone is-proxy'
        clone.setAttribute('aria-hidden', 'true')
        clone.style.position = 'fixed'
        clone.style.left = `${rect.left + rect.width / 2 - 18}px`
        clone.style.top = `${rect.top + rect.height / 2 - 18}px`
        clone.style.zIndex = '9390'
        clone.style.pointerEvents = 'none'
      }

      const prevVisibility = sourceEl.style.visibility
      sourceEl.style.visibility = 'hidden'
      document.body.appendChild(clone)

      // onDone IMMEDIATELY — floating clone carries the animation
      done()
      bumpBin()

      requestAnimationFrame(() => {
        try {
          if (sourceEl.isConnected) sourceEl.style.visibility = prevVisibility
        } catch { /* detached */ }
      })

      let tossed = false
      const toss = () => {
        if (tossed || !clone.isConnected) return
        tossed = true

        const bin = binRef.current
        const binBox = bin?.getBoundingClientRect()
        const originX = rect.left + rect.width / 2
        const originY = rect.top + rect.height / 2
        const targetX = binBox
          ? binBox.left + binBox.width / 2 - originX
          : window.innerWidth - 56 - originX
        const targetY = binBox
          ? binBox.top + binBox.height / 2 - originY
          : window.innerHeight - 128 - originY

        const midX = targetX * 0.45
        const midY = Math.min(targetY * 0.4, -56)

        flightRef.current += 1
        setCatching(false)

        const flight = clone.animate(
          [
            {
              transform: 'translate(0, 0) scale(0.28) rotate(-28deg)',
              opacity: 0.9,
              offset: 0,
            },
            {
              transform: `translate(${midX}px, ${midY}px) scale(0.22) rotate(12deg)`,
              opacity: 0.85,
              offset: 0.45,
            },
            {
              transform: `translate(${targetX}px, ${targetY}px) scale(0.08) rotate(40deg)`,
              opacity: 0.15,
              offset: 1,
            },
          ],
          springOpts(DUR.spring + 80, { fill: 'forwards' }),
        )

        flight.onfinish = () => {
          setCatching(true)
          clone.remove()
          flightRef.current = Math.max(0, flightRef.current - 1)
          setTimeout(() => setCatching(false), 220)
        }
      }

      const crumpleAnim = clone.animate(
        [
          { transform: 'scale(1) rotate(0deg)', filter: 'blur(0px)', opacity: 1 },
          { transform: 'scale(0.55) rotate(18deg)', filter: 'blur(0.4px)', opacity: 0.95, offset: 0.55 },
          { transform: 'scale(0.28) rotate(-28deg)', filter: 'blur(1px)', opacity: 0.9 },
        ],
        springOpts(DUR.settle, { fill: 'forwards' }),
      )

      crumpleAnim.onfinish = toss
      // Fallback if onfinish is skipped
      setTimeout(toss, DUR.settle + 40)
    },
    [bumpBin],
  )

  const bin = typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={binRef}
        className={`crumple-bin ${open ? 'is-open' : ''} ${catching ? 'is-catch' : ''}`}
        aria-hidden
      >
        <BinIcon />
      </div>,
      document.body,
    )
    : null

  return { crumple, bin }
}

/**
 * Optional thin helper — pass `crumple` from useCrumpleDelete (and render {bin} once).
 */
export function CrumpleDeleteButton({
  label = 'Delete',
  onDelete,
  className = '',
  disabled = false,
  crumple,
}) {
  const ref = useRef(null)

  return (
    <button
      ref={ref}
      type="button"
      className={`crumple-btn ${className}`.trim()}
      disabled={disabled}
      onClick={() => {
        if (typeof crumple === 'function') {
          crumple(ref.current, () => onDelete?.())
        } else {
          onDelete?.()
        }
      }}
    >
      {label}
    </button>
  )
}

export default useCrumpleDelete
