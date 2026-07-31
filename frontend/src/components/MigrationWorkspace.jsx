/**
 * MigrationWorkspace — Metaswitch → NetSapiens guided migration.
 * Step wizard: Account Setup → Users → Devices → System Config → Build
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadJobMigration, saveJobMigration } from '../lib/jobModel.js'
import { FIRMWARE_TABLE, auditDevice } from '../lib/firmwareTable.js'
import { makeId } from '../lib/surveyModel.js'
import {
  analyzeDeviceExtensionAssignments,
  analyzeMigrationExtensions,
  applyBulkExtensions,
  cleanImportedField,
  cleanMigrationName,
  extensionsByDn,
  migrationE911Fields,
  migrationUserFromLine,
  netSapiensPhoneModel,
  normalizeMigrationExtension,
  parseBulkExtensions,
  previewBulkExtensionApply,
  SYSTEM_CONFIG_CHECKS,
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
    area:'', scope:'Basic User',
    dialPerm:'US and Canada', emailDom:'', timeout:'25',
    line2:true,
    users:[], devices:[], sharedDeviceApprovals:[],
    // Legacy fields retained for older saved migrations; UI no longer edits them.
    autoAttendants:[], callFlows:[], huntGroups:[], buttonLayouts:[],
    systemConfig:{},
    build:{},
    // Phase 0 — Pre-Migration
    kickoff:{ owner:'', reviewerName:'', cutoverDate:'', networkReqSent:false, networkReqDate:'', notes:'' },
    hardwareAudit:[],
    featureInventory:{},
    sites:[],
    // Phase 2 — Cutover
    gonogo:{ reviewerName:'', reviewerSignoff:false, signoffDate:'', overrides:{} },
    runbook:[],
    phoneTracker:[],
    // Phase 3 — Post-Cutover
    testCalls:{},
    signoff:{ customerName:'', signedAt:'', notes:'' },
  }
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

/* ── Feature inventory reference data ────────────────────────── */
const FEATURE_INVENTORY_ITEMS = [
  { id:'aa',          label:'Auto Attendant',              status:'ok',        note:'Fully supported in NS' },
  { id:'hg',          label:'Hunt Groups / Ring Groups',   status:'ok',        note:'Supported as Ring Groups in NS' },
  { id:'vm_basic',    label:'Voicemail (per-user)',        status:'ok',        note:'Fully supported' },
  { id:'vm_shared',   label:'Shared / Dept Voicemail',    status:'different', note:'Requires manual setup in NS — configure as a separate extension with shared access' },
  { id:'vm_transfer', label:'Voicemail Transfer (Meta)',   status:'gap',       note:'⚠ Voicemails do NOT transfer to NS. Customer must be told before cutover.' },
  { id:'find_me',     label:'Find Me / Follow Me',         status:'ok',        note:'Answering Rules in NS' },
  { id:'call_fwd',    label:'Call Forwarding',             status:'ok',        note:'Fully supported' },
  { id:'call_park',   label:'Call Park',                   status:'different', note:'Uses feature code on NS (verify current code with Reinvent)' },
  { id:'conf3',       label:'3-Way Conference',            status:'different', note:'Use feature code *50 on NS — customer needs quick-ref card' },
  { id:'dnd',         label:'Do Not Disturb',              status:'different', note:'Feature code based on NS — different from Meta button' },
  { id:'recording',   label:'Call Recording',              status:'ok',        note:'Available via NS portal' },
  { id:'blf',         label:'BLF / Busy Lamp Field',       status:'ok',        note:'Supported via button layouts' },
  { id:'paging',      label:'Overhead Paging (Algo)',      status:'ok',        note:'SIP paging supported' },
  { id:'after_hours', label:'After-Hours / Night Mode',    status:'ok',        note:'Time frames + answering rules in NS' },
  { id:'ata',         label:'Analog Extensions (ATA)',     status:'ok',        note:'NS supports ATAs' },
  { id:'e911',        label:'E911 / Emergency Calling',    status:'ok',        note:'Supported — must configure addresses in NS' },
  { id:'admin_portal',label:'Admin Portal',               status:'different', note:'⚠ Completely different portal — customer must be trained' },
  { id:'app',         label:'Softphone / Mobile App',      status:'different', note:'Different app than Meta — customer must download and set up fresh' },
]

/* ── Runbook and test call defaults ───────────────────────────── */
const RUNBOOK_DEFAULTS = [
  { task:'Confirm port is active / DID is routed to NS',      time:'T+0:00' },
  { task:'Verify NS domain is provisioned and reachable',     time:'T+0:15' },
  { task:'Confirm auto-provisioning server URL on phones',    time:'T+0:20' },
  { task:'Phones begin provisioning — monitor first devices', time:'T+0:30' },
  { task:'Verify ext-to-ext calling between first 3 phones',  time:'T+1:00' },
  { task:'Test inbound call to main number',                  time:'T+1:15' },
  { task:'Test auto attendant key routing',                   time:'T+1:20' },
  { task:'Test voicemail (leave + retrieve)',                  time:'T+1:30' },
  { task:'Test after-hours / night mode',                     time:'T+1:45' },
  { task:'Test E911 (confirm address with carrier)',          time:'T+2:00' },
  { task:'All phones confirmed online',                       time:'T+2:30' },
  { task:'Customer walk-through: new portal + voicemail',    time:'T+3:00' },
  { task:'Customer sign-off obtained',                        time:'T+3:30' },
]

const TEST_CALL_ITEMS = [
  { key:'inbound_main', label:'Inbound call to main number',       detail:'Should ring AA or correct destination' },
  { key:'aa_keys',      label:'Auto attendant key routing',        detail:'Test each key — press 0–9 and verify' },
  { key:'ext_to_ext',   label:'Ext-to-ext internal call',          detail:'Call from one extension to another' },
  { key:'outbound',     label:'Outbound call',                     detail:'Verify caller ID shows correctly' },
  { key:'hg_ring',      label:'Hunt group rings all members',      detail:'All ring group members should ring' },
  { key:'voicemail',    label:'Voicemail deposit and retrieval',   detail:'Leave VM, then retrieve via *97 or *98' },
  { key:'after_hours',  label:'After-hours routing',               detail:'Toggle night mode, verify calls route to VM or AA' },
  { key:'e911',         label:'E911 address confirmed',            detail:'Verify address with customer — no test call needed' },
  { key:'direct_dial',  label:'Direct DID to extension',          detail:'Call a direct number, verify it rings correct ext' },
]

/* ════════════════════════════════════════════════════════════
   PHASE 0 — Pre-Migration steps
   ════════════════════════════════════════════════════════════ */

