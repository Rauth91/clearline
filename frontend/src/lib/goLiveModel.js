/**
 * Go-Live workspace model + exports
 */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filenameBase(golive, meta, ext) {
  const name = meta?.customer || golive?.handoff?.company || 'go-live'
  return `${name.replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'go-live'}-golive-${new Date().toISOString().slice(0, 10)}.${ext}`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const DEFAULT_INSTALL_ITEMS = [
  { id: 'vlan', label: 'Voice VLAN confirmed', done: false, notes: '', doneAt: null, doneBy: '', gated: false },
  { id: 'qos', label: 'QoS / DSCP verified (EF 46 for RTP, CS3 24 for SIP) — verify, do not block', done: false, notes: '', doneAt: null, doneBy: '', gated: false },
  { id: 'phones', label: 'Phones staged / labeled', done: false, notes: '', doneAt: null, doneBy: '', gated: false },
  { id: 'program', label: 'PBX programming spot-checked', done: false, notes: '', doneAt: null, doneBy: '', gated: false },
  { id: 'e911-locs', label: 'E911 locations verified in carrier portal', done: false, notes: '', doneAt: null, doneBy: '', gated: true },
  { id: 'e911', label: 'E911 address verified', done: false, notes: '', doneAt: null, doneBy: '', gated: true },
  { id: 'e911-test', label: '911 test call completed', done: false, notes: '', doneAt: null, doneBy: '', gated: true },
  { id: 'smoke', label: 'Inbound / outbound smoke tests passed', done: false, notes: '', doneAt: null, doneBy: '', gated: false },
]

const REMOVED_INSTALL_IDS = new Set(['poe', 'mdf'])

export function createEmptyGoLive() {
  return {
    cutover: {
      portDate: '',
      window: '',
      sequence: '',
      rollback: '',
      customerComms: '',
      notes: '',
    },
    install: {
      items: DEFAULT_INSTALL_ITEMS.map(i => ({ ...i })),
      notes: '',
    },
    handoff: {
      trainingDone: '',
      adminName: '',
      adminPhone: '',
      adminEmail: '',
      supportEscalation: '',
      signOffName: '',
      signOffDate: '',
      notes: '',
    },
    e911Test: null,
    assumptions: '',
  }
}

export function mergeGoLive(saved) {
  const empty = createEmptyGoLive()
  if (!saved || typeof saved !== 'object') return empty
  const rawItems = Array.isArray(saved.install?.items) && saved.install.items.length
    ? saved.install.items.filter(i => !REMOVED_INSTALL_IDS.has(i.id))
    : empty.install.items
  const byId = Object.fromEntries(rawItems.map(i => [i.id, i]))
  const items = DEFAULT_INSTALL_ITEMS.map(def => ({
    ...def,
    ...(byId[def.id] || {}),
    id: def.id,
    label: def.label,
    gated: def.gated,
    doneAt: byId[def.id]?.doneAt ?? def.doneAt ?? null,
    doneBy: byId[def.id]?.doneBy ?? def.doneBy ?? '',
  }))
  // Preserve any custom items not in defaults
  for (const item of rawItems) {
    if (!DEFAULT_INSTALL_ITEMS.some(d => d.id === item.id)) {
      items.push({
        done: false,
        notes: '',
        doneAt: null,
        doneBy: '',
        gated: false,
        ...item,
      })
    }
  }
  let e911Test = null
  if (saved.e911Test && typeof saved.e911Test === 'object') {
    e911Test = {
      testedAt: saved.e911Test.testedAt || null,
      testedBy: saved.e911Test.testedBy || '',
      method: saved.e911Test.method || '',
    }
  }
  return {
    ...empty,
    ...saved,
    cutover: { ...empty.cutover, ...saved.cutover },
    install: { ...empty.install, ...saved.install, items },
    handoff: { ...empty.handoff, ...saved.handoff },
    e911Test,
  }
}

export function sectionProgressGoLive(golive, id) {
  const data = mergeGoLive(golive)
  if (id === 'cutover') {
    const values = Object.values(data.cutover)
    const filled = values.filter(v => String(v || '').trim()).length
    const total = Math.max(1, values.length)
    return { filled, total, ratio: filled / total }
  }
  if (id === 'install') {
    const items = data.install.items || []
    const done = items.filter(i => i.done).length
    const total = Math.max(1, items.length)
    return { filled: done, total, ratio: done / total }
  }
  if (id === 'provision') {
    // Filled when linked design/survey has users or numbers — caller may override
    return { filled: 0, total: 1, ratio: 0 }
  }
  if (id === 'handoff') {
    const fields = [
      data.handoff.trainingDone,
      data.handoff.adminName,
      data.handoff.adminPhone,
      data.handoff.adminEmail,
      data.handoff.supportEscalation,
      data.handoff.signOffName,
      data.handoff.signOffDate,
      data.handoff.notes,
    ]
    const filled = fields.filter(v => String(v || '').trim()).length
    const total = Math.max(1, fields.length)
    return { filled, total, ratio: filled / total }
  }
  return { filled: 0, total: 1, ratio: 0 }
}

export function goLiveCompletionPercent(golive, provisionRatio = 0) {
  const ids = ['cutover', 'install', 'handoff']
  const ratios = ids.map(id => sectionProgressGoLive(golive, id).ratio)
  ratios.push(provisionRatio)
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return Math.round(avg * 100)
}

export function buildGoLiveHtmlReport(golive, meta = {}, provision = {}, options = {}) {
  const forPdf = Boolean(options.forPdf)
  const data = mergeGoLive(golive)
  const pageClass = forPdf ? 'report-page' : ''
  const items = (data.install.items || [])
    .map(i => `<tr><td>${i.done ? '☑' : '☐'}</td><td>${esc(i.label)}</td><td>${esc(i.notes)}</td></tr>`)
    .join('')

  const users = (provision.users || [])
    .map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email || '')}</td><td>${esc(u.extension)}</td><td>${esc(u.did)}</td><td>${esc(u.role)}</td><td>${esc(u.voicemail)}</td></tr>`)
    .join('')
  const mains = (provision.mainNumbers || [])
    .map(n => `<tr><td>${esc(n.label)}</td><td>${esc(n.number)}</td><td>${esc(n.notes)}</td></tr>`)
    .join('')
  const aa = (provision.aaOptions || [])
    .map(o => `<tr><th>Press ${esc(o.digit)}</th><td>${esc(o.action)}</td></tr>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Go-Live — ${esc(meta.customer || 'ClearLine')}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: Inter, Helvetica, Arial, sans-serif; color: #1d1d1f; background: #fff; margin: 0; padding: ${forPdf ? '0' : '24px'}; line-height: 1.45; }
  .report-page { width: 768px; margin: 0 auto 28px; padding: 36px 40px; box-sizing: border-box; page-break-after: always; }
  h1 { font-size: 28px; letter-spacing: -0.04em; margin: 0 0 6px; }
  h2 { font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; color: #6e6e73; margin: 28px 0 10px; border-bottom: 1px solid #e5e5ea; padding-bottom: 6px; }
  .kicker { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #6e6e73; font-weight: 700; }
  .meta { color: #6e6e73; font-size: 13px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #ececef; }
  th { width: 34%; color: #6e6e73; font-weight: 600; }
  .muted { color: #6e6e73; font-size: 12px; }
</style>
</head>
<body>
  <section class="${pageClass}">
    <div class="kicker">ClearLine · Go-Live</div>
    <h1>${esc(meta.customer || 'Go-Live')}</h1>
    <div class="meta">
      ${esc(meta.site || 'Site TBD')}
      ${meta.ticket ? ` · ${esc(meta.ticket)}` : ''}
      · ${new Date().toLocaleDateString()}
    </div>

    <h2>Cutover</h2>
    <table>
      <tr><th>Port date</th><td>${esc(data.cutover.portDate) || '—'}</td></tr>
      <tr><th>Window</th><td>${esc(data.cutover.window) || '—'}</td></tr>
      <tr><th>Sequence</th><td>${esc(data.cutover.sequence).replace(/\n/g, '<br>') || '—'}</td></tr>
      <tr><th>Rollback</th><td>${esc(data.cutover.rollback).replace(/\n/g, '<br>') || '—'}</td></tr>
      <tr><th>Customer comms</th><td>${esc(data.cutover.customerComms).replace(/\n/g, '<br>') || '—'}</td></tr>
    </table>

    <h2>Install checklist</h2>
    <table>
      <tr><th></th><th>Item</th><th>Notes</th></tr>
      ${items || '<tr><td colspan="3" class="muted">None</td></tr>'}
    </table>
  </section>

  <section class="${pageClass}">
    <h2>Provisioning sheet</h2>
    <h3 style="font-size:13px;color:#6e6e73;">Main numbers</h3>
    <table>
      <tr><th>Label</th><th>Number</th><th>Notes</th></tr>
      ${mains || '<tr><td colspan="3" class="muted">None — complete Design first</td></tr>'}
    </table>
    <h3 style="font-size:13px;color:#6e6e73;margin-top:18px;">Users</h3>
    <table>
      <tr><th>Name</th><th>Email</th><th>Ext</th><th>DID</th><th>Role</th><th>VM</th></tr>
      ${users || '<tr><td colspan="6" class="muted">None</td></tr>'}
    </table>
    <h3 style="font-size:13px;color:#6e6e73;margin-top:18px;">Auto attendant</h3>
    <table>${aa || '<tr><td class="muted">No menu options</td></tr>'}</table>

    <h2>Customer handoff</h2>
    <table>
      <tr><th>Training done</th><td>${esc(data.handoff.trainingDone)}</td></tr>
      <tr><th>Admin</th><td>${esc(data.handoff.adminName)} ${esc(data.handoff.adminPhone)} ${esc(data.handoff.adminEmail)}</td></tr>
      <tr><th>Support escalation</th><td>${esc(data.handoff.supportEscalation).replace(/\n/g, '<br>') || '—'}</td></tr>
      <tr><th>Sign-off</th><td>${esc(data.handoff.signOffName)} · ${esc(data.handoff.signOffDate)}</td></tr>
      <tr><th>Notes</th><td>${esc(data.handoff.notes).replace(/\n/g, '<br>') || '—'}</td></tr>
    </table>
    <h2>Assumptions</h2>
    <p>${esc(data.assumptions || 'None').replace(/\n/g, '<br>')}</p>
  </section>
</body>
</html>`
}

export function buildHandoffHtml(golive, job = {}, provision = {}, supportEmail = '') {
  const data = mergeGoLive(golive)
  const customer = esc(job.customer || job.name || 'Your Company')
  const site = esc(job.site || '')
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const mainNumbers = (provision.mainNumbers || [])
    .filter(n => String(n.number || n.label || '').trim())
    .map(n => `<tr><td>${esc(n.label || '—')}</td><td class="mono">${esc(n.number || '—')}</td><td>${esc(n.notes || '')}</td></tr>`)
    .join('')

  const users = (provision.users || [])
    .map(u => `<tr><td>${esc(u.name)}</td><td class="mono">${esc(u.extension)}</td><td class="mono">${esc(u.did || '')}</td><td>${esc(u.role || '')}</td><td>${u.voicemail ? 'Yes' : ''}</td></tr>`)
    .join('')

  const aaRows = (provision.aaOptions || [])
    .map(o => `<tr><td class="mono">Press ${esc(o.digit)}</td><td>${esc(o.action)}</td></tr>`)
    .join('')

  const adminName = esc(data.handoff.adminName || '')
  const adminPhone = esc(data.handoff.adminPhone || '')
  const adminEmail = esc(data.handoff.adminEmail || '')
  const escalation = esc(data.handoff.supportEscalation || '').replace(/\n/g, '<br>')
  const notes = esc(data.handoff.notes || '').replace(/\n/g, '<br>')
  const supportHtml = supportEmail
    ? `<a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a>`
    : ''

  // Night button / hours note
  const hoursNote = (() => {
    const h = provision.hours
    if (!h) return ''
    const hasOpen = h.open && String(h.open).trim()
    const hasClose = h.close && String(h.close).trim()
    if (!hasOpen && !hasClose) return ''
    return `<p>Business hours: <strong>${esc(h.open || '')} – ${esc(h.close || '')}</strong>. After hours, callers are routed to voicemail or an after-hours auto attendant — no action needed on your end.</p>`
  })()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Phone System Handoff — ${customer}</title>
<style>
  @page { size: letter; margin: 0.7in 0.75in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 32px 40px; line-height: 1.5; font-size: 14px; }
  @media print { body { padding: 0; } }
  .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #e5e5ea; padding-bottom: 16px; margin-bottom: 28px; }
  .header-left {}
  .brand { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #6e6e73; font-weight: 700; margin-bottom: 6px; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 4px; }
  .site { color: #6e6e73; font-size: 13px; }
  .date { font-size: 12px; color: #6e6e73; text-align: right; margin-top: 4px; }
  h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6e73; font-weight: 600; margin: 28px 0 10px; border-bottom: 1px solid #e5e5ea; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #f0f0f5; vertical-align: top; font-size: 13px; }
  th { font-weight: 600; color: #6e6e73; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; background: #f9f9fb; }
  .mono { font-family: 'SF Mono', 'Menlo', 'Fira Mono', monospace; font-size: 12px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
  .meta-item label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6e73; font-weight: 600; display: block; margin-bottom: 2px; }
  .meta-item p { margin: 0; font-size: 13px; }
  .help-box { background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 14px 16px; border-radius: 4px; margin-top: 20px; font-size: 13px; }
  .help-box strong { display: block; margin-bottom: 4px; }
  .vm-steps { margin: 8px 0 0 0; padding-left: 20px; }
  .vm-steps li { margin-bottom: 4px; }
  .footer { margin-top: 36px; border-top: 1px solid #e5e5ea; padding-top: 14px; color: #6e6e73; font-size: 11px; display: flex; justify-content: space-between; }
  .muted { color: #6e6e73; font-style: italic; }
  a { color: #2563eb; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="brand">ClearLine · Phone System</div>
    <h1>${customer}</h1>
    ${site ? `<div class="site">${site}</div>` : ''}
  </div>
  <div class="date">Handoff document<br>${today}</div>
</div>

<h2>Main phone numbers</h2>
${mainNumbers
  ? `<table><thead><tr><th>Label</th><th>Number</th><th>Notes</th></tr></thead><tbody>${mainNumbers}</tbody></table>`
  : '<p class="muted">No numbers documented — contact your provider.</p>'}

${users ? `
<h2>Extension directory</h2>
<table>
  <thead><tr><th>Name</th><th>Ext</th><th>Direct number</th><th>Role</th><th>Voicemail</th></tr></thead>
  <tbody>${users}</tbody>
</table>` : ''}

${aaRows ? `
<h2>Auto attendant menu</h2>
<table><tbody>${aaRows}</tbody></table>` : ''}

<h2>Voicemail access</h2>
<p>To check your voicemail from your desk phone:</p>
<ol class="vm-steps">
  <li>Press the <strong>Messages</strong> button (envelope icon) or dial <strong>*97</strong></li>
  <li>Enter your extension number when prompted, then your PIN</li>
  <li>Follow the menu prompts to listen, delete, or save messages</li>
</ol>
<p>To check voicemail from outside the office, dial your main number and press <strong>#</strong> during the greeting, then enter your extension and PIN.</p>

${hoursNote}

<h2>After-hours &amp; night mode</h2>
<p>Your system automatically switches to after-hours routing based on your configured business hours. If you need to manually toggle night mode (for holidays or unexpected closures), press the <strong>Night</strong> button on the designated front-desk phone, or contact your provider.</p>

<h2>Your admin contact</h2>
<div class="meta-grid">
  ${adminName ? `<div class="meta-item"><label>Name</label><p>${adminName}</p></div>` : ''}
  ${adminPhone ? `<div class="meta-item"><label>Phone</label><p>${adminPhone}</p></div>` : ''}
  ${adminEmail ? `<div class="meta-item"><label>Email</label><p><a href="mailto:${adminEmail}">${adminEmail}</a></p></div>` : ''}
</div>

${escalation ? `
<h2>Support escalation</h2>
<p>${escalation}</p>` : ''}

${notes ? `
<h2>Notes</h2>
<p>${notes}</p>` : ''}

<div class="help-box">
  <strong>Need help?</strong>
  ${supportHtml ? `Email us at ${supportHtml} and we'll take care of it.` : 'Contact your provider for any questions or changes.'}
</div>

<div class="footer">
  <span>${customer} · Phone system handoff · ${today}</span>
  <span>Powered by ClearLine</span>
</div>

</body>
</html>`
}

export function exportHandoffDoc(golive, job, provision, supportEmail) {
  const html = buildHandoffHtml(golive, job, provision, supportEmail)
  const filename = (() => {
    const name = (job?.customer || job?.name || 'go-live')
      .replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'go-live'
    return `${name}-handoff-${new Date().toISOString().slice(0, 10)}.html`
  })()
  const win = window.open('', '_blank')
  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename)
  }
}

export function exportGoLiveHtml(golive, meta, provision) {
  const html = buildGoLiveHtmlReport(golive, meta, provision)
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filenameBase(golive, meta, 'html'))
}

export function exportGoLiveDoc(golive, meta, provision) {
  const html = buildGoLiveHtmlReport(golive, meta, provision)
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
    filenameBase(golive, meta, 'doc'),
  )
}

export async function downloadGoLivePdf(golive, meta, provision) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const html = buildGoLiveHtmlReport(golive, meta, provision, { forPdf: true })
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:816px;height:1100px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    throw new Error('Could not prepare the PDF renderer.')
  }

  doc.open()
  doc.write(html)
  doc.close()
  await new Promise(r => setTimeout(r, 250))

  try {
    const pages = Array.from(doc.querySelectorAll('.report-page'))
    const targets = pages.length ? pages : [doc.body]
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 24
    const usableWidth = pageWidth - margin * 2
    const usableHeight = pageHeight - margin * 2
    let first = true

    for (const target of targets) {
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 816,
      })
      const imgWidth = usableWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.93)
      let heightLeft = imgHeight
      let offsetY = 0
      let slice = 0
      while (heightLeft > 8 || slice === 0) {
        if (!first) pdf.addPage()
        first = false
        pdf.addImage(imgData, 'JPEG', margin, margin + offsetY, imgWidth, imgHeight)
        heightLeft -= usableHeight
        offsetY -= usableHeight
        slice += 1
        if (slice > 20) break
      }
    }

    pdf.save(filenameBase(golive, meta, 'pdf'))
  } finally {
    iframe.remove()
  }
}
