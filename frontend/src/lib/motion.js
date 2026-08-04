/**
 * Shared motion vocabulary — one spring for the whole product.
 * SPRING: arrivals / landings
 * SETTLE: fills, growth, meters
 * SNAP: hover, focus, colour shifts
 */

export const SPRING = 'cubic-bezier(.22, 1.4, .36, 1)'
export const SETTLE = 'cubic-bezier(.22, 1, .36, 1)'
export const SNAP = 'cubic-bezier(.22, 1.2, .36, 1)'

export const DUR = {
  spring: 520,
  settle: 400,
  snap: 200,
  glide: 340,
}

let _reduce = null

/** Cached prefers-reduced-motion check; updates if the media query flips. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  if (_reduce == null) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    _reduce = mq.matches
    const sync = () => { _reduce = mq.matches }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync)
    else if (typeof mq.addListener === 'function') mq.addListener(sync)
  }
  return _reduce
}

/** Web Animations API options with spring easing, or instant if reduced. */
export function springOpts(duration = DUR.spring, extra = {}) {
  if (prefersReducedMotion()) {
    return { duration: 1, easing: 'linear', fill: 'forwards', ...extra }
  }
  return { duration, easing: SPRING, fill: 'forwards', ...extra }
}
