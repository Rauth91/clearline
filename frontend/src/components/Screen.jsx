import {
  Children,
  Suspense,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

const FLOOR_MS = 200
const CEILING_MS = 600

/** Fires once when its Suspense parent has resolved. */
function ReadyProbe({ onReady }) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return null
}

function withStagger(node) {
  return Children.toArray(node).map((child, i) => {
    if (!isValidElement(child)) {
      return (
        <div key={i} style={{ '--i': i }}>
          {child}
        </div>
      )
    }
    const prev = child.props?.style
    return cloneElement(child, {
      key: child.key ?? i,
      style: { ...(typeof prev === 'object' && prev ? prev : {}), '--i': i },
    })
  })
}

/**
 * Route screen transition.
 * Exit: opacity 1→0, translateY 0→-8px, 200ms SNAP.
 * Enter: children translateY 14→0 + opacity 0→1, 520ms SETTLE, 55ms stagger via --i.
 * Holds outgoing until incoming resolves (200ms floor, 600ms ceiling → fallback).
 */
export default function Screen({
  screenKey,
  children,
  fallback = <div className="workspace-loading">Loading…</div>,
}) {
  const reduce = prefersReducedMotion()
  const [view, setView] = useState(() => ({ key: screenKey, body: children }))
  const [phase, setPhase] = useState(() => (reduce ? 'idle' : 'enter'))
  const [fallbackVisible, setFallbackVisible] = useState(false)
  const [warm, setWarm] = useState(null) // { key, body } while loading next
  const readyRef = useRef(true)
  const startedAt = useRef(0)
  const timersRef = useRef([])
  const rootRef = useRef(null)
  const warmRef = useRef(null)

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const commit = useCallback((next) => {
    clearTimers()
    warmRef.current = null
    readyRef.current = true
    setWarm(null)
    setFallbackVisible(false)
    setView(next)
    setPhase(reduce ? 'idle' : 'enter')
  }, [reduce])

  const tryAdvance = useCallback(() => {
    const pending = warmRef.current
    if (!pending) return
    const elapsed = Date.now() - startedAt.current

    if (readyRef.current && elapsed >= FLOOR_MS) {
      commit(pending)
      return
    }

    if (!readyRef.current && elapsed >= CEILING_MS) {
      setFallbackVisible(true)
      setPhase('idle')
    }
  }, [commit])

  const markReady = useCallback(() => {
    readyRef.current = true
    tryAdvance()
  }, [tryAdvance])

  useEffect(() => {
    if (screenKey === view.key && !warmRef.current) {
      setView({ key: screenKey, body: children })
      return undefined
    }
    if (screenKey === view.key) return undefined

    if (reduce) {
      commit({ key: screenKey, body: children })
      return undefined
    }

    clearTimers()
    const next = { key: screenKey, body: children }
    warmRef.current = next
    readyRef.current = false
    startedAt.current = Date.now()
    setWarm(next)
    setFallbackVisible(false)
    setPhase('exit')

    timersRef.current.push(setTimeout(tryAdvance, FLOOR_MS))
    timersRef.current.push(setTimeout(tryAdvance, CEILING_MS))

    return clearTimers
  }, [screenKey, children, view.key, reduce, commit, tryAdvance])

  useLayoutEffect(() => {
    if (phase !== 'enter' || reduce) return undefined
    const root = rootRef.current
    if (root) {
      ;[...root.children].forEach((el, i) => {
        el.style.setProperty('--i', String(i))
      })
    }
    const t = setTimeout(() => setPhase('idle'), 520 + 55 * 12)
    return () => clearTimeout(t)
  }, [phase, view.key, reduce])

  return (
    <div className="screen-root">
      {fallbackVisible ? (
        <div className="screen-fallback" role="status">{fallback}</div>
      ) : (
        <div
          ref={rootRef}
          className={`screen${phase === 'exit' ? ' is-exit' : ''}${phase === 'enter' ? ' is-enter' : ''}`}
          data-screen-key={view.key}
        >
          <Suspense fallback={phase === 'exit' ? null : fallback}>
            {withStagger(view.body)}
          </Suspense>
        </div>
      )}

      {warm && (
        <div className="screen-warm" aria-hidden="true">
          <Suspense fallback={null}>
            {warm.body}
            <ReadyProbe onReady={markReady} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