/* ── Step 0: Kickoff & Ownership ─────────────────────────────── */
function StepKickoff({ data, onChange }) {
  const k = data.kickoff || {}
  function set(f, v) { onChange({ ...data, kickoff: { ...k, [f]: v } }) }
  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Assign ownership before any work starts. One person is responsible for this migration from kickoff to sign-off — no owner means no start date.</p>
      <div className="mig-field-group">
        <div className="mig-field-group-title">Ownership</div>
        <div className="mig-field-row">
          <Field label="Migration Owner *">
            <MInput value={k.owner||''} onChange={v=>set('owner',v)} placeholder="Your name"/>
          </Field>
          <Field label="QC Reviewer">
            <MInput value={k.reviewerName||''} onChange={v=>set('reviewerName',v)} placeholder="Second tech who reviews before cutover"/>
          </Field>
          <Field label="Target Cutover Date">
            <MInput type="date" value={k.cutoverDate||''} onChange={v=>set('cutoverDate',v)}/>
          </Field>
        </div>
      </div>
      <div className="mig-field-group">
        <div className="mig-field-group-title">Network Requirements</div>
        <div className={`mig-check-row${k.networkReqSent?' is-done':''}`} style={{cursor:'pointer'}}
          onClick={()=>set('networkReqSent',!k.networkReqSent)}>
          <div className={`mig-check-box${k.networkReqSent?' is-checked':''}`}>{k.networkReqSent?'✓':''}</div>
          <div className="mig-check-content">
            <div className="mig-check-label">Network requirements sent to customer</div>
            <div className="mig-check-detail">QoS, VLAN, SIP ALG disable, firewall ports — sent at least 2 weeks before cutover</div>
          </div>
        </div>
        {k.networkReqSent && (
          <div style={{marginTop:8,paddingLeft:40}}>
            <Field label="Date sent">
              <MInput type="date" value={k.networkReqDate||''} onChange={v=>set('networkReqDate',v)}/>
            </Field>
          </div>
        )}
      </div>
      <div className="mig-field-group">
        <div className="mig-field-group-title">Notes</div>
        <textarea className="mns-input mig-textarea" rows={3}
          value={k.notes||''} onChange={e=>set('notes',e.target.value)}
          placeholder="Customer contacts, special requirements, anything the team needs to know..."/>
      </div>
    </div>
  )
}

