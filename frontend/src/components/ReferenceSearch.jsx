/**
 * Unified search across Yealink codes and Codec/QoS reference.
 */

import { useEffect, useMemo, useState } from 'react'
import { groupReferenceResults, searchReference } from '../lib/referenceIndex.js'
import { useRoute } from '../lib/router.js'

function ResultGroup({ label, badgeClass, items }) {
  if (!items.length) return null
  return (
    <section className="ref-search-group" aria-label={label}>
      <div className="ref-search-group-head">
        <h3>{label}</h3>
        <span className={`ref-search-badge ${badgeClass}`}>{items.length}</span>
      </div>
      <ul className="ref-search-list">
        {items.map((item, i) => (
          <li key={`${item.source}-${item.title}-${i}`} className="ref-search-item">
            <div className="ref-search-item-title">{item.title}</div>
            {item.subtitle ? (
              <div className="ref-search-item-sub">{item.subtitle}</div>
            ) : null}
            {item.body ? (
              <div className="ref-search-item-body">{item.body}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ReferenceSearch({ initialQuery = '' } = {}) {
  const route = useRoute()
  const fromRoute = route.query?.q || ''
  const [query, setQuery] = useState(initialQuery || fromRoute)

  useEffect(() => {
    if (fromRoute && fromRoute !== query) setQuery(fromRoute)
    // Only sync when hash query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRoute])

  const results = useMemo(
    () => searchReference(query, { limit: 60 }),
    [query],
  )
  const grouped = useMemo(() => groupReferenceResults(results), [results])
  const hasQuery = Boolean(String(query || '').trim())

  return (
    <div className="ref-search">
      <div className="ref-search-bar">
        <label className="sr-only" htmlFor="ref-search-input">Search reference</label>
        <input
          id="ref-search-input"
          className="ref-search-input"
          type="search"
          placeholder="Search Yealink codes, codecs, DSCP, SIP…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {!hasQuery ? (
        <p className="ref-search-hint">
          Type to search across Yealink config codes and Codec / QoS / SIP reference.
        </p>
      ) : results.length === 0 ? (
        <p className="ref-search-empty">No matches for “{query.trim()}”.</p>
      ) : (
        <div className="ref-search-results">
          <div className="ref-search-summary">
            <span className="ref-search-badge ref-search-badge-yealink">
              Yealink {grouped.yealink.length}
            </span>
            <span className="ref-search-badge ref-search-badge-codec">
              Codec {grouped.codec.length}
            </span>
          </div>
          <ResultGroup
            label="Yealink"
            badgeClass="ref-search-badge-yealink"
            items={grouped.yealink}
          />
          <ResultGroup
            label="Codec"
            badgeClass="ref-search-badge-codec"
            items={grouped.codec}
          />
        </div>
      )}
    </div>
  )
}
