/**
 * Tools → Reference: unified search + optional detail panels.
 */

import { useEffect, useState } from 'react'
import ReferenceSearch from './ReferenceSearch.jsx'
import YealinkCodes from './YealinkCodes.jsx'
import CodecRef from './CodecRef.jsx'
import FirmwareRefs from './FirmwareRefs.jsx'
import { navigate } from '../lib/router.js'

const PANELS = [
  { id: 'search', label: 'Search' },
  { id: 'yealink', label: 'Yealink' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'codec', label: 'Codec' },
]

function normalizePanel(tab) {
  const id = String(tab || '').toLowerCase()
  if (id === 'yealink' || id === 'codes') return 'yealink'
  if (id === 'firmware' || id === 'fw') return 'firmware'
  if (id === 'codec' || id === 'qos' || id === 'sip') return 'codec'
  if (id === 'search') return 'search'
  return 'search'
}

export default function ToolsReference({ tab } = {}) {
  const [panel, setPanel] = useState(() => normalizePanel(tab))

  useEffect(() => {
    if (tab) setPanel(normalizePanel(tab))
  }, [tab])

  function selectPanel(id) {
    setPanel(id)
    if (id === 'search') navigate('/tools/reference', { replace: true })
    else navigate(`/tools/reference/${id}`, { replace: true })
  }

  const codecInitialTab = String(tab || '').toLowerCase() === 'sip' ? 'SIP Response Codes' : undefined

  return (
    <div className="tools-page tools-reference">
      <header className="tools-page-header">
        <div className="survey-kicker">Tools</div>
        <h1>Reference</h1>
        <p>Search Yealink codes, firmware certifications, and codec / QoS / SIP lookups.</p>
      </header>

      <div className="tools-subtabs" role="tablist" aria-label="Reference panels">
        {PANELS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={panel === p.id}
            className={`tools-subtab${panel === p.id ? ' is-active' : ''}`}
            onClick={() => selectPanel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="tools-page-body">
        {panel === 'search' && <ReferenceSearch />}
        {panel === 'yealink' && <YealinkCodes />}
        {panel === 'firmware' && <FirmwareRefs />}
        {panel === 'codec' && <CodecRef initialTab={codecInitialTab} />}
      </div>
    </div>
  )
}
