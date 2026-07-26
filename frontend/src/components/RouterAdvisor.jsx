/**
 * Router Advisor — per-vendor VoIP network programming guidance.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  CODEC_KBPS,
  PLATFORM_PORTS,
  ROUTER_PROFILES,
  searchProfiles,
} from '../lib/routerProfiles.js'
import {
  buildPrescription,
  prescriptionCustomerHtml,
  prescriptionToText,
} from '../lib/routerAdvisor.js'
import { useRoute } from '../lib/router.js'

function CopyButton({ text, label = 'Copy' }) {
  const [flash, setFlash] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text || '')
      setFlash('Copied')
      setTimeout(() => setFlash(''), 1500)
    } catch {
      setFlash('Failed')
      setTimeout(() => setFlash(''), 1500)
    }
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={copy} disabled={!text}>
      {flash || label}
    </button>
  )
}

export default function RouterAdvisor() {
  const route = useRoute()
  const [vendorQuery, setVendorQuery] = useState('')
  const [profileId, setProfileId] = useState('cisco-ios')
  const [platformId, setPlatformId] = useState('netsapiens')
  const [seats, setSeats] = useState('10')
  const [codecId, setCodecId] = useState('g711')
  const [phonesOnVlan, setPhonesOnVlan] = useState(true)
  const [onSiteSbc, setOnSiteSbc] = useState(false)
  const [qosInPlace, setQosInPlace] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [showExport, setShowExport] = useState(false)

  const filtered = useMemo(() => searchProfiles(vendorQuery), [vendorQuery])

  const rx = useMemo(() => buildPrescription({
    profileId,
    platformId,
    seats,
    codecId,
    phonesOnVlan,
    onSiteSbc,
    qosInPlace,
    customerName,
  }), [profileId, platformId, seats, codecId, phonesOnVlan, onSiteSbc, qosInPlace, customerName])

  const allText = useMemo(() => prescriptionToText(rx), [rx])

  useEffect(() => {
    const focus = String(route.query?.focus || '').toLowerCase()
    if (!focus) return undefined
    const id = focus === 'alg' || focus === 'sip-alg' || focus === 'sipalg'
      ? 'ra-item-sip-alg'
      : focus === 'qos'
        ? 'ra-item-qos'
        : `ra-item-${focus}`
    const t = window.setTimeout(() => {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('is-focus')
        window.setTimeout(() => el.classList.remove('is-focus'), 2400)
      }
    }, 80)
    return () => window.clearTimeout(t)
  }, [route.query?.focus, rx.items.length])

  function openCustomerExport() {
    const html = prescriptionCustomerHtml(rx)
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      setShowExport(true)
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      try { w.focus(); w.print() } catch { /* ignore */ }
    }, 250)
  }

  return (
    <section className="cd-root ra-root">
      <div className="cd-header">
        <h2 className="cd-title">Router Advisor</h2>
        <p className="cd-subtitle">
          Vendor-specific SIP ALG, QoS, firewall, and timeout guidance for hosted VoIP — sized to seat count.
        </p>
      </div>

      <div className="ra-layout">
        <aside className="ra-inputs" aria-label="Inputs">
          <label className="survey-field">
            Vendor search
            <input
              type="search"
              value={vendorQuery}
              onChange={e => setVendorQuery(e.target.value)}
              placeholder="Cisco, Meraki, UniFi…"
            />
          </label>
          <label className="survey-field">
            Router / firewall
            <select
              value={profileId}
              onChange={e => setProfileId(e.target.value)}
            >
              {(filtered.length ? filtered : ROUTER_PROFILES).map(p => (
                <option key={p.id} value={p.id}>{p.vendor}</option>
              ))}
            </select>
          </label>
          <label className="survey-field">
            VoIP platform
            <select value={platformId} onChange={e => setPlatformId(e.target.value)}>
              {Object.values(PLATFORM_PORTS).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="survey-field">
            Seat count
            <input
              type="number"
              min={1}
              value={seats}
              onChange={e => setSeats(e.target.value)}
            />
          </label>
          <label className="survey-field">
            Codec assumption
            <select value={codecId} onChange={e => setCodecId(e.target.value)}>
              {Object.entries(CODEC_KBPS).map(([id, c]) => (
                <option key={id} value={id}>{c.label} ({c.kbps} kbps)</option>
              ))}
            </select>
          </label>
          <label className="survey-field">
            Customer name (for IT export)
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Optional"
            />
          </label>

          <div className="ra-checks">
            <label className="ra-check">
              <input
                type="checkbox"
                checked={phonesOnVlan}
                onChange={e => setPhonesOnVlan(e.target.checked)}
              />
              Phones on their own VLAN
            </label>
            <label className="ra-check">
              <input
                type="checkbox"
                checked={onSiteSbc}
                onChange={e => setOnSiteSbc(e.target.checked)}
              />
              On-site SBC / edge
            </label>
            <label className="ra-check">
              <input
                type="checkbox"
                checked={qosInPlace}
                onChange={e => setQosInPlace(e.target.checked)}
              />
              Existing QoS in place
            </label>
          </div>

          <div className="btn-row">
            <CopyButton text={allText} label="Copy all as text" />
            <button type="button" className="btn btn-primary" onClick={openCustomerExport}>
              Export for customer IT
            </button>
          </div>
          {showExport && (
            <p className="parse-note parse-error">
              Pop-up blocked — allow pop-ups or use Copy all as text.
            </p>
          )}
        </aside>

        <div className="ra-output" aria-label="Prescription">
          <div className="ra-summary">
            <strong>{rx.profile.vendor}</strong>
            {' · '}
            {rx.platform.label}
            {' · '}
            {rx.seats} seats
            {' · '}
            ~{rx.priorityKbps} kbps voice queue
          </div>

          {rx.items.map(item => (
            <article key={item.id} id={`ra-item-${item.id}`} className="ra-card">
              <div className="ra-card-head">
                <h3>{item.title}</h3>
                {(item.snippet || (item.steps || []).length > 0) && (
                  <CopyButton
                    text={[item.body, ...(item.steps || []).map(s => `• ${s}`), item.snippet]
                      .filter(Boolean)
                      .join('\n\n')}
                    label="Copy"
                  />
                )}
              </div>
              {item.body ? <p className="ra-card-body">{item.body}</p> : null}
              {item.steps?.length ? (
                <ol className="ra-steps">
                  {item.steps.map(s => <li key={s}>{s}</li>)}
                </ol>
              ) : null}
              {item.snippet ? (
                <pre className="ra-snippet">{item.snippet}</pre>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {/* Inline printable block for Phase-6-style print CSS when user prints this page */}
      <div className="ra-print-sheet no-screen" aria-hidden="true">
        <h1>
          {customerName
            ? `Network readiness checklist — ${customerName}`
            : 'Network readiness checklist — VoIP phones'}
        </h1>
        <p>
          Hosted VoIP ({rx.platform.label}) for ~{rx.seats} seat(s). Verify each step in current vendor docs.
        </p>
        {rx.items.map(item => (
          <section key={`print-${item.id}`}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            {item.steps?.length ? (
              <ol>{item.steps.map(s => <li key={s}>{s}</li>)}</ol>
            ) : null}
            {item.snippet ? <pre>{item.snippet}</pre> : null}
          </section>
        ))}
      </div>
    </section>
  )
}
