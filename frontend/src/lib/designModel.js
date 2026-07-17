/**
 * System Design export helpers — HTML / Word / PDF
 */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filenameBase(design, ext) {
  const name = design.project?.customer || design.project?.site || 'system-design'
  return `${name.replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'system-design'}-design-${new Date().toISOString().slice(0, 10)}.${ext}`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sectionRows(obj = {}, labels = {}) {
  return Object.entries(obj)
    .filter(([, v]) => String(v || '').trim())
    .map(([k, v]) => `
      <tr>
        <th>${esc(labels[k] || labelize(k))}</th>
        <td>${esc(v).replace(/\n/g, '<br>')}</td>
      </tr>
    `).join('')
}

function labelize(value) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

function aaOptionsHtml(aa = {}) {
  const rows = []
  for (let i = 0; i <= 9; i += 1) {
    const v = String(aa[`option${i}`] || '').trim()
    if (v) rows.push(`<tr><th>Press ${i}</th><td>${esc(v)}</td></tr>`)
  }
  if (aa.timeoutAction) rows.push(`<tr><th>Timeout</th><td>${esc(aa.timeoutAction)}</td></tr>`)
  if (aa.invalidAction) rows.push(`<tr><th>Invalid</th><td>${esc(aa.invalidAction)}</td></tr>`)
  return rows.join('')
}

function callFlowAscii(design) {
  const main = (design.mainNumbers || []).find(n => n.number || n.label)
  const entry = main?.number || main?.label || 'Main DID'
  const opts = []
  for (let i = 0; i <= 9; i += 1) {
    const v = String(design.autoAttendant?.[`option${i}`] || '').trim()
    if (v) opts.push(`  ${i} → ${v}`)
  }
  const night = design.nightButton?.destination || design.callFlow?.afterHoursPath || 'After-hours path'
  return [
    entry,
    '  ├─ Open hours → Auto attendant',
    ...(opts.length ? opts : ['  │   (menu options TBD)']),
    `  └─ Closed / night → ${night}`,
  ].join('\n')
}

export function buildDesignHtmlReport(design, completion = {}, options = {}) {
  const forPdf = Boolean(options.forPdf)
  const p = design.project || {}
  const users = design.users || []
  const mains = design.mainNumbers || []
  const flow = callFlowAscii(design)

  const pageClass = forPdf ? 'report-page' : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>System Design — ${esc(p.customer || p.site || 'ClearLine')}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: Inter, Helvetica, Arial, sans-serif; color: #1d1d1f; background: #fff; margin: 0; padding: ${forPdf ? '0' : '24px'}; line-height: 1.45; }
  .report-page { width: 768px; margin: 0 auto 28px; padding: 36px 40px; box-sizing: border-box; page-break-after: always; }
  h1 { font-size: 28px; letter-spacing: -0.04em; margin: 0 0 6px; }
  h2 { font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; color: #6e6e73; margin: 28px 0 10px; border-bottom: 1px solid #e5e5ea; padding-bottom: 6px; }
  .kicker { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #6e6e73; font-weight: 700; }
  .meta { color: #6e6e73; font-size: 13px; margin-bottom: 18px; }
  .score { display: inline-block; border: 1px solid #d2d2d7; border-radius: 10px; padding: 10px 14px; margin: 12px 0 4px; }
  .score strong { font-size: 28px; letter-spacing: -0.04em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #ececef; }
  th { width: 34%; color: #6e6e73; font-weight: 600; }
  pre.flow { background: #f5f5f7; border: 1px solid #e5e5ea; border-radius: 10px; padding: 14px 16px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; white-space: pre-wrap; }
  .muted { color: #6e6e73; font-size: 12px; }
</style>
</head>
<body>
  <section class="${pageClass}">
    <div class="kicker">ClearLine · System design</div>
    <h1>${esc(p.customer || 'System design')}</h1>
    <div class="meta">
      ${esc(p.site || 'Site TBD')}
      ${p.designer ? ` · Prepared by ${esc(p.designer)}` : ''}
      ${p.targetDate ? ` · Target ${esc(p.targetDate)}` : ''}
      · ${new Date().toLocaleDateString()}
    </div>
    ${p.summary ? `<p>${esc(p.summary).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="score">
      <div class="kicker">Plan completion</div>
      <strong>${esc(completion.percent ?? 0)}%</strong>
      <div class="muted">${esc(completion.filled ?? 0)} / ${esc(completion.total ?? 0)} fields</div>
    </div>
  </section>

  <section class="${pageClass}">
    <h2>Call flow map</h2>
    <pre class="flow">${esc(flow)}</pre>

    <h2>Hours of operation</h2>
    <table>${sectionRows(design.hours) || '<tr><td class="muted">Not set</td></tr>'}</table>

    <h2>Holidays</h2>
    <table>${sectionRows(design.holidays) || '<tr><td class="muted">Not set</td></tr>'}</table>

    <h2>Auto attendant</h2>
    <table>
      ${sectionRows({ enabled: design.autoAttendant?.enabled, greeting: design.autoAttendant?.greeting, menuPrompt: design.autoAttendant?.menuPrompt, notes: design.autoAttendant?.notes })}
      ${aaOptionsHtml(design.autoAttendant)}
    </table>

    <h2>Night button</h2>
    <table>${sectionRows(design.nightButton) || '<tr><td class="muted">Not set</td></tr>'}</table>

    <h2>Voicemail</h2>
    <table>${sectionRows(design.voicemail) || '<tr><td class="muted">Not set</td></tr>'}</table>
  </section>

  <section class="${pageClass}">
    <h2>Main numbers</h2>
    <table>
      <tr><th>Label</th><th>Number</th><th>Notes</th></tr>
      ${mains.length ? mains.map(n => `<tr><td>${esc(n.label)}</td><td>${esc(n.number)}</td><td>${esc(n.notes)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">None</td></tr>'}
    </table>

    <h2>Users, extensions, DIDs</h2>
    <table>
      <tr><th>Name</th><th>Ext</th><th>DID</th><th>Role</th><th>VM</th></tr>
      ${users.length ? users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.extension)}</td><td>${esc(u.did)}</td><td>${esc(u.role)}</td><td>${esc(u.voicemail)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">None</td></tr>'}
    </table>

    <h2>Platform &amp; network</h2>
    <table>${sectionRows({ ...design.platform, ...design.network, ...design.devices })}</table>

    <h2>Notes and assumptions</h2>
    <p>${esc(design.assumptions || 'None documented.').replace(/\n/g, '<br>')}</p>
  </section>
</body>
</html>`
}

export function exportDesignHtml(design, completion) {
  const html = buildDesignHtmlReport(design, completion)
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filenameBase(design, 'html'))
}

export function exportDesignDoc(design, completion) {
  const html = buildDesignHtmlReport(design, completion)
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
    filenameBase(design, 'doc'),
  )
}

export async function downloadDesignPdf(design, completion) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const html = buildDesignHtmlReport(design, completion, { forPdf: true })
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

    pdf.save(filenameBase(design, 'pdf'))
  } finally {
    iframe.remove()
  }
}

/** Per-section fill ratio for progress chips */
export function sectionProgress(design, sectionId) {
  const data = design[sectionId]
  if (!data || typeof data !== 'object') return { filled: 0, total: 1, ratio: 0 }
  const values = Object.values(data)
  const total = Math.max(1, values.length)
  const filled = values.filter(v => String(v || '').trim()).length
  return { filled, total, ratio: filled / total }
}
