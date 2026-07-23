/**
 * Tools → Reference: unified search + optional detail panels.
 */

import { useState } from 'react'
import ReferenceSearch from './ReferenceSearch.jsx'
import YealinkCodes from './YealinkCodes.jsx'
import CodecRef from './CodecRef.jsx'

const PANELS = [
  { id: 'search', label: 'Search' },
  { id: 'yealink', label: 'Yealink' },
  { id: 'codec', label: 'Codec' },
]

export default function ToolsReference() {
  const [panel, setPanel] = useState('search')

  return (
    <div className="tools-page tools-reference">
      <header className="tools-page-header">
        <div className="survey-kicker">Tools</div>
        <h1>Reference</h1>
        <p>Search Yealink codes and codec / QoS / SIP lookups in one place.</p>
      </header>

      <div className="tools-subtabs" role="tablist" aria-label="Reference panels">
        {PANELS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={panel === p.id}
            className={`tools-subtab${panel === p.id ? ' is-active' : ''}`}
            onClick={() => setPanel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="tools-page-body">
        {panel === 'search' && <ReferenceSearch />}
        {panel === 'yealink' && <YealinkCodes />}
        {panel === 'codec' && <CodecRef />}
      </div>
    </div>
  )
}