/* ── Step 1: Hardware Audit ──────────────────────────────────── */
function StepHardwareAudit({ data, onChange }) {
  const devices = data.hardwareAudit || []
  const [newModel, setNewModel] = useState('')
  const [newMac, setNewMac] = useState('')
  const [newFw, setNewFw] = useState('')

  function addDevice() {
    if (!newModel.trim()) return
    onChange({ ...data, hardwareAudit: [...devices, {
      id:makeId(), mac:newMac.trim(), model:newModel.trim(), currentFw:newFw.trim(), notes:'',
    }]})
    setNewModel(''); setNewMac(''); setNewFw('')
  }
  function update(id, field, val) {
    onChange({ ...data, hardwareAudit: devices.map(d=>d.id===id?{...d,[field]:val}:d) })
  }
  function remove(id) {
    onChange({ ...data, hardwareAudit: devices.filter(d=>d.id!==id) })
  }

  const statuses = devices.map(d=>auditDevice(d.model, d.currentFw))
  const failCount = statuses.filter(s=>s.status==='fail').length
  const warnCount = statuses.filter(s=>s.status==='warn').length
  const STATUS_LABELS = { ok:'✓ OK', warn:'⚠ EOL', fail:'✕ Update needed', unknown:'? Verify' }
  const STATUS_CLASS  = { ok:'mig-fw-ok', warn:'mig-fw-warn', fail:'mig-fw-fail', unknown:'mig-fw-unknown' }

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">
        Enter each device — model and current firmware. The app checks minimum versions required for NetSapiens provisioning and flags anything that needs attention before cutover day.
      </p>

      {failCount>0 && (
        <div className="mig-audit-banner is-fail">
          🚫 {failCount} device{failCount!==1?'s':''} need firmware updates before cutover can be scheduled.
          {warnCount>0 && ` Also: ${warnCount} EOL device${warnCount!==1?'s':''} — verify support with Reinvent.`}
        </div>
      )}
      {!failCount && warnCount>0 && (
        <div className="mig-audit-banner is-warn">
          ⚠ {warnCount} EOL device{warnCount!==1?'s':''} — verify support with Reinvent before committing to migration.
        </div>
      )}
      {devices.length>0 && !failCount && !warnCount && (
        <div className="mig-audit-banner is-ok">✓ All {devices.length} devices pass firmware check.</div>
      )}

      <div className="mig-field-group">
        <div className="mig-field-group-title">Add Device</div>
        <div className="mig-audit-add-row">
          <select className="mns-input" value={newModel} onChange={e=>setNewModel(e.target.value)} style={{flex:2,minWidth:160}}>
            <option value="">Select model...</option>
            {FIRMWARE_TABLE.map(e=><option key={e.model} value={e.model}>{e.model}{e.eol?' (EOL)':''}</option>)}
            <option value="Other">Other / not listed</option>
          </select>
          <input className="mns-input" placeholder="MAC (optional)" value={newMac} onChange={e=>setNewMac(e.target.value)} style={{width:140}}/>
          <input className="mns-input" placeholder="Current firmware" value={newFw} onChange={e=>setNewFw(e.target.value)} style={{width:155}}/>
          <button type="button" className="btn btn-primary" onClick={addDevice} disabled={!newModel}>+ Add</button>
        </div>
      </div>

      {devices.length>0 && (
        <div className="mig-field-group">
          <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
            Devices
            <span className="mig-count-badge">{devices.length}</span>
          </div>
          <div className="mig-audit-table">
            <div className="mig-audit-head">
              <span>Model</span><span>MAC</span><span>Current FW</span><span>Status</span><span>Notes</span><span/>
            </div>
            {devices.map((d,i)=>{
              const s = statuses[i]
              return (
                <div key={d.id} className="mig-audit-row">
                  <span className="mig-audit-model">{d.model}</span>
                  <span><input className="mns-input mig-audit-input" value={d.mac} onChange={e=>update(d.id,'mac',e.target.value)} placeholder="MAC"/></span>
                  <span><input className="mns-input mig-audit-input" value={d.currentFw} onChange={e=>update(d.id,'currentFw',e.target.value)} placeholder="e.g. 66.86.0.20"/></span>
                  <span className={`mig-fw-badge ${STATUS_CLASS[s.status]}`} title={s.message}>{STATUS_LABELS[s.status]}</span>
                  <span><input className="mns-input mig-audit-input" value={d.notes} onChange={e=>update(d.id,'notes',e.target.value)} placeholder="Notes"/></span>
                  <span><button type="button" className="mig-audit-del" onClick={()=>remove(d.id)}>✕</button></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <details className="mig-field-group">
        <summary className="mig-field-group-title" style={{cursor:'pointer',userSelect:'none',listStyle:'none'}}>
          Firmware Reference Table ▸
        </summary>
        <div className="mig-audit-table" style={{marginTop:8}}>
          <div className="mig-audit-head" style={{gridTemplateColumns:'2fr 1.5fr 3fr'}}>
            <span>Model</span><span>Min Firmware for NS</span><span>Notes</span>
          </div>
          {FIRMWARE_TABLE.map(e=>(
            <div key={e.model} className={`mig-audit-row${e.eol?' mig-audit-eol-row':''}`} style={{gridTemplateColumns:'2fr 1.5fr 3fr'}}>
              <span>{e.model}</span>
              <span>{e.minFw||'—'}</span>
              <span style={{fontSize:11,color:'var(--muted)'}}>{e.eolNote||''}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

/* ── Step 2: Feature Inventory ───────────────────────────────── */
function StepFeatureInventory({ data, onChange }) {
  const inv = data.featureInventory || {}
  function setItem(id, field, val) {
    onChange({ ...data, featureInventory: { ...inv, [id]: { ...(inv[id]||{}), [field]: val } } })
  }
  const usedItems = FEATURE_INVENTORY_ITEMS.filter(f=>inv[f.id]?.used)
  const gapCount  = usedItems.filter(f=>f.status==='gap').length
  const diffCount = usedItems.filter(f=>f.status==='different').length
  const STATUS_COLOR = { ok:'var(--ok)', different:'var(--warn)', gap:'#b45309' }
  const STATUS_LABEL = { ok:'✓ Supported', different:'≠ Works differently on NS', gap:'⚠ Gap — action needed' }

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">
        Check every feature this customer uses on Metaswitch. Gaps and differences are flagged automatically so you can disclose them before committing to the migration.
      </p>
      {gapCount>0 && (
        <div className="mig-audit-banner is-fail">
          ⚠ {gapCount} feature gap{gapCount!==1?'s':''} — disclose to customer before cutover.
          {diffCount>0 ? ` Also ${diffCount} feature${diffCount!==1?'s':''} that work differently on NS.` : ''}
        </div>
      )}
      {!gapCount && diffCount>0 && (
        <div className="mig-audit-banner is-warn">
          {diffCount} feature{diffCount!==1?'s':''} work differently on NS — customer must be briefed before cutover.
        </div>
      )}
      {!gapCount && !diffCount && usedItems.length>0 && (
        <div className="mig-audit-banner is-ok">✓ No gaps — all used features are fully supported on NS.</div>
      )}
      <div className="mig-field-group">
        <div className="mig-field-group-title">Feature Checklist</div>
        <p className="mig-hint">Check the features this customer currently uses on Meta. Gaps and differences are flagged automatically.</p>
        {FEATURE_INVENTORY_ITEMS.map(item=>{
          const entry = inv[item.id] || {}
          const isUsed = !!entry.used
          return (
            <div key={item.id} className={`mig-feat-row${isUsed?' is-checked':''}`}>
              <div className="mig-feat-left" onClick={()=>setItem(item.id,'used',!isUsed)} style={{cursor:'pointer'}}>
                <div className={`mig-check-box${isUsed?' is-checked':''}`}>{isUsed?'✓':''}</div>
                <div className="mig-feat-info">
                  <div className="mig-check-label">{item.label}</div>
                  {isUsed && (
                    <div className="mig-feat-status" style={{color:STATUS_COLOR[item.status]}}>
                      {STATUS_LABEL[item.status]} — {item.note}
                    </div>
                  )}
                </div>
              </div>
              {isUsed && item.status!=='ok' && (
                <div style={{paddingLeft:40,marginTop:6}}>
                  <input className="mns-input" style={{width:'100%',fontSize:12}}
                    value={entry.notes||''} onChange={e=>setItem(item.id,'notes',e.target.value)}
                    placeholder="Notes or action items for this feature..."/>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Step 3: Site Planning (multi-site) ──────────────────────── */
function StepSites({ data, onChange }) {
  const sites = data.sites || []
  const [form, setForm] = useState({ name:'', contact:'', contactEmail:'', deviceCount:'', cutoverDate:'' })
  const [showAdd, setShowAdd] = useState(false)

  function addSite() {
    if (!form.name.trim()) return
    onChange({ ...data, sites:[...sites,{...form, id:makeId(), status:'pending'}]})
    setForm({ name:'', contact:'', contactEmail:'', deviceCount:'', cutoverDate:'' })
    setShowAdd(false)
  }
  function updateSite(id, field, val) {
    onChange({ ...data, sites:sites.map(s=>s.id===id?{...s,[field]:val}:s) })
  }
  function removeSite(id) {
    onChange({ ...data, sites:sites.filter(s=>s.id!==id) })
  }

  const STATUS_OPTS = ['pending','ready','cutover done','issue']
  const STATUS_CLASS = { pending:'mig-site-pending', ready:'mig-site-ready', 'cutover done':'mig-site-done', issue:'mig-site-issue' }

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">
        For multi-site customers, plan each location separately — own hardware audit, IT contact, and cutover window.
        Single-site customer? You can skip this step.
      </p>
      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Sites
          {sites.length>0 && <span className="mig-count-badge">{sites.length}</span>}
          <button type="button" className="btn btn-secondary"
            style={{marginLeft:'auto',padding:'3px 10px',fontSize:12}}
            onClick={()=>setShowAdd(v=>!v)}>
            {showAdd?'Cancel':'+ Add site'}
          </button>
        </div>

        {sites.length===0 && !showAdd && (
          <div className="mig-sites-empty">
            <p>No sites added — this is a single-site migration.</p>
            <p style={{fontSize:12,color:'var(--muted)',margin:'4px 0 16px'}}>
              Add sites only if this customer has multiple physical locations.
            </p>
            <button type="button" className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add first site</button>
          </div>
        )}

        {showAdd && (
          <div className="mig-site-add-form">
            <div className="mig-field-row">
              <Field label="Site name *"><MInput value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="Main Office"/></Field>
              <Field label="IT Contact"><MInput value={form.contact} onChange={v=>setForm(f=>({...f,contact:v}))} placeholder="Contact name"/></Field>
              <Field label="Contact email"><MInput value={form.contactEmail} onChange={v=>setForm(f=>({...f,contactEmail:v}))} placeholder="it@customer.com"/></Field>
            </div>
            <div className="mig-field-row">
              <Field label="# Devices"><MInput value={form.deviceCount} onChange={v=>setForm(f=>({...f,deviceCount:v}))} placeholder="12"/></Field>
              <Field label="Cutover date"><MInput type="date" value={form.cutoverDate} onChange={v=>setForm(f=>({...f,cutoverDate:v}))}/></Field>
            </div>
            <button type="button" className="btn btn-primary" onClick={addSite} disabled={!form.name.trim()}>Add site</button>
          </div>
        )}

        {sites.map(site=>(
          <div key={site.id} className="mig-site-card">
            <div className="mig-site-card-header">
              <span className="mig-site-name">📍 {site.name}</span>
              <select className={`mig-site-status ${STATUS_CLASS[site.status]||''}`}
                value={site.status} onChange={e=>updateSite(site.id,'status',e.target.value)}>
                {STATUS_OPTS.map(o=><option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
              </select>
              <button type="button" className="mig-audit-del" onClick={()=>removeSite(site.id)}>✕</button>
            </div>
            <div className="mig-site-card-body">
              <div className="mig-site-meta"><span>IT Contact</span><span>{site.contact||'—'}</span></div>
              <div className="mig-site-meta"><span>Email</span><span>{site.contactEmail||'—'}</span></div>
              <div className="mig-site-meta"><span>Devices</span><span>{site.deviceCount||'—'}</span></div>
              <div className="mig-site-meta"><span>Cutover</span><span>{site.cutoverDate||'TBD'}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PHASE 2 — Cutover steps
   ════════════════════════════════════════════════════════════ */

/* ── Step 9: Go / No-Go Gate ─────────────────────────────────── */
function StepGoNoGo({ data, onChange }) {
  const gng = data.gonogo || {}
  const overrides = gng.overrides || {}

  const checks = [
    { key:'owner_set',       category:'Pre-Migration', label:'Migration owner assigned',                    auto:!!(data.kickoff?.owner) },
    { key:'net_req_sent',    category:'Pre-Migration', label:'Network requirements sent to customer',       auto:!!(data.kickoff?.networkReqSent) },
    { key:'cutover_date',    category:'Pre-Migration', label:'Cutover date confirmed',                      auto:!!(data.kickoff?.cutoverDate) },
    { key:'hw_audit_done',   category:'Pre-Migration', label:'Hardware audit complete',                     auto:(data.hardwareAudit||[]).length>0 },
    { key:'hw_audit_pass',   category:'Pre-Migration', label:'All devices pass firmware check',
      auto:(data.hardwareAudit||[]).length>0 &&
           (data.hardwareAudit||[]).every(d=>{ const s=auditDevice(d.model,d.currentFw); return s.status==='ok'||s.status==='unknown' }) },
    { key:'feat_gaps_noted', category:'Pre-Migration', label:'Feature gaps identified and disclosed to customer',
      auto:(()=>{
        const inv = data.featureInventory||{}
        const usedGaps = FEATURE_INVENTORY_ITEMS.filter(f=>f.status==='gap'&&inv[f.id]?.used)
        return usedGaps.length===0 || usedGaps.every(f=>inv[f.id]?.notes?.trim())
      })() },
    { key:'users_done',      category:'Configuration', label:'Users and extensions configured',             auto:(data.users||[]).length>0 },
    { key:'devices_done',    category:'Configuration', label:'Devices configured',                          auto:(data.devices||[]).length>0 },
    { key:'system_done',     category:'Configuration', label:'System Config step fully checked off',
      auto:SYSTEM_CONFIG_CHECKS.length>0 && SYSTEM_CONFIG_CHECKS.every(c=>!!(data.systemConfig||{})[c.key]) },
    { key:'reviewer_set',    category:'QC',            label:'QC reviewer assigned',                       auto:!!(data.kickoff?.reviewerName)||!!(gng.reviewerName) },
  ]

  function getStatus(check) { return overrides[check.key] || check.auto }
  const allPass = checks.every(c=>getStatus(c))
  const reviewerName = gng.reviewerName || data.kickoff?.reviewerName || ''
  function setGng(f,v) { onChange({ ...data, gonogo:{ ...gng, [f]:v } }) }
  function toggleOverride(key) {
    onChange({ ...data, gonogo:{ ...gng, overrides:{ ...overrides, [key]:!overrides[key] } } })
  }
  const categories = [...new Set(checks.map(c=>c.category))]

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">
        All items must pass before cutover is scheduled. Items are auto-derived from earlier steps. Manually override individual items if needed. Reviewer must sign off to unlock.
      </p>
      {categories.map(cat=>(
        <div key={cat} className="mig-field-group">
          <div className="mig-field-group-title">{cat}</div>
          {checks.filter(c=>c.category===cat).map(check=>{
            const pass = getStatus(check)
            const manuallyOverridden = !!overrides[check.key] && !check.auto
            return (
              <div key={check.key} className={`mig-check-row${pass?' is-done':''}`}>
                <div className={`mig-check-box${pass?' is-checked':''}`}>{pass?'✓':''}</div>
                <div className="mig-check-content" style={{flex:1}}>
                  <div className="mig-check-label">
                    {check.label}
                    {manuallyOverridden && <span style={{fontSize:10,color:'var(--muted)',marginLeft:8}}>(manually approved)</span>}
                  </div>
                </div>
                {!check.auto && (
                  <button type="button"
                    className={`btn${overrides[check.key]?' btn-secondary':' btn-ghost'}`}
                    style={{fontSize:11,padding:'2px 8px',flexShrink:0}}
                    onClick={()=>toggleOverride(check.key)}>
                    {overrides[check.key]?'Undo':'Override'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div className="mig-field-group">
        <div className="mig-field-group-title">Reviewer Sign-off</div>
        <div className="mig-field-row">
          <Field label="Reviewer name">
            <MInput value={gng.reviewerName||''} onChange={v=>setGng('reviewerName',v)} placeholder={data.kickoff?.reviewerName||'Reviewer name'}/>
          </Field>
        </div>
        <div className={`mig-check-row${gng.reviewerSignoff?' is-done':''}`}
          style={{cursor:allPass&&reviewerName?'pointer':'not-allowed', opacity:allPass&&reviewerName?1:0.5}}
          onClick={()=>{ if(allPass&&reviewerName) setGng('reviewerSignoff',!gng.reviewerSignoff) }}>
          <div className={`mig-check-box${gng.reviewerSignoff?' is-checked':''}`}>{gng.reviewerSignoff?'✓':''}</div>
          <div className="mig-check-content">
            <div className="mig-check-label">
              {reviewerName ? `${reviewerName} signs off — system is ready for cutover` : 'Enter reviewer name above to enable sign-off'}
            </div>
            {!allPass && <div className="mig-check-detail">Complete all checklist items above first</div>}
          </div>
        </div>
        {gng.reviewerSignoff && (
          <div className="mig-audit-banner is-ok" style={{marginTop:8}}>✓ Go/No-Go gate cleared. Proceed to Cutover Runbook.</div>
        )}
        {!gng.reviewerSignoff && allPass && reviewerName && (
          <div className="mig-audit-banner is-warn" style={{marginTop:8}}>All checks pass — reviewer must click above to sign off.</div>
        )}
      </div>
    </div>
  )
}

/* ── Step 10: Cutover Runbook ────────────────────────────────── */
function StepRunbook({ data, onChange }) {
  const items = data.runbook || []
  function init() {
    onChange({ ...data, runbook:RUNBOOK_DEFAULTS.map(r=>({...r,id:makeId(),done:false,notes:''})) })
  }
  function toggle(id) { onChange({ ...data, runbook:items.map(r=>r.id===id?{...r,done:!r.done}:r) }) }
  function setNotes(id,val) { onChange({ ...data, runbook:items.map(r=>r.id===id?{...r,notes:val}:r) }) }
  function updateItem(id,field,val) { onChange({ ...data, runbook:items.map(r=>r.id===id?{...r,[field]:val}:r) }) }
  function removeItem(id) { onChange({ ...data, runbook:items.filter(r=>r.id!==id) }) }
  function addCustom() { onChange({ ...data, runbook:[...items,{id:makeId(),time:'',task:'',done:false,notes:''}] }) }
  const doneCount = items.filter(r=>r.done).length

  if (!items.length) return (
    <div className="mig-step-body">
      <p className="mig-step-desc">A day-of checklist keeps the cutover on track. Load the standard runbook or start from scratch.</p>
      <div className="mig-field-group">
        <div className="mig-sites-empty">
          <p>No runbook yet.</p>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:12}}>
            <button type="button" className="btn btn-primary" onClick={init}>Load standard runbook</button>
            <button type="button" className="btn btn-secondary" onClick={addCustom}>Start blank</button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Check off each item on cutover day. Time offsets are relative to T+0:00 (port activation / cutover start).</p>
      <div className="mig-build-progress" style={{marginBottom:16}}>
        <div className="mig-progress-bar-wrap">
          <div className="mig-progress-bar" style={{width:`${Math.round((doneCount/Math.max(items.length,1))*100)}%`}}/>
        </div>
        <div className="mig-progress-label">{doneCount} of {items.length} done</div>
      </div>
      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Runbook
          <button type="button" className="btn btn-secondary" style={{marginLeft:'auto',padding:'3px 10px',fontSize:12}} onClick={addCustom}>+ Add item</button>
        </div>
        {items.map(r=>(
          <div key={r.id} className={`mig-check-row${r.done?' is-done':''}`} style={{alignItems:'flex-start',gap:10}}>
            <div className={`mig-check-box${r.done?' is-checked':''}`}
              style={{marginTop:2,cursor:'pointer',flexShrink:0}} onClick={()=>toggle(r.id)}>{r.done?'✓':''}</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input className="mns-input" style={{width:70,fontSize:12}} value={r.time} onChange={e=>updateItem(r.id,'time',e.target.value)} placeholder="T+0:00"/>
                <input className="mns-input" style={{flex:1,fontSize:12}} value={r.task} onChange={e=>updateItem(r.id,'task',e.target.value)} placeholder="Task description"/>
                <button type="button" className="mig-audit-del" onClick={()=>removeItem(r.id)}>✕</button>
              </div>
              {!r.done && (
                <input className="mns-input" style={{width:'100%',fontSize:11,marginTop:4}}
                  value={r.notes||''} onChange={e=>setNotes(r.id,e.target.value)} placeholder="Notes..."/>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Step 11: Phone Online Tracker ───────────────────────────── */
function StepPhoneTracker({ data, onChange }) {
  const tracked = data.phoneTracker || []

  function populate() {
    const existing = new Set(tracked.map(t=>t.mac||t.ext).filter(Boolean))
    const extByDN = {}
    ;(data.users||[]).forEach(u=>{ if(u.dn) extByDN[u.dn]=u.ext||'' })
    const toAdd = (data.devices||[]).filter(d=>!existing.has(d.mac||d.dn))
    const newItems = toAdd.map(d=>({
      id:makeId(), mac:d.mac||'', model:d.model||'',
      ext:d.line1||extByDN[d.dn]||'', name:d.notes||d.dn||'',
      online:false, notes:'',
    }))
    onChange({ ...data, phoneTracker:[...tracked,...newItems] })
  }
  function toggle(id) { onChange({ ...data, phoneTracker:tracked.map(t=>t.id===id?{...t,online:!t.online}:t) }) }
  function setNotes(id,val) { onChange({ ...data, phoneTracker:tracked.map(t=>t.id===id?{...t,notes:val}:t) }) }
  function remove(id) { onChange({ ...data, phoneTracker:tracked.filter(t=>t.id!==id) }) }
  function add() { onChange({ ...data, phoneTracker:[...tracked,{id:makeId(),mac:'',model:'',ext:'',name:'',online:false,notes:''}] }) }
  function updateField(id,f,v) { onChange({ ...data, phoneTracker:tracked.map(t=>t.id===id?{...t,[f]:v}:t) }) }

  const onlineCount = tracked.filter(t=>t.online).length
  const offlineCount = tracked.length-onlineCount

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Check off each phone as it comes online on cutover day. Sync from Devices to auto-populate.</p>
      {tracked.length>0 && (
        <div className="mig-build-progress" style={{marginBottom:16}}>
          <div className="mig-progress-bar-wrap">
            <div className="mig-progress-bar" style={{width:`${Math.round((onlineCount/Math.max(tracked.length,1))*100)}%`}}/>
          </div>
          <div className="mig-progress-label">
            {onlineCount} of {tracked.length} phones online{offlineCount>0?` — ${offlineCount} remaining`:''}
          </div>
        </div>
      )}
      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Phones
          <span className="mig-count-badge">{tracked.length}</span>
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            {(data.devices||[]).length>0 && (
              <button type="button" className="btn btn-secondary" style={{padding:'3px 10px',fontSize:12}} onClick={populate}>
                ↻ Sync from Devices
              </button>
            )}
            <button type="button" className="btn btn-secondary" style={{padding:'3px 10px',fontSize:12}} onClick={add}>+ Add</button>
          </div>
        </div>
        {tracked.length===0 && (
          <div className="mig-sites-empty">
            <p>No phones added.</p>
            {(data.devices||[]).length>0
              ? <button type="button" className="btn btn-primary" onClick={populate}>Sync from Devices step ({data.devices.length} devices)</button>
              : <p style={{fontSize:12,color:'var(--muted)'}}>Add devices in the Devices step first, or add phones manually here.</p>
            }
          </div>
        )}
        {tracked.map(t=>(
          <div key={t.id} className={`mig-check-row${t.online?' is-done':''}`} style={{alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div className={`mig-check-box${t.online?' is-checked':''}`} style={{cursor:'pointer',flexShrink:0}} onClick={()=>toggle(t.id)}>{t.online?'✓':''}</div>
            <input className="mns-input" style={{width:64,fontSize:12}} value={t.ext} onChange={e=>updateField(t.id,'ext',e.target.value)} placeholder="Ext"/>
            <input className="mns-input" style={{flex:1,minWidth:100,fontSize:12}} value={t.name} onChange={e=>updateField(t.id,'name',e.target.value)} placeholder="Name / DN"/>
            <input className="mns-input" style={{width:130,fontSize:12}} value={t.model} onChange={e=>updateField(t.id,'model',e.target.value)} placeholder="Model"/>
            <input className="mns-input" style={{width:130,fontSize:12}} value={t.mac} onChange={e=>updateField(t.id,'mac',e.target.value)} placeholder="MAC"/>
            {!t.online && (
              <input className="mns-input" style={{flex:1,minWidth:80,fontSize:11}} value={t.notes||''} onChange={e=>setNotes(t.id,e.target.value)} placeholder="Issue..."/>
            )}
            <span style={{fontSize:12,fontWeight:600,color:t.online?'var(--ok)':'var(--muted)',width:52,textAlign:'right',flexShrink:0}}>
              {t.online?'Online':'Offline'}
            </span>
            <button type="button" className="mig-audit-del" onClick={()=>remove(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   PHASE 3 — Post-Cutover steps
   ════════════════════════════════════════════════════════════ */

/* ── Step 12: Test Calls ─────────────────────────────────────── */
function StepTestCalls({ data, onChange }) {
  const tc = data.testCalls || {}
  function setResult(key,field,val) {
    onChange({ ...data, testCalls:{ ...tc, [key]:{ ...(tc[key]||{}), [field]:val } } })
  }
  const passCount = TEST_CALL_ITEMS.filter(t=>tc[t.key]?.passed===true).length
  const failCount = TEST_CALL_ITEMS.filter(t=>tc[t.key]?.passed===false).length

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">After cutover, run every test. Mark pass or fail. Document issues so they can be tracked to resolution.</p>
      {failCount>0 && (
        <div className="mig-audit-banner is-fail">✕ {failCount} test{failCount!==1?'s':''} failing — resolve before closing the job.</div>
      )}
      {!failCount && passCount===TEST_CALL_ITEMS.length && (
        <div className="mig-audit-banner is-ok">✓ All {TEST_CALL_ITEMS.length} tests passed.</div>
      )}
      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Test Call Log
          <span className="mig-count-badge">{passCount}/{TEST_CALL_ITEMS.length}</span>
        </div>
        {TEST_CALL_ITEMS.map(item=>{
          const entry = tc[item.key]||{}
          const passed = entry.passed
          return (
            <div key={item.key} className={`mig-check-row${passed===true?' is-done':passed===false?' is-fail-row':''}`} style={{alignItems:'flex-start',gap:10}}>
              <div style={{display:'flex',gap:4,flexShrink:0,marginTop:2}}>
                <button type="button" className={`mig-pass-btn${passed===true?' is-active':''}`} title="Pass"
                  onClick={()=>setResult(item.key,'passed',passed===true?null:true)}>✓</button>
                <button type="button" className={`mig-fail-btn${passed===false?' is-active':''}`} title="Fail"
                  onClick={()=>setResult(item.key,'passed',passed===false?null:false)}>✕</button>
              </div>
              <div style={{flex:1}}>
                <div className="mig-check-label">{item.label}</div>
                <div className="mig-check-detail">{item.detail}</div>
                {passed===false && (
                  <input className="mns-input" style={{width:'100%',fontSize:11,marginTop:4}}
                    value={entry.notes||''} onChange={e=>setResult(item.key,'notes',e.target.value)}
                    placeholder="Describe the issue..."/>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Step 13: Customer Sign-off ──────────────────────────────── */
function StepSignoff({ data, onChange }) {
  const s = data.signoff || {}
  function set(f,v) { onChange({ ...data, signoff:{ ...s, [f]:v } }) }
  const tc = data.testCalls || {}
  const allTestsPassed = TEST_CALL_ITEMS.every(t=>tc[t.key]?.passed===true)
  const onlineCount = (data.phoneTracker||[]).filter(t=>t.online).length
  const totalPhones = (data.phoneTracker||[]).length

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">Final step. Get the customer's formal sign-off confirming the system is working before the job is closed.</p>
      <div className="mig-field-group">
        <div className="mig-field-group-title">Pre-Sign-off Summary</div>
        <div className={`mig-check-row${allTestsPassed?' is-done':''}`}>
          <div className={`mig-check-box${allTestsPassed?' is-checked':''}`}>{allTestsPassed?'✓':''}</div>
          <div className="mig-check-content"><div className="mig-check-label">All test calls passed</div></div>
        </div>
        <div className={`mig-check-row${totalPhones>0&&onlineCount===totalPhones?' is-done':''}`}>
          <div className={`mig-check-box${totalPhones>0&&onlineCount===totalPhones?' is-checked':''}`}>
            {totalPhones>0&&onlineCount===totalPhones?'✓':''}
          </div>
          <div className="mig-check-content">
            <div className="mig-check-label">All phones online {totalPhones>0?`(${onlineCount}/${totalPhones})`:''}</div>
          </div>
        </div>
      </div>
      <div className="mig-field-group">
        <div className="mig-field-group-title">Customer Sign-off</div>
        <div className="mig-field-row">
          <Field label="Customer representative name">
            <MInput value={s.customerName||''} onChange={v=>set('customerName',v)} placeholder="Customer's name"/>
          </Field>
          <Field label="Sign-off date">
            <MInput type="date" value={s.signedAt||''} onChange={v=>set('signedAt',v)}/>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="mns-input mig-textarea" rows={3}
            value={s.notes||''} onChange={e=>set('notes',e.target.value)}
            placeholder="Outstanding items, follow-ups, or notes..."/>
        </Field>
      </div>
      {s.customerName && s.signedAt && (
        <div className="mig-audit-banner is-ok" style={{fontSize:13,marginTop:8}}>
          ✓ Migration complete — signed off by {s.customerName} on {new Date(s.signedAt+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}.
        </div>
      )}
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
  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')

  function handleCSV(rows, filename) {
    const type = detectType(rows)
    if (!type || type !== 'lines') {
      setImportLog(l=>[...l.slice(-2), `"${filename}" — not a Lines file`])
      return
    }
    const users = rows
      .map(ln => migrationUserFromLine(ln, { id:makeId() }))
      .filter(Boolean)
    onChange({ ...data, users })
    setBulkText('')
    setBulkMsg('')
    setImportLog(l=>[...l.slice(-2), `${users.length} users imported from "${filename}" — enter each NetSapiens extension below`])
  }

  const extRows = data.users || []
  const { missingIds, collisions } = useMemo(
    () => analyzeMigrationExtensions(extRows),
    [extRows],
  )
  const bulkExtensions = useMemo(() => parseBulkExtensions(bulkText), [bulkText])
  const bulkPreview = useMemo(
    () => previewBulkExtensionApply(extRows, bulkExtensions),
    [extRows, bulkExtensions],
  )

  function updateUser(id, f, v) { onChange({ ...data, users:(data.users||[]).map(u=>u.id===id?{...u,[f]:v}:u) }) }
  function addUser() { onChange({ ...data, users:[...(data.users||[]),{id:makeId(),dn:'',ext:'',firstName:'',lastName:'-',email:'',vmPin:'',dept:'',site:'',did:''}] }) }
  function removeUser(id) { onChange({ ...data, users:(data.users||[]).filter(u=>u.id!==id) }) }

  function applyBulk() {
    if (!bulkPreview.canApply) {
      setBulkMsg(bulkPreview.warning)
      return
    }
    onChange({ ...data, users: applyBulkExtensions(extRows, bulkExtensions) })
    setBulkMsg(`Applied ${bulkExtensions.length} extension${bulkExtensions.length===1?'':'s'} in user order.`)
  }

  function focusNextExtension(index) {
    const next = document.querySelector(`[data-mig-ext-index="${index + 1}"]`)
    if (next) {
      next.focus()
      next.select?.()
    }
  }

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

      {extRows.length > 0 && (
        <div className="mig-field-group">
          <div className="mig-field-group-title">Bulk Extensions</div>
          <p className="mig-hint">Paste one extension per line in the same order as the users below. Counts must match before apply.</p>
          <textarea
            className="mig-textarea"
            rows={Math.min(8, Math.max(3, extRows.length))}
            value={bulkText}
            onChange={e=>{ setBulkText(e.target.value); setBulkMsg('') }}
            placeholder={'1001\n1002\n1003'}
          />
          <div className="mig-bulk-meta">
            <span>{bulkPreview.extensionCount} extension{bulkPreview.extensionCount===1?'':'s'} · {bulkPreview.userCount} user{bulkPreview.userCount===1?'':'s'}</span>
            <button type="button" className="btn btn-secondary" disabled={!bulkPreview.canApply} onClick={applyBulk}>
              Apply to users
            </button>
          </div>
          {bulkPreview.warning && <div className="mns-error" style={{marginTop:8}}>{bulkPreview.warning}</div>}
          {!bulkPreview.warning && bulkMsg && <div className="mig-ok-msg" style={{marginTop:8}}>{bulkMsg}</div>}
          {bulkPreview.canApply && bulkPreview.preview.length > 0 && (
            <div className="mig-bulk-preview">
              {bulkPreview.preview.slice(0, 5).map(row => (
                <div key={row.id} className="mig-bulk-preview-row">
                  <span className="mns-td-mono">{row.dn || '—'}</span>
                  <span>{row.name}</span>
                  <span className="mns-td-mono">{row.currentExt || '—'}</span>
                  <span>→</span>
                  <span className="mns-td-mono">{row.nextExt}</span>
                </div>
              ))}
              {bulkPreview.preview.length > 5 && (
                <div className="mns-hint">…and {bulkPreview.preview.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      )}

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
                  {extRows.map((u, index) => {
                    const clash = collisions.has(u.ext)
                    const missing = missingIds.has(u.id)
                    return (
                      <tr key={u.id} className={clash||missing?'mns-row-collision':''}>
                        <td className="mns-td-mono">{u.dn||'—'}</td>
                        <td>
                          <input
                            className={`mns-ext-input${clash||missing?' is-collision':''}`}
                            data-mig-ext-index={index}
                            value={u.ext||''}
                            onChange={e=>updateUser(u.id,'ext',normalizeMigrationExtension(e.target.value))}
                            onKeyDown={e=>{
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                focusNextExtension(index)
                              }
                            }}
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
  const { duplicateExtensions, deviceCounts, approvalKeys } = useMemo(
    () => analyzeDeviceExtensionAssignments(data.devices, extByDN),
    [data.devices, extByDN],
  )
  const approvedKeys = new Set(data.sharedDeviceApprovals || [])
  const unapprovedExtensions = new Set(
    [...duplicateExtensions].filter(ext => !approvedKeys.has(approvalKeys[ext])),
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
      const model = netSapiensPhoneModel(MODEL_MAP[key] || d['Device Model'] || '')
      const dn = normDN(d['Subscriber Directory Number'])
      return { id:makeId(), mac, model, dn, line1:'', line2:'', notes:d['Description']||'' }
    }).filter(Boolean)
    onChange({ ...data, devices, sharedDeviceApprovals:[] })
    setImportLog(l=>[...l.slice(-2), `${devices.length} devices imported from "${filename}"`])
  }

  function updateDevice(id, f, v) { onChange({ ...data, devices:data.devices.map(d=>d.id===id?{...d,[f]:v}:d) }) }
  function addDevice() { onChange({ ...data, devices:[...(data.devices||[]),{id:makeId(),mac:'',model:'',dn:'',line1:'',line2:'',notes:''}] }) }
  function removeDevice(id) { onChange({ ...data, devices:(data.devices||[]).filter(d=>d.id!==id) }) }
  function setSharedExtensionApproved(extension, approved) {
    const key = approvalKeys[extension]
    const next = new Set(data.sharedDeviceApprovals || [])
    if (approved) next.add(key)
    else next.delete(key)
    onChange({ ...data, sharedDeviceApprovals:[...next] })
  }

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
          {unapprovedExtensions.size > 0 && (
            <span className="mig-warn-badge">
              {unapprovedExtensions.size} shared extension{unapprovedExtensions.size>1?'s':''}
            </span>
          )}
          {duplicateExtensions.size > 0 && unapprovedExtensions.size === 0 && (
            <span className="mig-ok-badge">Shared phones approved</span>
          )}
        </div>
        {duplicateExtensions.size > 0 && (
          <div className={unapprovedExtensions.size > 0?'mns-error':'mig-shared-approved'} style={{marginBottom:10}}>
            {[...duplicateExtensions].map(ext => (
              <label key={ext} className="mig-shared-review-row">
                <input
                  type="checkbox"
                  checked={approvedKeys.has(approvalKeys[ext])}
                  onChange={e=>setSharedExtensionApproved(ext,e.target.checked)}
                />
                Extension {ext} is assigned to {deviceCounts[ext]} devices. This is intentional.
              </label>
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
                  const extension = normalizeMigrationExtension(l1)
                  const sharedExtension = unapprovedExtensions.has(extension)
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

/* ════════════════════════════════════════════════════════════
   STEP 4 — System Config (side-by-side Meta / NetSapiens checklist)
   ════════════════════════════════════════════════════════════ */
function StepSystem({ data, onChange }) {
  const checks = data.systemConfig || {}
  const doneCount = SYSTEM_CONFIG_CHECKS.filter(item => !!checks[item.key]).length

  function toggle(key) {
    onChange({
      ...data,
      systemConfig: {
        ...checks,
        [key]: !checks[key],
      },
    })
  }

  return (
    <div className="mig-step-body">
      <p className="mig-step-desc">
        Build Meta and NetSapiens side by side. Use this checklist so you are not retyping the same
        routing into this app — configure both platforms directly, then mark each item complete.
      </p>

      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          Side-by-side build
          <span className="mig-count-badge">{doneCount}/{SYSTEM_CONFIG_CHECKS.length}</span>
          {doneCount === SYSTEM_CONFIG_CHECKS.length && (
            <span className="mig-ok-badge">Complete</span>
          )}
        </div>
        <p className="mig-hint">
          Open Meta and NetSapiens in separate windows. Review the live Meta config, rebuild it in NS,
          then check it off here.
        </p>
        {SYSTEM_CONFIG_CHECKS.map(item => {
          const done = !!checks[item.key]
          return (
            <div
              key={item.key}
              className={`mig-check-row${done?' is-done':''}`}
              onClick={()=>toggle(item.key)}
            >
              <div className={`mig-check-box${done?' is-checked':''}`}>{done?'✓':''}</div>
              <div className="mig-check-content">
                <div className="mig-check-label">{item.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   STEP 5 — Build
   ════════════════════════════════════════════════════════════ */
function StepBuild({ data, onChange }) {
  function toggleDone(key) {
    onChange({ ...data, build:{ ...(data.build||{}), [key]:!(data.build||{})[key] } })
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
        'voicemail pin':'', 'department':u.dept||'', 'site':u.site||'',
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
      'MAC':d.mac,'Model':netSapiensPhoneModel(d.model),'Server':data.server,
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
  const systemConfig = data.systemConfig || {}
  const domain = data.domain || 'DOMAIN'
  const systemDone = SYSTEM_CONFIG_CHECKS.filter(item => !!systemConfig[item.key]).length
  const importKeys = ['usersImported', 'phonesImported', 'e911Imported']
  const testKeys = ['test_main', 'test_aa', 'test_hg', 'test_vm', 'test_night', 'test_e911']
  const importDone = importKeys.filter(key => !!b[key]).length
  const testDone = testKeys.filter(key => !!b[key]).length
  const totalItems = SYSTEM_CONFIG_CHECKS.length + importKeys.length + testKeys.length
  const doneCount = systemDone + importDone + testDone
  const pct = Math.round((doneCount / Math.max(totalItems, 1)) * 100)

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

      <div className="mig-field-group">
        <div className="mig-field-group-title" style={{display:'flex',alignItems:'center',gap:8}}>
          System Config
          <span className="mig-count-badge">{systemDone}/{SYSTEM_CONFIG_CHECKS.length}</span>
        </div>
        <p className="mig-hint">Tracked in the System Config step while you build Meta and NetSapiens side by side.</p>
        {SYSTEM_CONFIG_CHECKS.map(item => (
          <div key={item.key} className={`mig-check-row${systemConfig[item.key]?' is-done':''}`}>
            <div className={`mig-check-box${systemConfig[item.key]?' is-checked':''}`}>{systemConfig[item.key]?'✓':''}</div>
            <div className="mig-check-content">
              <div className="mig-check-label">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

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
const PHASES = [
  { id:'pre',     label:'Pre-Migration', steps:[0,1,2,3]    },
  { id:'config',  label:'Configuration', steps:[4,5,6,7,8]  },
  { id:'cutover', label:'Cutover',       steps:[9,10,11]    },
  { id:'post',    label:'Post-Cutover',  steps:[12,13]      },
]
const STEPS = [
  { id:0,  label:'Kickoff'          },
  { id:1,  label:'Hardware Audit'   },
  { id:2,  label:'Feature Inventory'},
  { id:3,  label:'Site Planning'    },
  { id:4,  label:'Account Setup'    },
  { id:5,  label:'Users'            },
  { id:6,  label:'Devices'          },
  { id:7,  label:'System Config'    },
  { id:8,  label:'Build'            },
  { id:9,  label:'Go / No-Go'       },
  { id:10, label:'Runbook'          },
  { id:11, label:'Phone Tracker'    },
  { id:12, label:'Test Calls'       },
  { id:13, label:'Sign-off'         },
]

function StepIndicator({ current, onGoto }) {
  return (
    <div className="mig-wizard-phases no-print">
      {PHASES.map(phase => {
        const isActive = phase.steps.includes(current)
        const isDone   = phase.steps.every(s => s < current)
        return (
          <div key={phase.id} className={`mig-phase-block${isActive?' is-active':isDone?' is-done':''}`}>
            <div className="mig-phase-label">{isDone ? '✓ ' : ''}{phase.label}</div>
            <div className="mig-phase-steps">
              {phase.steps.map(sid => {
                const s = STEPS.find(x => x.id === sid)
                const stepDone   = sid < current
                const stepActive = sid === current
                return (
                  <button key={sid} type="button"
                    className={`mig-phase-step${stepActive?' is-active':stepDone?' is-done':''}`}
                    onClick={() => onGoto(sid)}
                    title={s.label}>
                    {stepDone ? '✓' : (sid + 1)}
                  </button>
                )
              })}
            </div>
            {isActive && (
              <div className="mig-phase-current-label">{STEPS.find(s => s.id === current)?.label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   ROOT
   ════════════════════════════════════════════════════════════ */
function normalizeLoadedMigration(loaded) {
  const base = emptyMigration()
  if (!loaded) return base
  return {
    ...base,
    ...loaded,
    // Keep legacy AA/CF/HG/layout arrays if present; never require them for the new UI.
    autoAttendants: loaded.autoAttendants || [],
    callFlows: loaded.callFlows || [],
    huntGroups: loaded.huntGroups || [],
    buttonLayouts: loaded.buttonLayouts || [],
    sharedDeviceApprovals: loaded.sharedDeviceApprovals || [],
    systemConfig: loaded.systemConfig || {},
    build: loaded.build || {},
  }
}

export default function MigrationWorkspace({ jobId }) {
  const [data, setData]   = useState(() => normalizeLoadedMigration(loadJobMigration(jobId)))
  const [step, setStep]   = useState(0)
  const saveTimer = useRef(null)

  useEffect(() => {
    setData(normalizeLoadedMigration(loadJobMigration(jobId)))
  }, [jobId])

  function handleChange(next) {
    setData(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveJobMigration(jobId, next), 600)
  }

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const STEP_COMPONENTS = [
    <StepKickoff         key="kickoff"  data={data} onChange={handleChange}/>,
    <StepHardwareAudit   key="hw"       data={data} onChange={handleChange}/>,
    <StepFeatureInventory key="feat"    data={data} onChange={handleChange}/>,
    <StepSites           key="sites"    data={data} onChange={handleChange}/>,
    <StepAccount         key="account"  data={data} onChange={handleChange}/>,
    <StepUsers           key="users"    data={data} onChange={handleChange}/>,
    <StepDevices         key="devices"  data={data} onChange={handleChange}/>,
    <StepSystem          key="system"   data={data} onChange={handleChange}/>,
    <StepBuild           key="build"    data={data} onChange={handleChange} jobId={jobId}/>,
    <StepGoNoGo          key="gonogo"   data={data} onChange={handleChange}/>,
    <StepRunbook         key="runbook"  data={data} onChange={handleChange}/>,
    <StepPhoneTracker    key="phones"   data={data} onChange={handleChange}/>,
    <StepTestCalls       key="tests"    data={data} onChange={handleChange}/>,
    <StepSignoff         key="signoff"  data={data} onChange={handleChange}/>,
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
          {step===STEPS.length-2 ? 'Go to Sign-off →' : step===STEPS.length-1 ? 'Done' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
