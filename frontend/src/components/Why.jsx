/**
 * Disclosure ladder — rationale behind a collapsed details toggle.
 * Collapsed by default. Keyboard accessible via native <details>.
 */
export default function Why({ children, label = 'Why' }) {
  return (
    <details className="why">
      <summary className="why-summary">
        <span className="why-affordance" aria-hidden="true">ⓘ</span>
        <span className="why-label">{label}</span>
      </summary>
      <div className="why-body">{children}</div>
    </details>
  )
}
