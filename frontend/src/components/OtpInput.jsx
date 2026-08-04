import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { DUR, prefersReducedMotion, springOpts } from '../lib/motion.js'
import '../styles/feel.css'

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

/**
 * Sigil OTP — single hidden input driving visual slots with spark border
 * and a gliding ring cursor.
 */
export default function OtpInput({
  length = 6,
  title,
  hint,
  onComplete,
  disabled = false,
  autoFocus = true,
}) {
  const rid = useId()
  const inputRef = useRef(null)
  const slotsRef = useRef(null)
  const cursorRef = useRef(null)
  const completingRef = useRef(false)

  const [value, setValue] = useState('')
  const [active, setActive] = useState(0)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const chars = Array.from({ length }, (_, i) => value[i] || '')
  const reduce = prefersReducedMotion()

  useEffect(() => {
    if (autoFocus && !disabled) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [autoFocus, disabled])

  const moveCursor = (index) => {
    const cursor = cursorRef.current
    const slots = slotsRef.current
    if (!cursor || !slots) return
    const slotEls = slots.querySelectorAll('.otp-slot')
    const slot = slotEls[Math.min(index, length - 1)]
    if (!slot) return
    const root = slots.getBoundingClientRect()
    const box = slot.getBoundingClientRect()
    const x = box.left - root.left
    const y = box.top - root.top

    if (reduce) {
      cursor.style.transition = 'none'
      cursor.style.transform = `translate(${x}px, ${y}px)`
      return
    }

    cursor.style.transform = `translate(${x}px, ${y}px)`
  }

  useLayoutEffect(() => {
    moveCursor(Math.min(active, length - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, length, value, reduce])

  const submit = async (code) => {
    if (completingRef.current || typeof onComplete !== 'function') return
    completingRef.current = true
    setBusy(true)
    setError(false)
    try {
      const ok = await onComplete(code)
      if (ok === false) {
        setError(true)
        setValue('')
        setActive(0)
        if (!reduce && slotsRef.current) {
          try {
            slotsRef.current.animate(
              [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(0)' },
              ],
              springOpts(DUR.snap * 2),
            )
          } catch { /* noop */ }
        }
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    } finally {
      completingRef.current = false
      setBusy(false)
    }
  }

  const applyValue = (nextRaw) => {
    const next = onlyDigits(nextRaw).slice(0, length)
    setValue(next)
    setError(false)
    setActive(Math.min(next.length, length - 1))
    if (next.length === length) {
      submit(next)
    }
  }

  const onChange = (e) => {
    if (disabled || busy) return
    applyValue(e.target.value)
  }

  const onKeyDown = (e) => {
    if (disabled || busy) return
    if (e.key === 'Backspace') {
      if (!value) return
      e.preventDefault()
      const next = value.slice(0, -1)
      setValue(next)
      setError(false)
      setActive(Math.max(0, next.length))
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActive((i) => Math.min(length - 1, Math.max(value.length, i + 1)))
      return
    }
  }

  const onPaste = (e) => {
    if (disabled || busy) return
    const text = e.clipboardData?.getData('text') || ''
    if (!text) return
    e.preventDefault()
    applyValue(text)
  }

  const focusInput = () => {
    if (!disabled) inputRef.current?.focus()
  }

  return (
    <div
      className={`otp ${error ? 'is-error' : ''}`}
      role="group"
      aria-labelledby={title ? `${rid}-title` : undefined}
      aria-describedby={hint ? `${rid}-hint` : undefined}
    >
      {title && (
        <h3 className="otp-title" id={`${rid}-title`}>
          {title}
        </h3>
      )}
      {hint && (
        <p className="otp-hint" id={`${rid}-hint`}>
          {hint}
        </p>
      )}

      <div className="otp-wrap" onClick={focusInput}>
        <input
          ref={inputRef}
          className="otp-hidden"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          value={value}
          disabled={disabled || busy}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setActive(Math.min(value.length, length - 1))}
          aria-label={title || 'One-time code'}
          aria-invalid={error || undefined}
        />

        <div className="otp-slots" ref={slotsRef} aria-hidden>
          <div
            ref={cursorRef}
            className="otp-cursor"
            style={{ transform: 'translate(0, 0)' }}
          />
          {chars.map((ch, i) => {
            const isActive = i === Math.min(active, length - 1) && !disabled
            return (
              <div
                key={i}
                className={`otp-slot ${isActive ? 'is-active' : ''} ${ch ? 'is-filled' : ''}`}
              >
                {ch}
                {isActive && !reduce && (
                  <svg className="otp-spark" viewBox="0 0 46 54" preserveAspectRatio="none">
                    <rect
                      x="1"
                      y="1"
                      width="44"
                      height="52"
                      rx="9"
                      pathLength="1"
                    />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
