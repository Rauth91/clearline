/**
 * MetaToNs — Metaswitch Business Group → NetSapiens import builder.
 *
 * Improvements:
 * - Auto-detects export type from CSV headers (no need to match slot)
 * - Configurable extension digit count (3-5)
 * - Inline editable extension table with real-time collision detection
 * - All conversion runs 100% in-browser — nothing leaves this computer.
 */

import { useMemo, useRef, useState } from 'react'

/* ── CSV helpers ──────────────────────────────────────────── */
function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const head = rows[0].map(h => h.trim())
  const out = []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every(v => v.trim() === '')) continue
    const o = {}
    head.forEach((h, j) => o[h] = (rows[i][j] || '').trim())
    out.push(o)
  }
  return out
}

function toCSV(cols, rows) {
  const esc = v => {
    v = (v === undefined || v === null) ? '' : String(v)
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  }
  const lines = [cols.map(esc).join(',')]
  rows.forEach(r => lines.push(cols.map(c => esc(r[c])).join(',')))
  return lines.join('\r\n') + '\r\n'
}

/* ── Auto-detect file type from headers ───────────────────── */
function detectType(rows) {
  if (!rows || !rows.length) return null
  const keys = new Set(Object.keys(rows[0]))
  if (keys.has('MAC Address') && keys.has('Device Model') && keys.has('Subscriber Directory Number')) return 'devices'
  if (keys.has('Directory number') && keys.has('Name')) return 'lines'
  if (keys.has('Directory number')) return 'dns'
  return null
}

/* ── Column definitions ───────────────────────────────────── */
const USER_COLS = [
  'extension*', 'domain', 'first name*', 'last name*', 'login', 'portal password',
  'email address', 'voicemail pin', 'department', 'site', 'vmail enabled',
  'answer timeout', 'timezone', 'area code', 'callerid number', 'callerid name',
  '911 callerid', 'dial plan', 'dial permission', 'audio directory', 'visual directory',
  'vmail_transcribe', 'email_vmail', 'email_vmail_enable', 'add phone extension', 'scope',
]
const PHONE_COLS = ['MAC', 'Model', 'Server', 'Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Notes']
const E911_COLS = [
  'call_back_number', 'address_name', 'caller_name', 'address_line_1',
  'address_line_2', 'country_code', 'state_code', 'city', 'zip',
  'location', 'user/site', 'assign',
]
const REVIEW_COLS = ['Issue', 'Key', 'Detail', 'Action Needed']

const MODEL_MAP = {
  'polycom vvx 150': 'Polycom VVX150', 'polycom vvx 250': 'Polycom VVX250',
  'polycom vvx 300': 'Polycom VVX300', 'polycom vvx 310': 'Polycom VVX310',
  'polycom vvx 350': 'Polycom VVX350', 'polycom vvx 400': 'Polycom VVX400',
  'polycom vvx 410': 'Polycom VVX410', 'polycom vvx 450': 'Polycom VVX450',
  'polycom vvx 500': 'Polycom VVX500', 'polycom vvx 501': 'Polycom VVX501',
  'polycom vvx 600': 'Polycom VVX600', 'polycom vvx 601': 'Polycom VVX601',
  'polycom trio 8800': 'Polycom Trio8800',
  'polycom soundstation ip 5000': 'Polycom SoundStation5000',
  'yealink t21': 'Yealink T21', 'yealink t21p e2': 'Yealink T21P_E2',
  'yealink t42s': 'Yealink T42S', 'yealink t46s': 'Yealink T46S',
  'yealink t46g': 'Yealink T46G', 'yealink t48s': 'Yealink T48S',
  'yealink t54w': 'Yealink T54W', 'yealink t57w': 'Yealink T57W',
  'yealink t53w': 'Yealink T53W', 'yealink t33g': 'Yealink T33G',
  'yealink t31g': 'Yealink T31G', 'yealink t31p': 'Yealink T31P',
  'yealink t41s': 'Yealink T41S', 'yealink t43u': 'Yealink T43U',
  'yealink t53': 'Yealink T53',
}
const EM_COLS = ['Expansion Module 1', 'Expansion Module 2', 'Expansion Module 3']

