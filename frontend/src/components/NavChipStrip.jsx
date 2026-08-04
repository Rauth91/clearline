/**
 * Horizontal chip strip for job steps / tool groups under the topbar.
 */
export default function NavChipStrip({ label, badge, items, trailing }) {
  if (!items?.length && !trailing) return null
  return (
    <div className="nav-chip-strip" role="navigation" aria-label={label || 'Section'}>
      {(label || badge) && (
        <div className="nav-chip-meta">
          {label ? <span className="nav-chip-label">{label}</span> : null}
          {badge ? <span className={`nav-chip-badge${badge.tone ? ` is-${badge.tone}` : ''}`}>{badge.text}</span> : null}
        </div>
      )}
      <div className="nav-chip-row" role="tablist">
        {trailing}
        {items?.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={!!item.active}
            className={`nav-chip${item.active ? ' is-active spark-focus' : ''}`}
            onClick={item.onClick}
            title={item.title || item.label}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
