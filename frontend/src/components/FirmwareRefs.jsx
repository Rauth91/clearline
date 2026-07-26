/**
 * Firmware reference cards — org-synced certified versions + EOL notes.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  listFirmwareRefs,
  seedFirmwareStarter,
  upsertFirmwareRef,
} from '../lib/firmwareModel.js'
import { onDataChanged } from '../lib/dataEvents.js'

const HOW_TO_CHECK = [
  'Open the phone web UI (default: admin / admin — change the password).',
  'Go to Status → Firmware Version (or Status → Phone).',
  'Compare to the certified version on this card for your platform.',
]

function FirmwareCard({ item, onSave }) {
  const [draft, setDraft] = useState(() => ({
    certified_version: item.certified_version || '',
    platform: item.platform || '',
    notes: item.notes || '',
  }))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft({
      certified_version: item.certified_version || '',
      platform: item.platform || '',
      notes: item.notes || '',
    })
  }, [item.id, item.certified_version, item.platform, item.notes, item.updated_at])

  const dirty = (
    draft.certified_version !== (item.certified_version || '')
    || draft.platform !== (item.platform || '')
    || draft.notes !== (item.notes || '')
  )

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await onSave(item.id, draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={`fw-card${item.eol ? ' is-eol' : ''}`}>
      <div className="fw-card-head">
        <div>
          <h3 className="fw-model">{item.model}</h3>
          <div className="fw-badges">
            {item.family && <span className="fw-family-badge">{item.family}</span>}
            {item.eol && <span className="fw-eol-badge">EOL</span>}
          </div>
        </div>
        {item.support_url && (
          <a
            className="btn btn-secondary"
            href={item.support_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check on Yealink
          </a>
        )}
      </div>

      <label className="fw-field">
        <span>Certified for our platform</span>
        <input
          type="text"
          value={draft.certified_version}
          onChange={e => setDraft(d => ({ ...d, certified_version: e.target.value }))}
          onBlur={save}
          placeholder="e.g. 96.86.0.23"
          aria-label={`${item.model} certified firmware version`}
          disabled={item.eol && !draft.certified_version}
        />
      </label>

      <label className="fw-field">
        <span>Platform</span>
        <input
          type="text"
          value={draft.platform}
          onChange={e => setDraft(d => ({ ...d, platform: e.target.value }))}
          onBlur={save}
          placeholder="NetSapiens / Meta / Zultys…"
          aria-label={`${item.model} platform`}
        />
      </label>

      <label className="fw-field">
        <span>Notes</span>
        <textarea
          value={draft.notes}
          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
          onBlur={save}
          rows={2}
          placeholder="Site quirks, forced upgrades, carve-outs…"
          aria-label={`${item.model} notes`}
        />
      </label>

      {dirty && (
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}

      <details className="fw-howto">
        <summary>How to check on the phone</summary>
        <ol>
          {HOW_TO_CHECK.map(step => <li key={step}>{step}</li>)}
        </ol>
        <p className="fw-howto-warn">
          Default admin login is often admin / admin — change default passwords before leaving the site.
        </p>
      </details>
    </article>
  )
}

export default function FirmwareRefs() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [note, setNote] = useState(null)

  async function refresh() {
    const list = await listFirmwareRefs()
    setRows(list)
    setLoading(false)
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error(err)
      setLoading(false)
    })
    return onDataChanged((detail) => {
      if (detail.kind === 'firmware' || detail.kind === 'job') {
        // job kind ignored; firmware refreshes on firmware events
      }
      if (detail.kind === 'firmware') refresh().catch(console.error)
    })
  }, [])

  const { active, eol } = useMemo(() => ({
    active: rows.filter(r => !r.eol),
    eol: rows.filter(r => r.eol),
  }), [rows])

  async function handleSave(id, draft) {
    await upsertFirmwareRef({ id, ...draft })
    await refresh()
  }

  async function handleSeed() {
    setSeeding(true)
    setNote(null)
    try {
      const result = await seedFirmwareStarter()
      await refresh()
      setNote({
        type: 'ok',
        text: result.added
          ? `Added ${result.added} starter models.`
          : 'Starter set already present.',
      })
    } catch (err) {
      console.error(err)
      setNote({ type: 'error', text: 'Could not add starter set.' })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <section className="fw-root">
      <header className="fw-header">
        <div>
          <h2 className="fw-title">Firmware</h2>
          <p className="fw-subtitle">
            Certified Yealink versions for your platform. Editable offline — syncs when online.
          </p>
        </div>
        {rows.length === 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSeed}
            disabled={seeding}
          >
            {seeding ? 'Adding…' : 'Add starter set'}
          </button>
        )}
      </header>

      {note && (
        <div className={note.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
          {note.text}
        </div>
      )}

      {loading ? (
        <p className="fw-empty">Loading firmware cards…</p>
      ) : rows.length === 0 ? (
        <div className="empty-hint-action">
          <p>No firmware cards yet. Add the Yealink starter set for T5x / T4x / CP / AX (including EOL models).</p>
          <button type="button" className="btn btn-primary" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Adding…' : 'Add starter set'}
          </button>
        </div>
      ) : (
        <>
          <div className="fw-grid">
            {active.map(item => (
              <FirmwareCard key={item.id} item={item} onSave={handleSave} />
            ))}
          </div>
          {eol.length > 0 && (
            <div className="fw-eol-section">
              <h3 className="fw-eol-heading">End of life</h3>
              <div className="fw-grid">
                {eol.map(item => (
                  <FirmwareCard key={item.id} item={item} onSave={handleSave} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