/* ── Conversion helpers ───────────────────────────────────── */
const normDN = s => { let d = String(s || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d }
const normMAC = s => String(s || '').replace(/[^0-9A-Fa-f]/g, '').toLowerCase()

function splitName(raw) {
  raw = String(raw || '').trim()
  if (!raw) return ['', '', false]
  if (raw.includes(',')) {
    const i = raw.indexOf(',')
    const last = raw.slice(0, i).trim(), first = raw.slice(i + 1).trim()
    return [first, last, !!(first && last)]
  }
  const p = raw.split(/\s+/)
  if (p.length === 1) return [p[0], '', false]
  if (p.length === 2) return [p[0], p[1], true]
  return [p[0], p.slice(1).join(' '), false]
}

function mapModel(m) {
  const key = String(m || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return [MODEL_MAP[key] || null, String(m || '').trim()]
}

/* ── Core transform ───────────────────────────────────────── */
function transform(lines, devices, dns, cfg) {
  const review = []
  const flag = (issue, key, detail, action) => review.push({ Issue: issue, Key: key, Detail: detail, 'Action Needed': action })
  const { extDigits = 4, extOverrides = {} } = cfg

  const devByDN = {}
  devices.forEach(d => {
    const dn = normDN(d['Subscriber Directory Number'])
    if (!dn) { flag('Device with no DN', normMAC(d['MAC Address']), d['Description'] || '', 'Decide whether to migrate this device'); return }
    ;(devByDN[dn] = devByDN[dn] || []).push(d)
  })

  const users = [], seenExt = {}, extByDN = {}
  lines.forEach(ln => {
    const dn = normDN(ln['Directory number'])
    if (!dn) { flag('Line with no DN', '', '(blank directory number)', 'Check the Metaswitch export'); return }

    const ext = extOverrides[dn] || dn.slice(-parseInt(extDigits, 10))

    if (seenExt[ext] && seenExt[ext] !== dn)
      flag('Extension collision', ext, seenExt[ext] + ' and ' + dn + ' both map to ' + ext, 'Give one a different extension before import')
    seenExt[ext] = dn

    const [first, last, ok] = splitName(ln['Name'])
    if (!ok) flag("Name needs review", ext, "Metaswitch Name = '" + (ln['Name'] || '') + "'", 'Confirm first/last split, or set a label for a non-person line')

    let email = ''
    if (cfg.emailDom && first && last)
      email = (first + '.' + last + '@' + cfg.emailDom).toLowerCase().replace(/\s+/g, '')

    users.push({
      'extension*': ext, 'domain': cfg.domain, 'first name*': first, 'last name*': last,
      'login': ext + '@' + cfg.domain, 'portal password': ' ', 'email address': email,
      'voicemail pin': cfg.pin, 'department': ln['Department'] || '', 'site': '',
      'vmail enabled': 'yes', 'answer timeout': cfg.timeout, 'timezone': cfg.tz,
      'area code': cfg.area, 'callerid number': cfg.cidNum, 'callerid name': cfg.cidName,
      '911 callerid': cfg.e911, 'dial plan': cfg.domain, 'dial permission': cfg.dialPerm,
      'audio directory': 'yes', 'visual directory': 'yes', 'vmail_transcribe': 'no',
      'email_vmail': 'attnew', 'email_vmail_enable': 'yes', 'add phone extension': 'yes',
      'scope': cfg.scope,
      _dn: dn,
    })
    extByDN[dn] = ext
  })

  const phones = [], unmapped = {}
  devices.forEach(d => {
    const mac = normMAC(d['MAC Address'])
    if (!mac) return
    const dn = normDN(d['Subscriber Directory Number'])
    if (mac.length !== 12) flag('MAC not 12 hex chars', mac, d['Description'] || '', 'Fix before import — NetSapiens will reject it')
    const [mapped, original] = mapModel(d['Device Model'])
    if (mapped === null && original) unmapped[original] = (unmapped[original] || 0) + 1

    const ext = extByDN[dn] || ''
    if (dn && !ext) flag('Device DN not in Lines', mac, dn, 'Stale device, or the line is missing from the export')

    const ems = EM_COLS.map(c => (d[c] || '').trim()).filter(Boolean)
    let note = d['Description'] || ''
    if (ems.length) {
      note = (note + ' | SIDECAR: ' + ems.join(', ')).replace(/^ \| /, '')
      flag('Sidecar — keys need manual rebuild', mac, 'ext ' + (ext || '?') + ' — ' + ems.join(', '), 'Capture the BLF layout from Metaswitch and rebuild it on the NetSapiens template')
    }

    phones.push({
      'MAC': mac, 'Model': mapped || original, 'Server': cfg.server,
      'Line 1': ext, 'Line 2': cfg.line2 ? ext : '',
      'Line 3': '', 'Line 4': '', 'Line 5': '', 'Line 6': '', 'Notes': note,
    })
  })

  Object.keys(unmapped).forEach(m =>
    flag('Model not in map', m, unmapped[m] + ' device(s)', 'Model passed through unchanged — confirm NetSapiens accepts it'))

  const e911 = users.map(u => ({
    'call_back_number': u._dn, 'address_name': '',
    'caller_name': ((u['first name*'] + ' ' + u['last name*']).trim() || cfg.cidName),
    'address_line_1': '', 'address_line_2': '', 'country_code': 'US', 'state_code': '',
    'city': '', 'zip': '', 'location': '', 'user/site': u['extension*'], 'assign': 'no',
  }))

  users.forEach(u => { if (!devByDN[u._dn]) flag('Line with no device', u['extension*'], u._dn, 'Softphone, analog, or unused — confirm before cutover') })
  users.forEach(u => delete u._dn)

  const spare = (dns || []).map(r => normDN(r['Directory number'])).filter(Boolean)
  return { users, phones, e911, review, spare }
}

/* ── Download helper ──────────────────────────────────────── */
function downloadCSV(name, text) {
  const b = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(b); a.download = name
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 400)
}

/* ── FileSlot component ───────────────────────────────────── */
const SLOT_META = {
  lines: { label: 'Business Group — Lines', hint: 'Directory number + Name columns' },
  devices: { label: 'Business Group — Managed Devices', hint: 'MAC Address + Device Model columns' },
  dns: { label: 'Business Group — Available DNs', hint: 'Optional — spare number list' },
}

function FileSlot({ label, hint, fileKey, required, rows, onLoad }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const loaded = rows !== null

  function handleFile(file) {
    if (!file) return
    const r = new FileReader()
    r.onload = () => {
      try { onLoad(fileKey, parseCSV(r.result), file.name) }
      catch { onLoad(fileKey, null, null) }
    }
    r.readAsText(file)
  }

  return (
    <div
      className={`mns-slot${loaded ? ' is-loaded' : ''}${dragging ? ' is-dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
    >
      <span className={`mns-led${loaded ? ' is-on' : ''}`} />
      <div className="mns-slot-text">
        <div className="mns-slot-name">{label}</div>
        <div className="mns-slot-meta">
          {loaded ? `${rows.length} rows loaded` : hint}
        </div>
      </div>
      <span className="mns-slot-tag">{required ? 'required' : 'optional'}</span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}
      />
    </div>
  )
}

/* ── Extension preview/editor ─────────────────────────────── */
function ExtEditor({ lines, extDigits, extOverrides, onChange }) {
  if (!lines || !lines.length) return null

  const rows = lines
    .map(ln => {
      const dn = normDN(ln['Directory number'])
      if (!dn) return null
      const auto = dn.slice(-parseInt(extDigits, 10))
      const ext = extOverrides[dn] !== undefined ? extOverrides[dn] : auto
      return { dn, ext, auto, name: ln['Name'] || '' }
    })
    .filter(Boolean)

  // Collision detection
  const counts = {}
  rows.forEach(r => { counts[r.ext] = (counts[r.ext] || 0) + 1 })
  const collisions = new Set(Object.keys(counts).filter(e => counts[e] > 1))

  const hasCollisions = collisions.size > 0
  const hasOverrides = Object.keys(extOverrides).length > 0

  return (
    <div className="mns-ext-editor">
      <div className="mns-ext-editor-head">
        <span>
          {rows.length} lines · {hasCollisions
            ? <span className="mns-ext-warn">{collisions.size} collision{collisions.size > 1 ? 's' : ''} — fix before building</span>
            : <span className="mns-ext-ok">No collisions</span>}
        </span>
        {hasOverrides && (
          <button type="button" className="btn btn-secondary mns-ext-reset"
            onClick={() => onChange({})}>
            Reset to auto
          </button>
        )}
      </div>
      <div className="mns-ext-table-wrap">
        <table className="mns-table mns-ext-table">
          <thead>
            <tr>
              <th>DN</th>
              <th>Name</th>
              <th>Extension</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isCollision = collisions.has(r.ext)
              const isOverridden = extOverrides[r.dn] !== undefined
              return (
                <tr key={r.dn} className={isCollision ? 'mns-row-collision' : ''}>
                  <td className="mns-td-mono">{r.dn}</td>
                  <td>{r.name}</td>
                  <td>
                    <input
                      className={`mns-ext-input${isCollision ? ' is-collision' : ''}${isOverridden ? ' is-overridden' : ''}`}
                      value={r.ext}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 8)
                        onChange(prev => {
                          const next = { ...prev }
                          if (val === r.auto) delete next[r.dn]
                          else next[r.dn] = val
                          return next
                        })
                      }}
                    />
                    {isCollision && <span className="mns-collision-badge">!</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main component ───────────────────────────────────────── */
const DEFAULT_CFG = {
  domain: '', area: '225', cidNum: '', cidName: '', e911: '',
  server: 'core2-ord', tz: 'US/Central', pin: '1234',
  scope: 'Basic User', dialPerm: 'US and Canada',
  emailDom: '', timeout: '25', line2: true, extDigits: '4',
}

const FIELDS = [
  { key: 'domain', label: 'Domain', req: true, placeholder: 'ACME-15730' },
  { key: 'area', label: 'Area code', placeholder: '225' },
  { key: 'cidNum', label: 'Caller ID number', placeholder: '2255551234' },
  { key: 'cidName', label: 'Caller ID name', placeholder: 'Acme Corp' },
  { key: 'e911', label: '911 caller ID', placeholder: 'same as caller ID number' },
  { key: 'server', label: 'Server', placeholder: 'core2-ord' },
  { key: 'tz', label: 'Timezone', placeholder: 'US/Central' },
  { key: 'pin', label: 'Default voicemail PIN', placeholder: '1234' },
  { key: 'scope', label: 'Scope', placeholder: 'Basic User' },
  { key: 'dialPerm', label: 'Dial permission', placeholder: 'US and Canada' },
  { key: 'emailDom', label: 'Email domain', placeholder: 'acme.com', hint: 'Builds first.last@domain. Blank = no email.' },
  { key: 'timeout', label: 'Answer timeout', placeholder: '25' },
]

export default function MetaToNs() {
  const [files, setFiles] = useState({ lines: null, devices: null, dns: null })
  const [fileNames, setFileNames] = useState({ lines: '', devices: '', dns: '' })
  const [cfg, setCfg] = useState(DEFAULT_CFG)
  const [extOverrides, setExtOverrides] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [autoDetectLog, setAutoDetectLog] = useState([])

  function handleLoad(slotKey, rows, name) {
    if (!rows) {
      setFiles(f => ({ ...f, [slotKey]: null }))
      setFileNames(n => ({ ...n, [slotKey]: '' }))
      return
    }

    // Auto-detect: if the file doesn't match the slot, put it in the right slot
    const detected = detectType(rows)
    const targetKey = detected || slotKey
    const log = detected && detected !== slotKey
      ? `"${name}" auto-detected as ${SLOT_META[detected]?.label ?? detected}`
      : null

    setFiles(f => ({ ...f, [targetKey]: rows }))
    setFileNames(n => ({ ...n, [targetKey]: name || '' }))
    setResult(null)
    setError('')
    setExtOverrides({})
    if (log) setAutoDetectLog(prev => [...prev.slice(-2), log])
  }

  function setField(k, v) { setCfg(c => ({ ...c, [k]: v })) }

  // Recompute collision check for build button gating
  const hasCollisions = useMemo(() => {
    if (!files.lines) return false
    const digits = parseInt(cfg.extDigits, 10) || 4
    const seen = {}
    for (const ln of files.lines) {
      const dn = normDN(ln['Directory number'])
      if (!dn) continue
      const ext = extOverrides[dn] !== undefined ? extOverrides[dn] : dn.slice(-digits)
      if (seen[ext] && seen[ext] !== dn) return true
      seen[ext] = dn
    }
    return false
  }, [files.lines, cfg.extDigits, extOverrides])

  const canBuild = files.lines && files.devices && cfg.domain.trim() && !hasCollisions

  function handleBuild() {
    setError('')
    setResult(null)

    const needCols = ['Directory number', 'Name']
    const missing = needCols.filter(c => !(files.lines[0] && c in files.lines[0]))
    if (missing.length) {
      setError(`The Lines file is missing columns: ${missing.join(', ')}. Check that Lines and Managed Devices files aren't swapped.`)
      return
    }

    try {
      const R = transform(files.lines, files.devices, files.dns, {
        ...cfg,
        extDigits: parseInt(cfg.extDigits, 10) || 4,
        extOverrides,
        e911: cfg.e911.trim() || cfg.cidNum.trim(),
      })
      setResult(R)
    } catch (e) {
      setError('Something went wrong reading those files: ' + e.message)
    }
  }

  function buildDownloads() {
    if (!result) return []
    const d = cfg.domain
    return [
      { name: `user_import_${d}.csv`, csv: toCSV(USER_COLS, result.users), count: result.users.length + ' users', note: 'Import first', blocked: false },
      { name: `phones_import_${d}.csv`, csv: toCSV(PHONE_COLS, result.phones), count: result.phones.length + ' phones', note: 'Import second', blocked: false },
      { name: `import_address_endpoints_${d}.csv`, csv: toCSV(E911_COLS, result.e911), count: result.e911.length + ' rows', note: 'Fill addresses before importing', blocked: true },
      { name: `_REVIEW_${d}.csv`, csv: toCSV(REVIEW_COLS, result.review), count: result.review.length + ' items', note: 'Worklist — not for import', blocked: false },
    ]
  }

  const downloads = buildDownloads()
  const sidecars = result ? result.review.filter(r => r.Issue.startsWith('Sidecar')).length : 0

  return (
    <div className="mns-root">
      <div className="design-hero hero-grid" style={{ marginBottom: 24 }}>
        <div>
          <div className="survey-kicker">Tools · Config</div>
          <h1>Metaswitch → NetSapiens</h1>
          <p>Drop in Business Group exports, fill customer settings, and download ready-to-import NS files. Runs entirely in your browser — nothing leaves this computer.</p>
        </div>
      </div>

      {/* ── Step 1: File slots ───────────────────────────── */}
      <div className="mns-section">
        <div className="mns-step-label">1 · Metaswitch exports — drop any file in any slot, auto-detection handles the rest</div>
        <div className="mns-slots">
          {(['lines', 'devices', 'dns']).map(k => (
            <FileSlot
              key={k}
              fileKey={k}
              label={SLOT_META[k].label}
              hint={files[k] ? `${files[k].length} rows — ${fileNames[k]}` : SLOT_META[k].hint}
              required={k !== 'dns'}
              rows={files[k]}
              onLoad={handleLoad}
            />
          ))}
        </div>
        {autoDetectLog.length > 0 && (
          <div className="mns-detect-log">
            {autoDetectLog.map((msg, i) => (
              <span key={i} className="mns-detect-chip">↙ {msg}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 2: Settings ─────────────────────────────── */}
      <div className="mns-section">
        <div className="mns-step-label">2 · Customer settings</div>
        <div className="mns-grid">
          {FIELDS.map(({ key, label, req, placeholder, hint }) => (
            <div key={key} className="mns-field">
              <label className="mns-label">{label}{req && <span className="mns-req"> *</span>}</label>
              <input
                className="mns-input"
                type="text"
                value={cfg[key]}
                onChange={e => setField(key, e.target.value)}
                placeholder={placeholder}
              />
              {hint && <div className="mns-hint">{hint}</div>}
            </div>
          ))}
          <div className="mns-field">
            <label className="mns-label">Extension digits</label>
            <select
              className="mns-input"
              value={cfg.extDigits}
              onChange={e => { setField('extDigits', e.target.value); setExtOverrides({}) }}
            >
              <option value="3">Last 3 digits</option>
              <option value="4">Last 4 digits (default)</option>
              <option value="5">Last 5 digits</option>
            </select>
            <div className="mns-hint">How many digits to slice from the DN for the extension.</div>
          </div>
        </div>
        <label className="mns-checkline">
          <input type="checkbox" checked={cfg.line2} onChange={e => setField('line2', e.target.checked)} />
          Put the extension on Line 1 and Line 2
        </label>
      </div>

      {/* ── Step 2b: Extension editor ────────────────────── */}
      {files.lines && files.lines.length > 0 && (
        <div className="mns-section">
          <div className="mns-step-label">
            2b · Extension assignments — edit any extension inline, collisions highlighted in red
          </div>
          <ExtEditor
            lines={files.lines}
            extDigits={cfg.extDigits}
            extOverrides={extOverrides}
            onChange={setExtOverrides}
          />
        </div>
      )}

      {/* ── Step 3: Build ────────────────────────────────── */}
      <div className="mns-section">
        <div className="mns-step-label">3 · Build</div>
        {error && <div className="mns-error">{error}</div>}
        {hasCollisions && (
          <div className="mns-error">Fix extension collisions in step 2b before building.</div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canBuild}
          onClick={handleBuild}
        >
          {result ? 'Rebuild import files' : 'Build import files'}
        </button>
        {!canBuild && !hasCollisions && (
          <div className="mns-hint" style={{ marginTop: 8 }}>
            {!files.lines && 'Upload the Lines CSV. '}
            {!files.devices && 'Upload the Managed Devices CSV. '}
            {!cfg.domain.trim() && 'Enter the NS domain.'}
          </div>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────── */}
      {result && (
        <div className="mns-section">
          <div className="mns-step-label">Results</div>

          {/* Stats */}
          <div className="mns-stats">
            {[
              { n: result.users.length, k: 'Users', ok: true },
              { n: result.phones.length, k: 'Phones', ok: true },
              { n: result.review.length, k: 'To review', ok: result.review.length === 0 },
              { n: sidecars, k: 'Sidecars', ok: sidecars === 0 },
              { n: result.spare.length, k: 'Spare DNs', ok: null },
            ].map(({ n, k, ok }) => (
              <div key={k} className="mns-stat">
                <div className={`mns-stat-v${ok === false ? ' is-warn' : ok ? ' is-ok' : ''}`}>{n}</div>
                <div className="mns-stat-k">{k}</div>
              </div>
            ))}
          </div>

          {/* Downloads */}
          <div className="mns-downloads">
            {downloads.map((dl) => (
              <div key={dl.name} className={`mns-dl-row${dl.blocked ? ' is-blocked' : ''}`}>
                <div className="mns-dl-info">
                  <div className="mns-dl-name">{dl.name}</div>
                  {dl.note && <div className="mns-dl-note">{dl.note}</div>}
                </div>
                <div className="mns-dl-count">{dl.count}</div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => downloadCSV(dl.name, dl.csv)}
                >
                  Download
                </button>
              </div>
            ))}
          </div>

          {/* Review table */}
          <div className="mns-step-label" style={{ marginTop: 24 }}>Review before importing</div>
          {result.review.length === 0 ? (
            <div className="parse-note parse-ok">Nothing to review — every line and device mapped cleanly.</div>
          ) : (
            <div className="mns-table-wrap">
              <table className="mns-table">
                <thead>
                  <tr>{REVIEW_COLS.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.review.slice(0, 60).map((r, i) => (
                    <tr key={i}>
                      <td className="mns-issue">{r.Issue}</td>
                      <td>{r.Key}</td>
                      <td>{r.Detail}</td>
                      <td>{r['Action Needed']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.review.length > 60 && (
                <div className="mns-table-more">
                  Showing 60 of {result.review.length}. Download the review CSV for the rest.
                </div>
              )}
            </div>
          )}

          {/* Import order */}
          <div className="mns-step-label" style={{ marginTop: 24 }}>Import order</div>
          <ol className="mns-steps">
            <li>Work every item in the review table above. <strong>Do not import with unresolved items.</strong></li>
            <li>Import <strong>users</strong> first.</li>
            <li>Import <strong>phones</strong> second, so extensions exist to bind to.</li>
            <li>Fill the address columns in the <strong>E911</strong> file, then import it. Addresses are intentionally blank.</li>
            <li>Export the config back out of NetSapiens and compare against these files before cutover.</li>
          </ol>
        </div>
      )}
    </div>
  )
}
