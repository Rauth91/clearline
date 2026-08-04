/**
 * Readiness — is this site ready for phones.
 * Tabs: Network · Ports · Router (existing tools, unchanged libs).
 */

import NavChipStrip from './NavChipStrip.jsx'
import NetworkCheck from './NetworkCheck.jsx'
import PortChecklist from './PortChecklist.jsx'
import RouterAdvisor from './RouterAdvisor.jsx'
import { navigate, useRoute } from '../lib/router.js'

const TABS = [
  { id: 'network', label: 'Network' },
  { id: 'ports', label: 'Ports' },
  { id: 'router', label: 'Router' },
]

function tabFromQuery(query) {
  const raw = String(query?.tab || '').toLowerCase()
  if (raw === 'ports' || raw === 'port' || raw === 'firewall') return 'ports'
  if (raw === 'router' || raw === 'firewall-router' || raw === 'advisor') return 'router'
  if (raw === 'network' || raw === 'netcheck' || raw === 'net') return 'network'
  return 'network'
}

export default function Readiness() {
  const route = useRoute()
  const tab = tabFromQuery(route.query)

  function setTab(id) {
    const query = { ...route.query, tab: id }
    // Keep focus= when staying on / switching to router
    if (id !== 'router') delete query.focus
    navigate('/tools/readiness', { query })
  }

  return (
    <section className="readiness-root">
      <div className="cd-header">
        <h2 className="cd-title">Readiness</h2>
        <p className="cd-subtitle">
          Network metrics, firewall ports, and router guidance — one place to decide if the site can take phones.
        </p>
      </div>

      <NavChipStrip
        label="Readiness"
        items={TABS.map(t => ({
          id: t.id,
          label: t.label,
          active: tab === t.id,
          onClick: () => setTab(t.id),
        }))}
      />

      <div className="readiness-panel">
        {tab === 'network' && <NetworkCheck />}
        {tab === 'ports' && <PortChecklist />}
        {tab === 'router' && <RouterAdvisor />}
      </div>
    </section>
  )
}
