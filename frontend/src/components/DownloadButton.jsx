import { useEffect, useId, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'
import '../styles/feel.css'

function toBlob(data) {
  if (data instanceof Blob) return data
  if (data instanceof ArrayBuffer) return new Blob([data])
  if (typeof data === 'string') return new Blob([data], { type: 'text/plain;charset=utf-8' })
  return new Blob([data])
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function fetchWithProgress(url, { onProgress, signal } = {}) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)

  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !total || !res.body.getReader) {
    const buf = await res.arrayBuffer()
    onProgress?.(1)
    return new Blob([buf])
  }

  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onProgress?.(Math.min(0.99, received / total))
  }
  onProgress?.(1)
  return new Blob(chunks)
}

/**
 * Paradrop download button — paced progress ring + auto browser download.
 */
export default function DownloadButton({
  filename,
  label = 'Download',
  run,
  url,
  minMs = 900,
  className = '',
  disabled = false,
  onDone,
  onError,
}) {
  const rid = useId()
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [shown, setShown] = useState(0)
  const actualRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const abortRef = useRef(null)
  const resetTimer = useRef(0)
  const reduce = prefersReducedMotion()

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resetTimer.current) clearTimeout(resetTimer.current)
      abortRef.current?.abort?.()
    }
  }, [])

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }

  const startLoop = () => {
    stopLoop()
    startRef.current = performance.now()
    actualRef.current = 0
    setShown(0)

    const tick = (now) => {
      const elapsed = now - startRef.current
      const floor = Math.min(1, elapsed / Math.max(1, minMs))
      const next = Math.min(actualRef.current, floor)
      setShown(next)
      if (next < 1 || actualRef.current < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = 0
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const setActual = (p) => {
    actualRef.current = Math.max(0, Math.min(1, Number(p) || 0))
  }

  const finishVisual = () =>
    new Promise((resolve) => {
      actualRef.current = 1
      const wait = () => {
        const elapsed = performance.now() - startRef.current
        const floor = Math.min(1, elapsed / Math.max(1, minMs))
        const next = Math.min(1, floor)
        setShown(next)
        if (next >= 1 && elapsed >= minMs) {
          stopLoop()
          setShown(1)
          resolve()
          return
        }
        rafRef.current = requestAnimationFrame(wait)
      }
      stopLoop()
      rafRef.current = requestAnimationFrame(wait)
    })

  const resetSoon = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setPhase('idle')
      setShown(0)
      actualRef.current = 0
    }, 1100)
  }

  const cancel = () => {
    abortRef.current?.abort?.()
    abortRef.current = null
    stopLoop()
    setPhase('idle')
    setShown(0)
    actualRef.current = 0
  }

  const start = async () => {
    if (disabled || phase === 'running') return
    if (!run && !url) return

    if (resetTimer.current) clearTimeout(resetTimer.current)
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('running')
    startLoop()

    try {
      let payload
      if (typeof run === 'function') {
        payload = await run({
          onProgress: (p) => {
            if (ac.signal.aborted) return
            setActual(p)
          },
          signal: ac.signal,
        })
      } else {
        payload = await fetchWithProgress(url, {
          onProgress: (p) => {
            if (ac.signal.aborted) return
            setActual(p)
          },
          signal: ac.signal,
        })
      }

      if (ac.signal.aborted) return

      await finishVisual()
      const blob = toBlob(payload)
      triggerDownload(blob, filename)
      setPhase('done')
      onDone?.(blob)
      resetSoon()
    } catch (err) {
      if (ac.signal.aborted || err?.name === 'AbortError') {
        setPhase('idle')
        setShown(0)
        return
      }
      stopLoop()
      setPhase('idle')
      setShown(0)
      onError?.(err)
    } finally {
      abortRef.current = null
    }
  }

  const pct = Math.round(shown * 100)
  const dashOffset = 1 - shown

  return (
    <div className={`dl ${className}`.trim()}>
      <button
        type="button"
        className={`dl-btn ${phase === 'running' ? 'is-running' : ''} ${phase === 'done' ? 'is-done' : ''}`}
        disabled={disabled || phase === 'running'}
        onClick={start}
        aria-describedby={phase !== 'idle' ? `${rid}-status` : undefined}
      >
        {phase === 'idle' && (
          <span className="dl-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {label}
          </span>
        )}

        {phase === 'running' && (
          <>
            {!reduce && (
              <span className="dl-rig" aria-hidden>
                <svg viewBox="0 0 36 36">
                  <circle className="dl-ring" cx="18" cy="18" r="14" />
                  <circle
                    className="dl-ring-prog"
                    cx="18"
                    cy="18"
                    r="14"
                    pathLength="1"
                    strokeDasharray="1"
                    strokeDashoffset={dashOffset}
                  />
                  {/* parachute canopy + arrow */}
                  <g className="dl-chute" transform="translate(0,1)">
                    <path d="M11 13c0-4 3.1-7 7-7s7 3 7 7c-2.2-1.2-4.5-1.8-7-1.8S13.2 11.8 11 13z" />
                    <path d="M13.5 13.2L18 20.5l4.5-7.3" />
                    <path d="M18 20.5v4" />
                    <path d="M15.5 22.5h5" />
                  </g>
                </svg>
              </span>
            )}
            {reduce ? (
              <span className="dl-simple" id={`${rid}-status`}>
                {label}… {pct}%
              </span>
            ) : (
              <span className="dl-pct" id={`${rid}-status`}>
                {pct}%
              </span>
            )}
          </>
        )}

        {phase === 'done' && (
          <span className="dl-label" id={`${rid}-status`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Saved
          </span>
        )}
      </button>

      {phase === 'running' && (
        <button type="button" className="dl-cancel" onClick={cancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
