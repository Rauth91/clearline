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
  { id: 'vlan', label: 'Voice VLAN confirmed', done: false, notes: '' },
  { id: 'qos', label: 'QoS / DSCP verified', done: false, notes: '' },
  { id: 'poe', label: 'PoE budget checked', done: false, notes: '' },
  { id: 'phones', label: 'Phones staged / labeled', done: false, notes: '' },
  { id: 'program', label: 'PBX programming spot-checked', done: false, notes: '' },
  { id: 'mdf', label: 'MDF / IDF photos captured', done: false, notes: '' },
  { id: 'e911', label: 'E911 address verified', done: false, notes: '' },
  { id: 'smoke', label: 'Inbound / outbound smoke tests passed', done: false, notes: '' },
]

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
    assumptions: '',
  }
}

export function mergeGoLive(saved) {
  const empty = createEmptyGoLive()
  if (!saved || typeof saved !== 'object') return empty
  const items = Array.isArray(saved.install?.items) && saved.install.items.length
    ? saved.install.items
    : empty.install.items
  return {
    ...empty,
    ...saved,
    cutover: { ...empty.cutover, ...saved.cutover },
    install: { ...empty.install, ...saved.install, items },
    handoff: { ...empty.handoff, ...saved.handoff },
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
