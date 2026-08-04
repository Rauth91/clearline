/**
 * Empty-state tip chips — tap to insert a heading into a related textarea.
 */
export default function TipChips({ tips, value, onInsert }) {
  if (value?.trim()) return null
  return (
    <div className="tip-chips" role="list" aria-label="Insert heading">
      {tips.map((tip) => (
        <button
          key={tip}
          type="button"
          className="tip-chip"
          role="listitem"
          onClick={() => onInsert?.(tip)}
        >
          {tip}
        </button>
      ))}
    </div>
  )
}

export function insertTipHeading(current, tip) {
  const heading = `${tip}\n`
  const base = String(current || '').trim()
  return base ? `${base}\n\n${heading}` : heading
}
