/**
 * MigrationWorkspace — Metaswitch → NetSapiens guided migration.
 * Step wizard: Account Setup → Users → Devices → System Config → Build
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadJobMigration, saveJobMigration } from '../lib/jobModel.js'
import { makeId } from '../lib/surveyModel.js'
import { getJob, getAccount, saveAccount } from '../lib/repo.js'
import { createEmptyRoute } from '../lib/callFlowShape.js'
import {
  analyzeDeviceExtensionAssignments,
  analyzeMigrationExtensions,
  cleanImportedField,
  cleanMigrationName,
  extensionsByDn,
  migrationE911Fields,
  migrationUserFromLine,
  normalizeMigrationExtension,
} from '../lib/migrationExtensions.js'

/* ── CSV helpers ──────────────────────────────────────────── */
function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++ } else q = false }
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
  const head = rows[0].map(cleanImportedField)
  const out = []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every(v => v.trim() === '')) continue
    const o = {}
    head.forEach((h, j) => o[h] = cleanImportedField(rows[i][j]))
    out.push(o)
  }
  return out
}

function toCSV(cols, rows) {
  const esc = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
  return [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n') + '\r\n'
}

function detectType(rows) {
  if (!rows?.length) return null
  const keys = new Set(Object.keys(rows[0]))
  if (keys.has('MAC Address') && keys.has('Device Model')) return 'devices'
  if (keys.has('Directory number') && keys.has('Name')) return 'lines'
  if (keys.has('Directory number')) return 'dns'
  return null
}

const normDN  = s => { let d = String(s||'').replace(/\D/g,''); if(d.length===11&&d[0]==='1') d=d.slice(1); return d }
const normMAC = s => String(s||'').replace(/[^0-9A-Fa-f]/g,'').toLowerCase()

const MODEL_MAP = {
  'polycom vvx 150':'Polycom VVX150','polycom vvx 250':'Polycom VVX250','polycom vvx 300':'Polycom VVX300',
  'polycom vvx 350':'Polycom VVX350','polycom vvx 400':'Polycom VVX400','polycom vvx 410':'Polycom VVX410',
  'polycom vvx 450':'Polycom VVX450','polycom vvx 500':'Polycom VVX500','polycom vvx 501':'Polycom VVX501',
  'polycom vvx 600':'Polycom VVX600','polycom vvx 601':'Polycom VVX601','polycom trio 8800':'Polycom Trio8800',
  'yealink t21':'Yealink T21','yealink t21p e2':'Yealink T21P_E2','yealink t42s':'Yealink T42S',
  'yealink t46s':'Yealink T46S','yealink t46g':'Yealink T46G','yealink t48s':'Yealink T48S',
  'yealink t54w':'Yealink T54W','yealink t57w':'Yealink T57W','yealink t53w':'Yealink T53W',
  'yealink t33g':'Yealink T33G','yealink t31g':'Yealink T31G','yealink t31p':'Yealink T31P',
  'yealink t41s':'Yealink T41S','yealink t43u':'Yealink T43U','yealink t53':'Yealink T53',
}

/* ── NS column definitions ────────────────────────────────── */
const USER_COLS = [
  'extension*','domain','first name*','last name*','login','portal password',
  'email address','voicemail pin','department','site','vmail enabled',
  'answer timeout','timezone','area code','callerid number','callerid name',
  '911 callerid','dial plan','dial permission','audio directory','visual directory',
  'vmail_transcribe','email_vmail','email_vmail_enable','add phone extension','scope',
]
const PHONE_COLS = ['MAC','Model','Server','Line 1','Line 2','Line 3','Line 4','Line 5','Line 6','Notes']
const E911_COLS  = ['call_back_number','address_name','caller_name','address_line_1','address_line_2','country_code','state_code','city','zip','location','user/site','assign']

/* ── Default data ─────────────────────────────────────────── */
function emptyMigration() {
  return {
    domain:'', mainBTN:'', callerIdNum:'', callerIdName:'',
    e911Address1:'', e911Address2:'', e911City:'', e911State:'', e911Zip:'',
    server:'core2-ord', tz:'US/Central',
    area:'', pin:'1234', scope:'Basic User',
    dialPerm:'US and Canada', emailDom:'', timeout:'25',
    line2:true,
    users:[], devices:[],
    autoAttendants:[], callFlows:[], huntGroups:[], buttonLayouts:[],
    // autoAttendants[]: { id, name, scheduleNotes, timeoutType, timeoutDest, menuKeys:[{id,digit,destType,destValue}] }
    // buttonLayouts[]:  { id, extension, keyRows:[{id,type,value,label}], sidecarNotes, notes }
    build:{},
  }
}

/* ── Migration → Call Flow mapper ────────────────────────── */
function migrationToRoutes(data) {
  const callFlows = data.callFlows || []
  const aas = data.autoAttendants || []
  const hgs = data.huntGroups || []

  const hgSummary = hgs.map(h =>
    [h.name, h.type && `(${h.type})`, h.members && `Members: ${h.members}`].filter(Boolean).join(' — ')
  ).join('\n')

  function buildRoute(cf, aaIndex) {
    const aa = aas[aaIndex] || null
    const aaFields = {}
    if (aa) {
      aaFields.enabled = 'Yes'
      aaFields.greeting = aa.name || ''
      aaFields.notes = aa.scheduleNotes || ''
      aaFields.timeoutAction = [aa.timeoutDest, aa.timeoutType].filter(Boolean).join(': ') || ''
      ;(aa.menuKeys || []).forEach(k => {
        const digit = String(k.digit || '')
        if (digit !== '') {
          aaFields[`option${digit}`] = k.destValue || k.destType || ''
          aaFields[`optionType${digit}`] = k.destType || ''
        }
      })
    }

    const mainNumbers = cf && cf.phoneNumber
      ? [{ id: makeId(), number: cf.phoneNumber, label: cf.normalDest || '' }]
      : []

    return createEmptyRoute({
      name: cf ? (cf.phoneNumber || cf.normalDest || 'Main route') : 'Main route',
      mainNumbers,
      autoAttendant: aaFields,
      callFlow: {
        daytimePath: cf?.normalDest || (aa?.name ? `AA: ${aa.name}` : ''),
        afterHoursPath: cf?.closedDest || '',
        ringGroups: hgSummary,
        notes: cf?.notes || '',
      },
    })
  }

  if (!callFlows.length) {
    return [buildRoute(null, 0)]
  }
  return callFlows.map((cf, i) => buildRoute(cf, i))
}

/* ── Download helper ──────────────────────────────────────── */
function downloadCSV(name, text) {
  const b = new Blob([text], { type:'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(b); a.download = name
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 400)
}

/* ── Shared primitives ────────────────────────────────────── */
function Field({ label, hint, children }) {
  return (
    <div className="mig-field">
      <label className="mig-label">{label}</label>
      {children}
      {hint && <div className="mns-hint">{hint}</div>}
    </div>
  )
}
function MInput({ value, onChange, placeholder, type='text', className='' }) {
  return <input className={`mns-input ${className}`} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
}
function MSelect({ value, onChange, options }) {
  return (
    <select className="mns-input" value={value} onChange={e=>onChange(e.target.value)}>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  )
}

/* ── Button Layout paged key builder ─────────────────────── */
const KEY_TYPES = [
  { value:'line',      label:'Line'        },
  { value:'blf',       label:'BLF'         },
  { value:'speeddial', label:'Speed Dial'  },
  { value:'callpark',  label:'Call Park'   },
  { value:'intercom',  label:'Intercom'    },
  { value:'dtmf',      label:'DTMF'        },
  { value:'empty',     label:'Empty'       },
]
const KEY_VALUE_HINT = { line:'Extension', blf:'Extension to monitor', speeddial:'Phone number', callpark:'Park orbit (optional)', intercom:'Extension', dtmf:'Digits', empty:'' }
const KEY_LABEL_SHOW = new Set(['blf','speeddial'])

function KeyList({ keys = [], onChange }) {
  function addKey() { onChange([...keys, { id:makeId(), type:'line', value:'', label:'' }]) }
  function update(id, f, v) { onChange(keys.map(k => k.id===id ? {...k,[f]:v} : k)) }
  function remove(id) { onChange(keys.filter(k => k.id!==id)) }
  function move(idx, dir) {
    const next = [...keys]; const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]; onChange(next)
  }
  return (
    <div className="mig-key-builder">
      {keys.map((k, idx) => (
        <div key={k.id} className="mig-key-row">
          <span className="mig-key-num">{idx + 1}</span>
          <select className="mig-key-type-sel" value={k.type} onChange={e=>update(k.id,'type',e.target.value)}>
            {KEY_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {k.type !== 'empty' && (
            <input className="mig-key-val-input" value={k.value} placeholder={KEY_VALUE_HINT[k.type]||'Value'}
              onChange={e=>update(k.id,'value',e.target.value)}/>
          )}
          {KEY_LABEL_SHOW.has(k.type) && (
            <input className="mig-key-label-input" value={k.label} placeholder="Label (optional)"
              onChange={e=>update(k.id,'label',e.target.value)}/>
          )}
          <div className="mig-key-actions">
            <button type="button" className="mig-key-move" onClick={()=>move(idx,-1)} disabled={idx===0}>↑</button>
            <button type="button" className="mig-key-move" onClick={()=>move(idx,1)} disabled={idx===keys.length-1}>↓</button>
            <button type="button" className="mig-del-btn" onClick={()=>remove(k.id)}>✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-secondary mig-key-add" onClick={addKey}>+ Add key</button>
    </div>
  )
}

function PagedKeyBuilder({ pages = [], onChange }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const safeIdx = Math.min(activeIdx, pages.length - 1)

  function addPage() {
    const n = pages.length + 1
    const label = n === 2 ? 'Sidecar' : `Page ${n}`
    const next = [...pages, { id:makeId(), label, keys:[] }]
    onChange(next)
    setActiveIdx(next.length - 1)
  }
  function removePage(idx) {
    if (pages.length <= 1) return
    const next = pages.filter((_,i)=>i!==idx)
    onChange(next)
    setActiveIdx(Math.min(safeIdx, next.length - 1))
  }
  function renamePage(idx, label) {
    onChange(pages.map((p,i)=>i===idx?{...p,label}:p))
  }
  function setPageKeys(idx, keys) {
    onChange(pages.map((p,i)=>i===idx?{...p,keys}:p))
  }

  const active = pages[safeIdx]

  return (
    <div className="mig-paged-builder">
      {/* Tab strip */}
      <div className="mig-page-tabs">
        {pages.map((p, i) => (
          <div key={p.id} className={`mig-page-tab${i===safeIdx?' is-active':''}`}>
            {i === safeIdx
              ? <input className="mig-page-tab-input" value={p.label}
                  onChange={e=>renamePage(i, e.target.value)}
                  onFocus={e=>e.target.select()}/>
              : <button type="button" className="mig-page-tab-btn" onClick={()=>setActiveIdx(i)}>{p.label}</button>
            }
            {pages.length > 1 && (
              <button type="button" className="mig-page-tab-remove" onClick={()=>removePage(i)} title="Remove page">✕</button>
            )}
          </div>
        ))}
        <button type="button" className="mig-page-add-btn" onClick={addPage}>+ Page</button>
      </div>

      {/* Active page key list */}
      {active && (
        <div className="mig-page-body">
          <KeyList keys={active.keys||[]} onChange={keys=>setPageKeys(safeIdx,keys)}/>
        </div>
      )}
    </div>
  )
}

/* ── Auto Attendant menu key builder ─────────────────────── */
const DIGITS = ['0','1','2','3','4','5','6','7','8','9','*','#']
const DEST_TYPES = [
  { value:'extension',     label:'Extension'      },
  { value:'huntgroup',     label:'Hunt Group'     },
  { value:'autoattendant', label:'Auto Attendant' },
  { value:'voicemail',     label:'Voicemail'      },
  { value:'directory',     label:'Directory'      },
  { value:'hangup',        label:'Hang Up'        },
]
const DEST_NEEDS_VALUE = new Set(['extension','huntgroup','autoattendant','voicemail'])

function MenuKeyBuilder({ menuKeys = [], onChange }) {
  function addKey() {
    const usedDigits = new Set(menuKeys.map(k=>k.digit))
    const next = DIGITS.find(d=>!usedDigits.has(d)) || '0'
    onChange([...menuKeys, { id:makeId(), digit:next, destType:'extension', destValue:'' }])
  }
  function update(id, f, v) { onChange(menuKeys.map(k => k.id===id ? {...k,[f]:v} : k)) }
  function remove(id) { onChange(menuKeys.filter(k => k.id!==id)) }
  return (
    <div className="mig-key-builder">
      {menuKeys.map(k => (
        <div key={k.id} className="mig-key-row">
          <span className="mig-aa-press">Press</span>
          <select className="mig-key-digit-sel" value={k.digit} onChange={e=>update(k.id,'digit',e.target.value)}>
            {DIGITS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <span className="mig-aa-arrow">→</span>
          <select className="mig-key-type-sel" value={k.destType} onChange={e=>update(k.id,'destType',e.target.value)}>
            {DEST_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {DEST_NEEDS_VALUE.has(k.destType) && (
            <input className="mig-key-val-input" value={k.destValue} placeholder="Ext / name / number"
              onChange={e=>update(k.id,'destValue',e.target.value)}/>
          )}
          <button type="button" className="mig-del-btn" onClick={()=>remove(k.id)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary mig-key-add" onClick={addKey}>+ Add key</button>
    </div>
  )
}

/* ── Upload slot ──────────────────────────────────────────── */
function UploadSlot({ label, hint, loaded, count, onFile }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  function handle(file) {
    if (!file) return
    const r = new FileReader()
    r.onload = () => { try { onFile(parseCSV(r.result), file.name) } catch { onFile(null, null) } }
    r.readAsText(file)
  }
  return (
    <div className={`mns-slot${loaded?' is-loaded':''}${drag?' is-dragging':''}`}
      onClick={()=>ref.current?.click()}
      onDragOver={e=>{e.preventDefault();setDrag(true)}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}}>
      <span className={`mns-led${loaded?' is-on':''}`}/>
      <div className="mns-slot-text">
        <div className="mns-slot-name">{label}</div>
        <div className="mns-slot-meta">{loaded?`${count} rows loaded`:hint}</div>
      </div>
      <input ref={ref} type="file" accept=".csv" style={{display:'none'}} onChange={e=>handle(e.target.files[0])}/>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 1 — Account Setup
   ════════════════════════════════════════════════════════════ */
function StepAccount({ data, onChange }) {
  function set(f, v) { onChange({ ...data, [f]: v }) }
  const SCOPES = ['Basic User','Simple User','Call Center Agent','Call Center Supervisor','Office Manager','Site Manager']
  const PERMS  = ['US and Canada','National Lite','Video Conference Only','Deny All']
  const TZS    = ['US/Central','US/Eastern','US/Mountain','US/Pacific','US/Hawaii','US/Alaska']
  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Enter the NetSapiens account settings. These defaults apply to all users — you can override per-user in the next step.</p>

      <div className="mig-field-group">
        <div className="mig-field-group-title">Identity</div>
        <div className="mig-field-row">
          <Field label="NS Domain *">
            <MInput value={data.domain} onChange={v=>set('domain',v)} placeholder="ACME-15730"/>
          </Field>
          <Field label="Main BTN">
            <MInput value={data.mainBTN} onChange={v=>set('mainBTN',v)} placeholder="2255551000"/>
          </Field>
          <Field label="Caller ID Number">
            <MInput value={data.callerIdNum} onChange={v=>set('callerIdNum',v)} placeholder="2255551000"/>
          </Field>
          <Field label="Caller ID Name">
            <MInput value={data.callerIdName} onChange={v=>set('callerIdName',v)} placeholder="Acme Corp"/>
          </Field>
        </div>
      </div>

      <div className="mig-field-group">
        <div className="mig-field-group-title">Network</div>
        <div className="mig-field-row">
          <Field label="Server">
            <MInput value={data.server} onChange={v=>set('server',v)} placeholder="core2-ord"/>
          </Field>
          <Field label="Timezone">
            <MSelect value={data.tz} onChange={v=>set('tz',v)} options={TZS}/>
          </Field>
          <Field label="Area Code">
            <MInput value={data.area} onChange={v=>set('area',v)} placeholder="225"/>
          </Field>
        </div>
      </div>

      <div className="mig-field-group">
        <div className="mig-field-group-title">User Defaults</div>
        <div className="mig-field-row">
          <Field label="Default Scope">
            <MSelect value={data.scope} onChange={v=>set('scope',v)} options={SCOPES}/>
          </Field>
          <Field label="Dial Permission">
            <MSelect value={data.dialPerm} onChange={v=>set('dialPerm',v)} options={PERMS}/>
          </Field>
          <Field label="Default VM PIN">
            <MInput value={data.pin} onChange={v=>set('pin',v)} placeholder="1234"/>
          </Field>
          <Field label="Answer Timeout (s)">
            <MInput value={data.timeout} onChange={v=>set('timeout',v)} placeholder="25"/>
          </Field>
        </div>
        <div className="mig-field-row">
          <Field label="Email Domain" hint="Builds first.last@domain.com automatically">
            <MInput value={data.emailDom} onChange={v=>set('emailDom',v)} placeholder="acmecorp.com"/>
          </Field>
        </div>
        <label className="mns-checkline">
          <input type="checkbox" checked={!!data.line2} onChange={e=>set('line2',e.target.checked)}/>
          Put extension on Line 1 and Line 2
        </label>
      </div>

      <div className="mig-field-group">
        <div className="mig-field-group-title">E911</div>
        <div className="mig-field-row">
          <Field label="Address 1">
            <MInput value={data.e911Address1??data.e911Address??''} onChange={v=>set('e911Address1',v)} placeholder="123 Main St"/>
          </Field>
          <Field label="Address 2">
            <MInput value={data.e911Address2||''} onChange={v=>set('e911Address2',v)} placeholder="Suite 200"/>
          </Field>
        </div>
        <div className="mig-field-row">
          <Field label="City">
            <MInput value={data.e911City||''} onChange={v=>set('e911City',v)} placeholder="Baton Rouge"/>
          </Field>
          <Field label="State">
            <MInput value={data.e911State||''} onChange={v=>set('e911State',v.toUpperCase().slice(0,2))} placeholder="LA"/>
          </Field>
          <Field label="ZIP">
            <MInput value={data.e911Zip||''} onChange={v=>set('e911Zip',v)} placeholder="70801"/>
          </Field>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 2 — Users
   ════════════════════════════════════════════════════════════ */
function StepUsers({ data, onChange }) {
  const [importLog, setImportLog] = useState([])

  function handleCSV(rows, filename) {
    const type = detectType(rows)
    if (!type || type !== 'lines') {
      setImportLog(l=>[...l.slice(-2), `"${filename}" — not a Lines file`])
      return
    }
    const users = rows
      .map(ln => migrationUserFromLine(ln, { id:makeId(), defaultPin:data.pin||'1234' }))
      .filter(Boolean)
    onChange({ ...data, users })
    setImportLog(l=>[...l.slice(-2), `${users.length} users imported from "${filename}" — enter each NetSapiens extension below`])
  }

  const extRows = data.users || []
  const { missingIds, collisions } = useMemo(
    () => analyzeMigrationExtensions(extRows),
    [extRows],
  )

  function updateUser(id, f, v) { onChange({ ...data, users:(data.users||[]).map(u=>u.id===id?{...u,[f]:v}:u) }) }
  function addUser() { onChange({ ...data, users:[...(data.users||[]),{id:makeId(),dn:'',ext:'',firstName:'',lastName:'-',email:'',vmPin:data.pin||'1234',dept:'',site:'',did:''}] }) }
  function removeUser(id) { onChange({ ...data, users:(data.users||[]).filter(u=>u.id!==id) }) }

  const SCOPES = ['Basic User','Simple User','Call Center Agent','Call Center Supervisor','Office Manager','Site Manager']

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Drop the Metaswitch Lines CSV to auto-fill users, then enter each NetSapiens extension. The export does not provide extensions, so none are guessed from the phone number.</p>

      <div className="mig-field-group">
        <div className="mig-field-group-title">Import from Metaswitch</div>
        <div className="mns-slots">
          <UploadSlot label="Lines CSV" hint="Directory number + Name columns"
            loaded={(data.users||[]).length>0} count={(data.users||[]).length}
            onFile={(rows,name)=>handleCSV(rows,name)}/>
        </div>
        {importLog.length > 0 && (
          <div className="mns-detect-log" style={{marginTop:8}}>
            {importLog.map((m,i)=><span key={i} className="mns-detect-chip">✓ {m}</span>)}
          </div>
        )}
      </div>

      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Users
          <span className="mig-count-badge">{(data.users||[]).length}</span>
          {missingIds.size > 0 && <span className="mig-warn-badge">{missingIds.size} extension{missingIds.size>1?'s':''} required</span>}
          {collisions.size > 0 && <span className="mig-warn-badge">{collisions.size} collision{collisions.size>1?'s':''}</span>}
        </div>

        {missingIds.size > 0 && (
          <div className="mns-error" style={{marginBottom:10}}>
            Enter a custom extension for every user before building the NetSapiens imports.
          </div>
        )}
        {collisions.size > 0 && (
          <div className="mns-error" style={{marginBottom:10}}>
            {collisions.size} extension collision{collisions.size>1?'s':''} detected — fix highlighted rows before building.
          </div>
        )}

        {extRows.length > 0 && (
          <>
            <div className="mig-table-wrap">
              <table className="mns-table">
                <thead><tr>
                  <th>DN</th><th>Extension</th><th>First</th><th>Last</th>
                  <th>Email</th><th>Dept</th><th>Scope</th><th></th>
                </tr></thead>
                <tbody>
                  {extRows.map(u => {
                    const clash = collisions.has(u.ext)
                    const missing = missingIds.has(u.id)
                    return (
                      <tr key={u.id} className={clash||missing?'mns-row-collision':''}>
                        <td className="mns-td-mono">{u.dn||'—'}</td>
                        <td>
                          <input
                            className={`mns-ext-input${clash||missing?' is-collision':''}`}
                            value={u.ext||''}
                            onChange={e=>updateUser(u.id,'ext',normalizeMigrationExtension(e.target.value))}
                            placeholder="Required"
                            inputMode="numeric"
                          />
                          {(clash||missing) && <span className="mns-collision-badge">!</span>}
                        </td>
                        <td><input className="mig-cell-input" value={u.firstName} onChange={e=>updateUser(u.id,'firstName',e.target.value)} onBlur={e=>updateUser(u.id,'firstName',cleanMigrationName(e.target.value))}/></td>
                        <td><input className="mig-cell-input" value={u.lastName} onChange={e=>updateUser(u.id,'lastName',e.target.value)} onBlur={e=>updateUser(u.id,'lastName',cleanMigrationName(e.target.value)||'-')}/></td>
                        <td><input className="mig-cell-input" value={u.email} onChange={e=>updateUser(u.id,'email',e.target.value)} placeholder={data.emailDom?`first.last@${data.emailDom}`:'—'}/></td>
                        <td><input className="mig-cell-input" value={u.dept} onChange={e=>updateUser(u.id,'dept',e.target.value)}/></td>
                        <td>
                          <select className="mig-cell-select" value={u.scope||data.scope} onChange={e=>updateUser(u.id,'scope',e.target.value)}>
                            {SCOPES.map(s=><option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td><button type="button" className="mig-del-btn" onClick={()=>removeUser(u.id)}>✕</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button type="button" className="btn btn-secondary" style={{marginTop:extRows.length?8:0}} onClick={addUser}>+ Add user</button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 3 — Devices
   ════════════════════════════════════════════════════════════ */
function StepDevices({ data, onChange }) {
  const [importLog, setImportLog] = useState([])

  // Only explicitly entered extensions may be assigned to devices.
  const extByDN = useMemo(() => extensionsByDn(data.users), [data.users])
  const { duplicateExtensions, deviceCounts } = useMemo(
    () => analyzeDeviceExtensionAssignments(data.devices, extByDN),
    [data.devices, extByDN],
  )

  function handleCSV(rows, filename) {
    const type = detectType(rows)
    if (!type || type !== 'devices') {
      setImportLog(l=>[...l.slice(-2), `"${filename}" — not a Managed Devices file`])
      return
    }
    const devices = rows.map(d => {
      const mac = normMAC(d['MAC Address'])
      if (!mac) return null
      const key = String(d['Device Model']||'').trim().replace(/\s+/g,' ').toLowerCase()
      const model = MODEL_MAP[key] || d['Device Model'] || ''
      const dn = normDN(d['Subscriber Directory Number'])
      return { id:makeId(), mac, model, dn, line1:'', line2:'', notes:d['Description']||'' }
    }).filter(Boolean)
    onChange({ ...data, devices })
    setImportLog(l=>[...l.slice(-2), `${devices.length} devices imported from "${filename}"`])
  }

  function updateDevice(id, f, v) { onChange({ ...data, devices:data.devices.map(d=>d.id===id?{...d,[f]:v}:d) }) }
  function addDevice() { onChange({ ...data, devices:[...(data.devices||[]),{id:makeId(),mac:'',model:'',dn:'',line1:'',line2:'',notes:''}] }) }
  function removeDevice(id) { onChange({ ...data, devices:(data.devices||[]).filter(d=>d.id!==id) }) }

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Drop the Managed Devices CSV to auto-fill. Line 1 is matched from the user list by DN automatically.</p>

      <div className="mig-field-group">
        <div className="mig-field-group-title">Import from Metaswitch</div>
        <div className="mns-slots">
          <UploadSlot label="Managed Devices CSV" hint="MAC Address + Device Model columns"
            loaded={(data.devices||[]).length>0} count={(data.devices||[]).length}
            onFile={(rows,name)=>handleCSV(rows,name)}/>
        </div>
        {importLog.length > 0 && (
          <div className="mns-detect-log" style={{marginTop:8}}>
            {importLog.map((m,i)=><span key={i} className="mns-detect-chip">✓ {m}</span>)}
          </div>
        )}
      </div>

      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Devices
          <span className="mig-count-badge">{(data.devices||[]).length}</span>
          {duplicateExtensions.size > 0 && (
            <span className="mig-warn-badge">
              {duplicateExtensions.size} shared extension{duplicateExtensions.size>1?'s':''}
            </span>
          )}
        </div>
        {duplicateExtensions.size > 0 && (
          <div className="mns-error" style={{marginBottom:10}}>
            {[...duplicateExtensions].map(ext => (
              <div key={ext}>
                Extension {ext} is assigned to {deviceCounts[ext]} devices.
              </div>
            ))}
          </div>
        )}
        {(data.devices||[]).length > 0 && (
          <div className="mig-table-wrap">
            <table className="mns-table">
              <thead><tr><th>MAC</th><th>Model</th><th>Line 1 (ext)</th><th>Line 2</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {data.devices.map(d => {
                  const autoExt = d.dn ? extByDN[d.dn] || '' : ''
                  const l1 = d.line1 || autoExt
                  const l2 = data.line2 ? (d.line2 || l1) : d.line2
                  const sharedExtension = duplicateExtensions.has(normalizeMigrationExtension(l1))
                  return (
                    <tr key={d.id} className={sharedExtension?'mns-row-collision':''}>
                      <td><input className="mig-cell-input mig-cell-mono" value={d.mac} onChange={e=>updateDevice(d.id,'mac',e.target.value)} placeholder="aabbccddeeff"/></td>
                      <td><input className="mig-cell-input" value={d.model} onChange={e=>updateDevice(d.id,'model',e.target.value)} placeholder="Yealink T54W"/></td>
                      <td className="mig-device-ext-cell">
                        <input className={`mig-cell-input${sharedExtension?' is-collision':''}`} value={l1} onChange={e=>updateDevice(d.id,'line1',e.target.value)} placeholder="1001"/>
                        {sharedExtension && <span className="mns-collision-badge" title={`Extension ${l1} is on multiple devices`}>!</span>}
                      </td>
                      <td><input className="mig-cell-input" value={l2} onChange={e=>updateDevice(d.id,'line2',e.target.value)}/></td>
                      <td><input className="mig-cell-input" value={d.notes} onChange={e=>updateDevice(d.id,'notes',e.target.value)}/></td>
                      <td><button type="button" className="mig-del-btn" onClick={()=>removeDevice(d.id)}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn btn-secondary" style={{marginTop:data.devices?.length?8:0}} onClick={addDevice}>+ Add device</button>
      </div>
    </div>
  )
}

/* ── Button Layout split-panel ────────────────────────────── */
function BLPanel({ layouts, users = [], onAdd, onUpdate, onRemove, onAutoPopulate }) {
  const [selectedId, setSelectedId] = useState(layouts[0]?.id || null)
  const selected = layouts.find(bl => bl.id === selectedId) || layouts[0] || null

  function handleAdd() { onAdd() }

  useEffect(() => {
    if (!selected && layouts.length) setSelectedId(layouts[0].id)
    if (selected && !layouts.find(bl => bl.id === selected.id)) {
      setSelectedId(layouts[0]?.id || null)
    }
  }, [layouts])

  // Count users not yet in layouts
  const existingExts = new Set(layouts.map(b => b.extension).filter(Boolean))
  const missingCount = users.filter(u => u.ext && !existingExts.has(u.ext)).length

  return (
    <div className="mig-sys-panel">
      {/* Auto-populate bar */}
      {users.length > 0 && (
        <div className="mig-bl-auto-bar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={missingCount === 0}
            onClick={onAutoPopulate}
          >
            {missingCount === 0
              ? '✓ All users added'
              : `Auto-populate ${missingCount} phone${missingCount !== 1 ? 's' : ''} from users`}
          </button>
          {layouts.length > 0 && missingCount > 0 && (
            <span className="mns-hint">Adds missing only — existing entries are kept.</span>
          )}
        </div>
      )}

      <div className="mig-bl-split">
        {/* Left: extension list */}
        <div className="mig-bl-list">
          {layouts.map(bl => (
            <button key={bl.id} type="button"
              className={`mig-bl-list-item${bl.id===selected?.id?' is-active':''}`}
              onClick={()=>setSelectedId(bl.id)}>
              <span className="mig-bl-item-ext">{bl.extension||<span style={{opacity:.4}}>No ext</span>}</span>
              <div className="mig-bl-item-meta">
                {bl.name && <span className="mig-bl-item-name">{bl.name}</span>}
                <span>
                  {(bl.pages||[]).reduce((s,p)=>s+(p.keys||[]).length,0)} keys
                  {(bl.pages||[]).length > 1 ? `, ${(bl.pages||[]).length} pages` : ''}
                </span>
              </div>
            </button>
          ))}
          <button type="button" className="mig-bl-add-btn" onClick={handleAdd}>+ Add phone</button>
        </div>

        {/* Right: editor */}
        {selected ? (
          <div className="mig-bl-editor">
            <div className="mig-bl-editor-head">
              <div style={{flex:1}}>
                <input className="mig-card-title-input" style={{width:'100%'}}
                  value={selected.extension}
                  onChange={e=>onUpdate(selected.id,'extension',e.target.value)}
                  placeholder="Extension (e.g. 1001)"/>
                {selected.name && (
                  <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{selected.name}</div>
                )}
              </div>
              <button type="button" className="mig-del-btn" style={{marginLeft:8}}
                onClick={()=>onRemove(selected.id)}>Remove phone</button>
            </div>
            <Field label="Key assignments">
              <PagedKeyBuilder
                pages={selected.pages||[{id:makeId(),label:'Page 1',keys:[]}]}
                onChange={pages=>onUpdate(selected.id,'pages',pages)}/>
            </Field>
            <Field label="Sidecar / expansion notes" hint="e.g. EXP50 attached — 20 BLF keys">
              <MInput value={selected.sidecarNotes||''} onChange={v=>onUpdate(selected.id,'sidecarNotes',v)} placeholder="EXP50 attached — 20 BLF keys"/>
            </Field>
          </div>
        ) : (
          <div className="mig-bl-empty">
            {users.length > 0
              ? <>Click <strong>Auto-populate</strong> above to add all users, or <strong>+ Add phone</strong> to add one manually.</>
              : <>No phones added yet — click <strong>+ Add phone</strong> to start.</>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 4 — System Config (AAs, Call Flows, Hunt Groups, Button Layouts)
   ════════════════════════════════════════════════════════════ */
function StepSystem({ data, onChange }) {
  const [tab, setTab] = useState('aa')
  const TABS = [
    { id:'aa',  label:'Auto Attendants',    count:(data.autoAttendants||[]).length },
    { id:'cf',  label:'Call Flows',         count:(data.callFlows||[]).length },
    { id:'hg',  label:'Hunt Groups',        count:(data.huntGroups||[]).length },
    { id:'bl',  label:'Button Layouts',     count:(data.buttonLayouts||[]).length },
  ]

  function addAA()        { onChange({ ...data, autoAttendants:[...(data.autoAttendants||[]),{id:makeId(),name:'',scheduleNotes:'',timeoutType:'voicemail',timeoutDest:'',menuKeys:[]}] }) }
  function updateAA(id,f,v) { onChange({ ...data, autoAttendants:data.autoAttendants.map(a=>a.id===id?{...a,[f]:v}:a) }) }
  function removeAA(id)   { onChange({ ...data, autoAttendants:data.autoAttendants.filter(a=>a.id!==id) }) }

  function addCF()        { onChange({ ...data, callFlows:[...(data.callFlows||[]),{id:makeId(),phoneNumber:'',normalDest:'',normalTF:'',closedDest:'',closedTF:'',notes:''}] }) }
  function updateCF(id,f,v) { onChange({ ...data, callFlows:data.callFlows.map(c=>c.id===id?{...c,[f]:v}:c) }) }
  function removeCF(id)   { onChange({ ...data, callFlows:data.callFlows.filter(c=>c.id!==id) }) }

  function addHG()        { onChange({ ...data, huntGroups:[...(data.huntGroups||[]),{id:makeId(),name:'',type:'Ring All',members:'',pilotExt:'',pilotNum:'',notes:''}] }) }
  function updateHG(id,f,v) { onChange({ ...data, huntGroups:data.huntGroups.map(h=>h.id===id?{...h,[f]:v}:h) }) }
  function removeHG(id)   { onChange({ ...data, huntGroups:data.huntGroups.filter(h=>h.id!==id) }) }

  function addBL()        { onChange({ ...data, buttonLayouts:[...(data.buttonLayouts||[]),{id:makeId(),extension:'',name:'',pages:[{id:makeId(),label:'Page 1',keys:[]}],sidecarNotes:'',notes:''}] }) }
  function updateBL(id,f,v) { onChange({ ...data, buttonLayouts:data.buttonLayouts.map(b=>b.id===id?{...b,[f]:v}:b) }) }
  function removeBL(id)   { onChange({ ...data, buttonLayouts:data.buttonLayouts.filter(b=>b.id!==id) }) }

  function autoPopulateLayouts() {
    const users = data.users || []
    const existing = new Set((data.buttonLayouts||[]).map(b => b.extension).filter(Boolean))
    const toAdd = users.filter(u => u.ext && !existing.has(u.ext))
    if (!toAdd.length) return
    const newLayouts = toAdd.map(u => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
      return {
        id: makeId(),
        extension: u.ext,
        name,
        pages: [{
          id: makeId(),
          label: 'Page 1',
          keys: [{ id: makeId(), type: 'line', value: u.ext, label: name }],
        }],
        sidecarNotes: '',
        notes: '',
      }
    })
    onChange({ ...data, buttonLayouts: [...(data.buttonLayouts||[]), ...newLayouts] })
  }

  const HG_TYPES = ['Ring All','Linear','Circular','Round Robin','Longest Idle']

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Document the routing elements you'll build manually in NS. This becomes your config checklist in the Build step.</p>

      {/* Sub-tabs */}
      <div className="mig-sys-tabs">
        {TABS.map(t => (
          <button key={t.id} type="button"
            className={`mig-sys-tab${tab===t.id?' is-active':''}`}
            onClick={()=>setTab(t.id)}>
            {t.label}
            {t.count > 0 && <span className="mig-count-badge" style={{marginLeft:6}}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Auto Attendants */}
      {tab === 'aa' && (
        <div className="mig-sys-panel">
          <p className="mig-hint">Add each AA, fill in schedule notes, set the no-input timeout action, then build the key menu.</p>
          {(data.autoAttendants||[]).map(aa => (
            <div key={aa.id} className="mig-card">
              <div className="mig-card-head">
                <input className="mig-card-title-input" value={aa.name} onChange={e=>updateAA(aa.id,'name',e.target.value)} placeholder="AA Name (e.g. Main Menu)"/>
                <button type="button" className="mig-del-btn" onClick={()=>removeAA(aa.id)}>✕</button>
              </div>
              <Field label="Schedule / hours notes">
                <MInput value={aa.scheduleNotes} onChange={v=>updateAA(aa.id,'scheduleNotes',v)} placeholder="M–F 8am–5pm, after-hours → VM"/>
              </Field>
              <Field label="No-input timeout" hint="What happens if the caller doesn't press anything">
                <div className="mig-inline-dest">
                  <select className="mig-key-type-sel" value={aa.timeoutType||'voicemail'} onChange={e=>updateAA(aa.id,'timeoutType',e.target.value)}>
                    {DEST_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {DEST_NEEDS_VALUE.has(aa.timeoutType||'voicemail') && (
                    <input className="mig-key-val-input" value={aa.timeoutDest||''} placeholder="Ext / name / number"
                      onChange={e=>updateAA(aa.id,'timeoutDest',e.target.value)}/>
                  )}
                </div>
              </Field>
              <Field label="Key menu">
                <MenuKeyBuilder
                  menuKeys={aa.menuKeys||[]}
                  onChange={keys=>updateAA(aa.id,'menuKeys',keys)}/>
              </Field>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addAA}>+ Add auto attendant</button>
        </div>
      )}

      {/* Call Flows */}
      {tab === 'cf' && (
        <div className="mig-sys-panel">
          <p className="mig-hint">One row per phone number. These become Inbound Call Management (ICM) rules in NS.</p>
          {(data.callFlows||[]).length > 0 && (
            <div className="mig-table-wrap">
              <table className="mns-table">
                <thead><tr>
                  <th>Phone Number</th><th>Normal Dest.</th><th>Normal TF</th>
                  <th>Closed Dest.</th><th>Closed TF</th><th>Notes</th><th></th>
                </tr></thead>
                <tbody>
                  {data.callFlows.map(cf => (
                    <tr key={cf.id}>
                      <td><input className="mig-cell-input mig-cell-mono" value={cf.phoneNumber} onChange={e=>updateCF(cf.id,'phoneNumber',e.target.value)} placeholder="2255551000"/></td>
                      <td><input className="mig-cell-input" value={cf.normalDest} onChange={e=>updateCF(cf.id,'normalDest',e.target.value)} placeholder="AA: Main Menu"/></td>
                      <td><input className="mig-cell-input" value={cf.normalTF} onChange={e=>updateCF(cf.id,'normalTF',e.target.value)} placeholder="Business Hours"/></td>
                      <td><input className="mig-cell-input" value={cf.closedDest} onChange={e=>updateCF(cf.id,'closedDest',e.target.value)} placeholder="Voicemail group"/></td>
                      <td><input className="mig-cell-input" value={cf.closedTF} onChange={e=>updateCF(cf.id,'closedTF',e.target.value)} placeholder="After Hours"/></td>
                      <td><input className="mig-cell-input" value={cf.notes} onChange={e=>updateCF(cf.id,'notes',e.target.value)}/></td>
                      <td><button type="button" className="mig-del-btn" onClick={()=>removeCF(cf.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="btn btn-secondary" style={{marginTop:data.callFlows?.length?8:0}} onClick={addCF}>+ Add call flow</button>
        </div>
      )}

      {/* Hunt Groups */}
      {tab === 'hg' && (
        <div className="mig-sys-panel">
          {(data.huntGroups||[]).map(hg => (
            <div key={hg.id} className="mig-card">
              <div className="mig-card-head">
                <input className="mig-card-title-input" value={hg.name} onChange={e=>updateHG(hg.id,'name',e.target.value)} placeholder="Group name (e.g. Sales)"/>
                <button type="button" className="mig-del-btn" onClick={()=>removeHG(hg.id)}>✕</button>
              </div>
              <div className="mig-field-row">
                <Field label="Ring type">
                  <MSelect value={hg.type} onChange={v=>updateHG(hg.id,'type',v)} options={HG_TYPES}/>
                </Field>
                <Field label="Pilot extension">
                  <MInput value={hg.pilotExt} onChange={v=>updateHG(hg.id,'pilotExt',v)} placeholder="1100"/>
                </Field>
                <Field label="Pilot number (DID)">
                  <MInput value={hg.pilotNum} onChange={v=>updateHG(hg.id,'pilotNum',v)} placeholder="2255551100"/>
                </Field>
              </div>
              <Field label="Members (extensions, comma-separated)">
                <MInput value={hg.members} onChange={v=>updateHG(hg.id,'members',v)} placeholder="1001, 1002, 1003"/>
              </Field>
              <Field label="Notes (overflow, distinctive ring)">
                <MInput value={hg.notes} onChange={v=>updateHG(hg.id,'notes',v)} placeholder="Overflow to voicemail after 30s"/>
              </Field>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addHG}>+ Add hunt group</button>
        </div>
      )}

      {/* Button Layouts */}
      {tab === 'bl' && (
        <BLPanel layouts={data.buttonLayouts||[]} users={data.users||[]} onAdd={addBL} onUpdate={updateBL} onRemove={removeBL} onAutoPopulate={autoPopulateLayouts}/>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 5 — Build
   ════════════════════════════════════════════════════════════ */
function StepBuild({ data, onChange, jobId }) {
  const [syncState, setSyncState] = useState(null) // null | 'syncing' | 'done' | 'no-account' | 'error'

  function toggleDone(key) {
    onChange({ ...data, build:{ ...(data.build||{}), [key]:!(data.build||{})[key] } })
  }

  async function handleSyncToCallFlow() {
    setSyncState('syncing')
    try {
      const job = jobId ? getJob(jobId) : null
      const accountId = job?.account_id
      if (!accountId) { setSyncState('no-account'); return }
      const account = getAccount(accountId)
      if (!account) { setSyncState('no-account'); return }
      const routes = migrationToRoutes(data)
      saveAccount({ ...account, routes })
      setSyncState('done')
      setTimeout(() => setSyncState(null), 3000)
    } catch (err) {
      console.error('Sync to call flow failed', err)
      setSyncState('error')
    }
  }

  const { userRows, phoneRows, e911Rows, reviewRows } = useMemo(() => {
    const domain = data.domain || 'DOMAIN'
    const e911 = migrationE911Fields(data)
    const userRows = (data.users||[]).map(u => {
      const extension = normalizeMigrationExtension(u.ext)
      const firstName = cleanMigrationName(u.firstName)
      const lastName = cleanMigrationName(u.lastName) || '-'
      const generatedEmail = data.emailDom && firstName && lastName !== '-'
        ? `${firstName}.${lastName}@${data.emailDom}`.toLowerCase()
        : ''
      return {
        'extension*':extension, 'domain':domain, 'first name*':firstName, 'last name*':lastName,
        'login':extension ? extension+'@'+domain : '', 'portal password':' ',
        'email address':u.email||generatedEmail,
        'voicemail pin':u.vmPin||data.pin, 'department':u.dept||'', 'site':u.site||'',
        'vmail enabled':'yes','answer timeout':data.timeout,'timezone':data.tz,
        'area code':data.area,'callerid number':data.callerIdNum,'callerid name':data.callerIdName,
        '911 callerid':data.callerIdNum||data.mainBTN,'dial plan':domain,'dial permission':data.dialPerm,
        'audio directory':'yes','visual directory':'yes','vmail_transcribe':'no',
        'email_vmail':'attnew','email_vmail_enable':'yes','add phone extension':'yes','scope':u.scope||data.scope,
        _dn:u.dn,
      }
    })
    const extByDN = {}
    userRows.forEach(u => { if (u._dn) extByDN[u._dn] = u['extension*'] })
    const phoneRows = (data.devices||[]).map(d => ({
      'MAC':d.mac,'Model':d.model,'Server':data.server,
      'Line 1':d.line1||extByDN[d.dn]||'',
      'Line 2':data.line2?(d.line2||d.line1||extByDN[d.dn]||''):'',
      'Line 3':'','Line 4':'','Line 5':'','Line 6':'','Notes':d.notes||'',
    }))
    const e911Rows = userRows.map(u => ({
      'call_back_number':u._dn||u['extension*'],
      'address_name':data.callerIdName||domain,
      'caller_name':`${u['first name*']} ${u['last name*']}`.trim()||data.callerIdName,
      'address_line_1':e911.addressLine1,'address_line_2':e911.addressLine2,
      'country_code':'US','state_code':e911.state,'city':e911.city,'zip':e911.zip,
      'location':'','user/site':u['extension*'],'assign':'no',
    }))
    const reviewRows = []
    const seen = {}
    userRows.forEach(u => {
      if (!u['extension*']) reviewRows.push({Issue:'Missing extension',Key:u._dn||'',Detail:'Custom extension required',Action:'Enter the NetSapiens extension in the Users step'})
      if (!u['first name*']) reviewRows.push({Issue:'Missing first name',Key:u['extension*']||u._dn||'',Detail:'',Action:'Set a first name before import'})
      const ext = u['extension*']
      if (ext && seen[ext]) reviewRows.push({Issue:'Extension collision',Key:ext,Detail:'Duplicate',Action:'Fix extension before import'})
      if (ext) seen[ext] = true
    })
    ;(data.devices||[]).forEach(d => {
      if (d.mac&&d.mac.length!==12) reviewRows.push({Issue:'MAC length',Key:d.mac,Detail:'Expected 12 hex chars',Action:'Correct MAC'})
    })
    userRows.forEach(u=>delete u._dn)
    return { userRows, phoneRows, e911Rows, reviewRows }
  }, [data])

  const b = data.build || {}
  const domain = data.domain || 'DOMAIN'

  const manualItems = (data.autoAttendants||[]).length + (data.callFlows||[]).length +
    (data.huntGroups||[]).length + (data.buttonLayouts||[]).length
  const totalItems = 3 + manualItems + 6  // 3 imports + manual + 6 post-tests
  const doneCount  = Object.values(b).filter(Boolean).length
  const pct = Math.round((doneCount / Math.max(totalItems,1)) * 100)

  function CheckRow({ bkey, label, detail }) {
    const done = !!b[bkey]
    return (
      <div className={`mig-check-row${done?' is-done':''}`} onClick={()=>toggleDone(bkey)}>
        <div className={`mig-check-box${done?' is-checked':''}`}>{done?'✓':''}</div>
        <div className="mig-check-content">
          <div className="mig-check-label">{label}</div>
          {detail && <div className="mig-check-detail">{detail}</div>}
        </div>
      </div>
    )
  }

  const downloads = [
    { name:`user_import_${domain}.csv`,              csv:toCSV(USER_COLS,userRows),            count:`${userRows.length} users`,  note:'Import first',                   bkey:'usersImported'  },
    { name:`phones_import_${domain}.csv`,            csv:toCSV(PHONE_COLS,phoneRows),          count:`${phoneRows.length} phones`,note:'Import second',                  bkey:'phonesImported' },
    { name:`import_address_endpoints_${domain}.csv`, csv:toCSV(E911_COLS,e911Rows),            count:`${e911Rows.length} rows`,   note:'Fill addresses then import',     bkey:'e911Imported'   },
    reviewRows.length ? { name:`_REVIEW_${domain}.csv`, csv:toCSV(['Issue','Key','Detail','Action'],reviewRows), count:`${reviewRows.length} items`, note:'Fix all before importing', bkey:null } : null,
  ].filter(Boolean)

  return (
    <div className="mig-step-body">
      {/* Progress */}
      <div className="mig-build-progress">
        <div className="mig-progress-bar-wrap">
          <div className="mig-progress-bar" style={{width:`${pct}%`}}/>
        </div>
        <div className="mig-progress-label">{doneCount} of {totalItems} steps complete — {pct}%</div>
      </div>

      {/* Sync to Call Flow */}
      <div className="mig-field-group">
        <div className="mig-field-group-title">Call Flow Diagram</div>
        <p className="mig-hint">
          Push call flows, auto attendants, and hunt groups from this migration into the account&rsquo;s
          call flow diagram. Existing diagram data will be replaced.
        </p>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button
            type="button"
            className={`btn${syncState==='done'?' btn-primary':' btn-secondary'}`}
            disabled={syncState==='syncing'}
            onClick={handleSyncToCallFlow}
          >
            {syncState==='syncing' ? 'Syncing…'
              : syncState==='done' ? '✓ Call flow updated'
              : 'Sync to call flow diagram'}
          </button>
          {syncState==='no-account' && (
            <span className="mns-ext-warn">No account linked to this job — open the job from an account to enable sync.</span>
          )}
          {syncState==='error' && (
            <span className="mns-ext-warn">Sync failed — check console for details.</span>
          )}
        </div>
      </div>

      {/* Downloads */}
      <div className="mig-field-group">
        <div className="mig-field-group-title">NS Import Files</div>
        <p className="mig-hint">Download in order. Import users before phones so extensions can bind.</p>
        <div className="mns-downloads">
          {downloads.map(dl => (
            <div key={dl.name} className="mns-dl-row">
              <div className="mns-dl-info">
                <div className="mns-dl-name">{dl.name}</div>
                <div className="mns-dl-note">{dl.note}</div>
              </div>
              <div className="mns-dl-count">{dl.count}</div>
              {dl.bkey && (
                <button type="button" className={`btn btn-secondary${b[dl.bkey]?' mig-done-btn':''}`} onClick={()=>toggleDone(dl.bkey)}>
                  {b[dl.bkey]?'✓ Done':'Mark done'}
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={()=>downloadCSV(dl.name,dl.csv)}>Download</button>
            </div>
          ))}
        </div>
      </div>

      {/* Manual build checklist */}
      {manualItems > 0 && (
        <div className="mig-field-group">
          <div className="mig-field-group-title">Manual Config in NS</div>
          {(data.autoAttendants||[]).map(aa=>(
            <CheckRow key={aa.id} bkey={`aa_${aa.id}`}
              label={`Auto Attendant: ${aa.name||'Unnamed'}`}
              detail={[
                aa.scheduleNotes&&`Schedule: ${aa.scheduleNotes}`,
                (aa.menuKeys||[]).length&&`${aa.menuKeys.length} key${aa.menuKeys.length>1?'s':''}: ${aa.menuKeys.map(k=>`${k.digit}→${k.destValue||k.destType}`).join(', ')}`,
              ].filter(Boolean).join(' · ')}/>
          ))}
          {(data.callFlows||[]).map(cf=>(
            <CheckRow key={cf.id} bkey={`cf_${cf.id}`}
              label={`ICM: ${cf.phoneNumber||'—'}`}
              detail={[cf.normalDest&&`Normal → ${cf.normalDest}`, cf.closedDest&&`Closed → ${cf.closedDest}`].filter(Boolean).join(' · ')}/>
          ))}
          {(data.huntGroups||[]).map(hg=>(
            <CheckRow key={hg.id} bkey={`hg_${hg.id}`}
              label={`Hunt Group: ${hg.name||'Unnamed'} (${hg.type})`}
              detail={hg.members?`Members: ${hg.members}`:''}/>
          ))}
          {(data.buttonLayouts||[]).map(bl=>{
            const totalKeys = (bl.pages||[]).reduce((s,p)=>s+(p.keys||[]).length,0)
            const pageCount = (bl.pages||[]).length
            return (
              <CheckRow key={bl.id} bkey={`bl_${bl.id}`}
                label={`Phone layout: ext ${bl.extension||'—'}`}
                detail={[
                  totalKeys&&`${totalKeys} key${totalKeys>1?'s':''} across ${pageCount} page${pageCount>1?'s':''}`,
                  bl.sidecarNotes&&`Sidecar: ${bl.sidecarNotes}`,
                ].filter(Boolean).join(' · ')}/>
            )
          })}
        </div>
      )}

      {/* Post-migration tests */}
      <div className="mig-field-group">
        <div className="mig-field-group-title">Post-Migration Tests</div>
        <CheckRow bkey="test_main"  label="Main number rings correctly"/>
        <CheckRow bkey="test_aa"    label="Auto attendant keys route correctly"/>
        <CheckRow bkey="test_hg"    label="Hunt groups ring all members"/>
        <CheckRow bkey="test_vm"    label="Voicemail accessible (*97 or *98)"/>
        <CheckRow bkey="test_night" label="Night mode / after-hours toggles correctly"/>
        <CheckRow bkey="test_e911"  label="E911 address confirmed with customer"/>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP INDICATOR
   ════════════════════════════════════════════════════════════ */
const STEPS = [
  { id:0, label:'Account Setup' },
  { id:1, label:'Users'         },
  { id:2, label:'Devices'       },
  { id:3, label:'System Config' },
  { id:4, label:'Build'         },
]

function StepIndicator({ current, onGoto }) {
  return (
    <div className="mig-wizard-steps no-print">
      {STEPS.map((s, i) => (
        <button key={s.id} type="button"
          className={`mig-wizard-step${current===s.id?' is-active':current>s.id?' is-done':''}`}
          onClick={()=>onGoto(s.id)}>
          <span className="mig-wizard-num">{current>s.id?'✓':s.id+1}</span>
          <span className="mig-wizard-label">{s.label}</span>
          {i < STEPS.length-1 && <span className="mig-wizard-connector"/>}
        </button>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   ROOT
   ════════════════════════════════════════════════════════════ */
export default function MigrationWorkspace({ jobId }) {
  const [data, setData]   = useState(() => loadJobMigration(jobId) || emptyMigration())
  const [step, setStep]   = useState(0)
  const saveTimer = useRef(null)

  useEffect(() => {
    const loaded = loadJobMigration(jobId)
    if (loaded) setData(loaded)
  }, [jobId])

  function handleChange(next) {
    setData(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveJobMigration(jobId, next), 600)
  }

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const STEP_COMPONENTS = [
    <StepAccount  key="account"  data={data} onChange={handleChange}/>,
    <StepUsers    key="users"    data={data} onChange={handleChange}/>,
    <StepDevices  key="devices"  data={data} onChange={handleChange}/>,
    <StepSystem   key="system"   data={data} onChange={handleChange}/>,
    <StepBuild    key="build"    data={data} onChange={handleChange} jobId={jobId}/>,
  ]

  return (
    <div className="mig-root">
      <div className="design-hero hero-grid" style={{marginBottom:16}}>
        <div>
          <div className="survey-kicker">Migration</div>
          <h1>MCU → NetSapiens</h1>
        </div>
      </div>

      <StepIndicator current={step} onGoto={setStep}/>

      <div className="mig-wizard-body">
        {STEP_COMPONENTS[step]}
      </div>

      {/* Bottom nav */}
      <div className="mig-wizard-nav no-print">
        <button type="button" className="btn btn-secondary" disabled={step===0} onClick={()=>setStep(s=>s-1)}>
          ← Back
        </button>
        <span className="mig-wizard-page">{step+1} of {STEPS.length}</span>
        <button type="button" className="btn btn-primary" disabled={step===STEPS.length-1} onClick={()=>setStep(s=>s+1)}>
          {step===STEPS.length-2 ? 'Go to Build →' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
