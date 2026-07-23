/**
 * Tools → Config: Algo | Ports | QuickCard sub-tabs.
 */

import { useEffect, useState } from 'react'
import AlgoConfig from './AlgoConfig.jsx'
import PortChecklist from './PortChecklist.jsx'
import QuickCard from './QuickCard.jsx'
import { navigate } from '../lib/router.js'

const TABS = [
  { id: 'algo', label: 'Algo' },
  { id: 'ports', label: 'Ports' },
  { id: 'quickcard', label: 'QuickCard' },
]

function normalizeTab(tab) {
  const id = String(tab || '').toLowerCase()
  if (id === 'ports' || id === 'port') return 'ports'
  if (id === 'quickcard' || id === 'quick' || id === 'card') return 'quickcard'
  if (id === 'algo') return 'algo'
  return 'algo'
}

export default function ToolsConfig({ tab } = {}) {
  const [active, setActive] = useState(() => normalizeTab(tab))

  useEffect(() => {
    setActive(normalizeTab(tab))
  }, [tab])

  function selectTab(id) {
    setActive(id)
    navigate(`/tools/config/${id}`, { replace: true })
  }

  return (
    <div className="tools-page tools-config">
      <header className="tools-page-header">
        <div className="survey-kicker">Tools</div>
        <h1>Config</h1>
        <p>Algo paging builders, firewall ports, and end-user quick cards.</p>
      </header>

      <div className="tools-subtabs" role="tablist" aria-label="Config tools">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`tools-subtab${active === t.id ? ' is-active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tools-page-body">
        {active === 'algo' && <AlgoConfig />}
        {active === 'ports' && <PortChecklist />}
        {active === 'quickcard' && <QuickCard />}
      </div>
    </div>
  )
}
