/**
 * Device Config — Yealink codes + Algo paging.
 * Shell over existing renderers; yealinkShape.js untouched.
 */

import AlgoConfig from './AlgoConfig.jsx'
import NavChipStrip from './NavChipStrip.jsx'
import YealinkCodes from './YealinkCodes.jsx'
import { navigate, useRoute } from '../lib/router.js'

const TABS = [
  { id: 'yealink', label: 'Yealink' },
  { id: 'algo', label: 'Algo' },
]

function tabFromQuery(query) {
  const raw = String(query?.tab || '').toLowerCase()
  if (raw === 'algo' || raw === 'paging') return 'algo'
  if (raw === 'yealink' || raw === 'codes') return 'yealink'
  return 'yealink'
}

export default function DeviceConfig() {
  const route = useRoute()
  const tab = tabFromQuery(route.query)
  const searchQ = route.query.q || ''

  function setTab(id) {
    const query = { tab: id }
    if (id === 'yealink' && searchQ) query.q = searchQ
    navigate('/tools/deviceconfig', { query })
  }

  return (
    <section className="device-config-root">
      <div className="cd-header">
        <h2 className="cd-title">Device Config</h2>
        <p className="cd-subtitle">
          Yealink provisioning codes and Algo paging builders for the job site.
        </p>
      </div>

      <NavChipStrip
        label="Device Config"
        items={TABS.map(t => ({
          id: t.id,
          label: t.label,
          active: tab === t.id,
          onClick: () => setTab(t.id),
        }))}
      />

      <div className="device-config-panel">
        {tab === 'yealink' && <YealinkCodes initialSearch={searchQ} />}
        {tab === 'algo' && <AlgoConfig />}
      </div>
    </section>
  )
}
