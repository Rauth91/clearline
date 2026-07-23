/**
 * QuickCard — End-user phone reference card generator
 * Fill in details → print a clean one-page cheat sheet
 */

import { useState, useRef } from 'react'

const BLANK = {
  name: '',
  title: '',
  extension: '',
  directNumber: '',
  company: '',
  location: '',
  vmPin: '',
  vmAccess: '',
  holdKey: '',
  transferKey: '',
  conferenceKey: '',
  pagingKey: '',
  parkKey: '',
  dndKey: '',
  receptionist: '',
  aaNumber: '',
  techSupport: '',
  emergencyNumber: '',
  notes: '',
}

export default function QuickCard() {
  const [data, setData] = useState(BLANK)
  const [preview, setPreview] = useState(false)
  const printRef = useRef()

  function set(field, value) {
    setData(prev => ({ ...prev, [field]: value }))
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Phone Reference — ${data.name || 'User'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; padding: 32px; }
          h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
          .subtitle { font-size: 12px; color: #555; margin-bottom: 20px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .card { border: 1px solid #ddd; border-radius: 6px; padding: 16px; }
          .card-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
          .row:last-child { border-bottom: none; }
          .row-label { color: #555; }
          .row-value { font-weight: 600; font-family: 'SF Mono', 'Consolas', monospace; }
          .notes { font-size: 12px; color: #333; white-space: pre-wrap; margin-top: 4px; }
          .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
          .company { font-size: 11px; color: #888; font-weight: 500; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <div class="header-row">
          <div>
            <h1>${data.name || 'Phone Reference'}</h1>
            <div class="subtitle">${[data.title, data.location].filter(Boolean).join(' · ')}</div>
          </div>
          ${data.company ? `<div class="company">${data.company}</div>` : ''}
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">My Numbers</div>
            ${data.extension ? `<div class="row"><span class="row-label">Extension</span><span class="row-value">${data.extension}</span></div>` : ''}
            ${data.directNumber ? `<div class="row"><span class="row-label">Direct Number</span><span class="row-value">${data.directNumber}</span></div>` : ''}
            ${data.vmPin ? `<div class="row"><span class="row-label">Voicemail PIN</span><span class="row-value">${data.vmPin}</span></div>` : ''}
            ${data.vmAccess ? `<div class="row"><span class="row-label">Voicemail Access</span><span class="row-value">${data.vmAccess}</span></div>` : ''}
          </div>

          <div class="card">
            <div class="card-title">Phone Keys</div>
            ${data.holdKey ? `<div class="row"><span class="row-label">Hold</span><span class="row-value">${data.holdKey}</span></div>` : ''}
            ${data.transferKey ? `<div class="row"><span class="row-label">Transfer</span><span class="row-value">${data.transferKey}</span></div>` : ''}
            ${data.conferenceKey ? `<div class="row"><span class="row-label">Conference</span><span class="row-value">${data.conferenceKey}</span></div>` : ''}
            ${data.pagingKey ? `<div class="row"><span class="row-label">All Page</span><span class="row-value">${data.pagingKey}</span></div>` : ''}
            ${data.parkKey ? `<div class="row"><span class="row-label">Park</span><span class="row-value">${data.parkKey}</span></div>` : ''}
            ${data.dndKey ? `<div class="row"><span class="row-label">Do Not Disturb</span><span class="row-value">${data.dndKey}</span></div>` : ''}
          </div>

          <div class="card">
            <div class="card-title">Important Numbers</div>
            ${data.receptionist ? `<div class="row"><span class="row-label">Receptionist</span><span class="row-value">${data.receptionist}</span></div>` : ''}
            ${data.aaNumber ? `<div class="row"><span class="row-label">Auto-Attendant</span><span class="row-value">${data.aaNumber}</span></div>` : ''}
            ${data.techSupport ? `<div class="row"><span class="row-label">Tech Support</span><span class="row-value">${data.techSupport}</span></div>` : ''}
            ${data.emergencyNumber ? `<div class="row"><span class="row-label">Emergency</span><span class="row-value">${data.emergencyNumber}</span></div>` : ''}
          </div>

          ${data.notes ? `
          <div class="card">
            <div class="card-title">Notes</div>
            <div class="notes">${data.notes}</div>
          </div>` : ''}
        </div>
      </body>
      </html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 300)
  }

  return (
    <div className="qc-root">
      <div className="qc-header">
        <div className="qc-title">Quick Card Generator</div>
        <div className="qc-subtitle">Fill in the details and print a phone reference card for the end user</div>
      </div>

      <div className="qc-form">
        <div className="qc-section-label">User Info</div>
        <div className="qc-field-row">
          <div className="qc-field">
            <label className="qc-label">Name</label>
            <input className="qc-input" placeholder="John Smith" value={data.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Title</label>
            <input className="qc-input" placeholder="Office Manager" value={data.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Company</label>
            <input className="qc-input" placeholder="Acme Corp" value={data.company} onChange={e => set('company', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Location / Site</label>
            <input className="qc-input" placeholder="Main Office" value={data.location} onChange={e => set('location', e.target.value)} />
          </div>
        </div>

        <div className="qc-section-label" style={{ marginTop: 20 }}>Phone Numbers</div>
        <div className="qc-field-row">
          <div className="qc-field">
            <label className="qc-label">Extension</label>
            <input className="qc-input" placeholder="1001" value={data.extension} onChange={e => set('extension', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Direct Number (DID)</label>
            <input className="qc-input" placeholder="(555) 000-0000" value={data.directNumber} onChange={e => set('directNumber', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Voicemail PIN</label>
            <input className="qc-input" placeholder="1234" value={data.vmPin} onChange={e => set('vmPin', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Voicemail Access (ext or *98)</label>
            <input className="qc-input" placeholder="*98" value={data.vmAccess} onChange={e => set('vmAccess', e.target.value)} />
          </div>
        </div>

        <div className="qc-section-label" style={{ marginTop: 20 }}>Phone Keys</div>
        <div className="qc-field-row">
          <div className="qc-field">
            <label className="qc-label">Hold Key</label>
            <input className="qc-input" placeholder="Hold button" value={data.holdKey} onChange={e => set('holdKey', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Transfer Key</label>
            <input className="qc-input" placeholder="Transfer button" value={data.transferKey} onChange={e => set('transferKey', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Conference Key</label>
            <input className="qc-input" placeholder="Conf key or *8" value={data.conferenceKey} onChange={e => set('conferenceKey', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Paging Key</label>
            <input className="qc-input" placeholder="Key 4 — All Page" value={data.pagingKey} onChange={e => set('pagingKey', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Park Key</label>
            <input className="qc-input" placeholder="*82 or Park key" value={data.parkKey} onChange={e => set('parkKey', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Do Not Disturb</label>
            <input className="qc-input" placeholder="DND key or *78" value={data.dndKey} onChange={e => set('dndKey', e.target.value)} />
          </div>
        </div>

        <div className="qc-section-label" style={{ marginTop: 20 }}>Important Numbers</div>
        <div className="qc-field-row">
          <div className="qc-field">
            <label className="qc-label">Receptionist / Operator</label>
            <input className="qc-input" placeholder="0 or 1000" value={data.receptionist} onChange={e => set('receptionist', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Auto-Attendant Number</label>
            <input className="qc-input" placeholder="Main number" value={data.aaNumber} onChange={e => set('aaNumber', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Tech Support</label>
            <input className="qc-input" placeholder="Helpdesk extension or number" value={data.techSupport} onChange={e => set('techSupport', e.target.value)} />
          </div>
          <div className="qc-field">
            <label className="qc-label">Emergency</label>
            <input className="qc-input" placeholder="911" value={data.emergencyNumber} onChange={e => set('emergencyNumber', e.target.value)} />
          </div>
        </div>

        <div className="qc-section-label" style={{ marginTop: 20 }}>Notes</div>
        <textarea
          className="qc-textarea"
          placeholder="Any additional notes for the user (call forwarding steps, voicemail greeting tips, etc.)"
          value={data.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
        />

        <div className="qc-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={!data.name && !data.extension}
          >
            Print Reference Card
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setData(BLANK)}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
