import {
  EMPTY_SPEEDTEST,
  EMPTY_VISUALWARE,
  emptySpeedtestRuns,
  emptyVisualwareRuns,
  normalizeNetworkSurvey,
} from './networkReadiness.js'

const DRAFT_KEY = 'voip-ops-survey-draft'

export function createEmptySurvey() {
  return normalizeNetworkSurvey({
    id: crypto.randomUUID?.() || `${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customer: {
      company: '',
      siteName: '',
      address: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      ticketId: '',
      notes: '',
    },
    techName: '',
    phoneCount: '',
    mainNumbers: [],
    users: [],
    speedtests: emptySpeedtestRuns(),
    visualwareRuns: emptyVisualwareRuns(),
    speedtest: { ...EMPTY_SPEEDTEST },
    visualware: { ...EMPTY_VISUALWARE },
    photos: [],
    topology: defaultTopology(),
  })
}

export function defaultTopology() {
  return {
    nodes: [],
    links: [],
  }
}

export function newTopologyNode(type, patch = {}) {
  return {
    id: makeId(),
    type,
    label: type === 'Switch' ? 'PoE Switch' : type,
    phone: '',
    extension: '',
    mac: '',
    ip: '',
    location: '',
    notes: '',
    portCount: defaultPortCount(type),
    x: 100,
    y: 100,
    ...patch,
  }
}

export function makeId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : createEmptySurvey()
  } catch {
    return createEmptySurvey()
  }
}

export function saveDraft(survey) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...survey, updatedAt: new Date().toISOString() }))
  } catch {
    // Large photo-heavy surveys may exceed browser storage. Export still works.
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

export function downloadJson(survey) {
  const blob = new Blob([JSON.stringify(survey, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filenameBase(survey, 'json'))
}

export function exportHtmlReport(survey, readiness) {
  const html = buildHtmlReport(survey, readiness)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  downloadBlob(blob, filenameBase(survey, 'html'))
}

/**
 * Downloads a real PDF file of the site survey report.
 * Each .report-page becomes its own PDF page (or continued pages if tall).
 */
export async function downloadPdfReport(survey, readiness) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const html = buildHtmlReport(survey, readiness, { forPdf: true })
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:816px;height:1100px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    throw new Error('Could not prepare the PDF renderer.')
  }

  doc.open()
  doc.write(html)
  doc.close()

  await waitForDocumentReady(doc)
  await waitForImages(doc)
  // Give layout/fonts a beat
  await new Promise(r => setTimeout(r, 200))

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

    pdf.save(filenameBase(survey, 'pdf'))
  } finally {
    iframe.remove()
  }
}

function waitForDocumentReady(doc) {
  return new Promise(resolve => {
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
      resolve()
      return
    }
    const timer = setInterval(() => {
      if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        clearInterval(timer)
        resolve()
      }
    }, 40)
    setTimeout(() => {
      clearInterval(timer)
      resolve()
    }, 2000)
  })
}

function waitForImages(doc) {
  const images = Array.from(doc.images || [])
  if (!images.length) return Promise.resolve()
  return Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve()
    return new Promise(resolve => {
      img.onload = resolve
      img.onerror = resolve
      setTimeout(resolve, 2500)
    })
  }))
}

/**
 * Word-friendly .doc download (HTML that Word / Google Docs can open and edit).
 */
export function exportEditableDoc(survey, readiness) {
  const html = buildHtmlReport(survey, readiness)
  const blob = new Blob(
    ['\ufeff', html],
    { type: 'application/msword;charset=utf-8' },
  )
  downloadBlob(blob, filenameBase(survey, 'doc'))
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filenameBase(survey, ext) {
  const name = survey.customer.company || survey.customer.siteName || survey.customer.ticketId || 'site-survey'
  return `${name.replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'site-survey'}-${new Date().toISOString().slice(0, 10)}.${ext}`
}

export function buildHtmlReport(survey, readiness, options = {}) {
  const forPdf = Boolean(options.forPdf || options.forPrint)
  const c = survey.customer
  const techName = survey.techName || ''
  const esc = escapeHtml
  const metricRows = readiness.sections.flatMap(section => [
    `<tr class="section"><td colspan="3">${esc(section.section)}</td></tr>`,
    ...section.rows.map(row => `<tr><td>${esc(row.metric)}</td><td>${esc(row.value)}</td><td><span class="${row.status}">${statusLabel(row.status)}</span> ${esc(row.text)}</td></tr>`),
  ]).join('')

  const topology = survey.topology || { nodes: [], links: [] }
  const nodes = topology.nodes || []
  const links = topology.links || []
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const mainNumberRows = (survey.mainNumbers || []).map(m => `<tr><td>${esc(m.label)}</td><td>${esc(m.number)}</td><td>${esc(m.notes || '')}</td></tr>`).join('')
  const userRows = (survey.users || []).map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(u.extension)}</td><td>${esc(u.phone || '')}</td><td>${esc(u.location || '')}</td><td>${esc(u.role)}</td></tr>`).join('')
  const connectionRows = links.map(l => {
    const from = nodeMap[l.from]
    const to = nodeMap[l.to]
    return `<tr><td>${esc(from?.label || '-')}</td><td>${esc(portLabel(l.fromPort, from?.type))}</td><td>${esc(to?.label || '-')}</td><td>${esc(portLabel(l.toPort, to?.type))}</td><td>${esc(l.media || '')}</td><td>${esc(l.notes || '')}</td></tr>`
  }).join('')
  const topoSvg = topologySvg(survey.topology)
  const deviceRows = nodes.map(n => `
    <tr>
      <td>${esc(n.type)}</td>
      <td>${esc(n.label)}</td>
      <td>${esc(n.type === 'Phone' ? (n.extension || '') : '')}</td>
      <td>${esc(n.type === 'Phone' ? (n.phone || '') : '')}</td>
      <td>${esc(n.ip || '')}</td>
      <td>${esc(n.mac || '')}</td>
      <td>${esc(n.location || '')}</td>
      <td>${esc(n.portCount || defaultPortCount(n.type))}</td>
      <td>${esc(n.notes || '')}</td>
    </tr>
  `).join('')
  const faceplatePages = nodes
    .filter(n => ['Switch', 'Firewall', 'Router', 'AP'].includes(n.type))
    .map(n => `
      <section class="report-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Port map</div>
            <h2>${esc(n.label || n.type)}</h2>
          </div>
          <div class="page-meta">${esc(n.type)} · ${esc(String(n.portCount || defaultPortCount(n.type)))} ports</div>
        </div>
        ${faceplateTable(n, links, nodeMap)}
        <div class="meta-grid" style="margin-top:16px">
          ${info('IP', n.ip)}
          ${info('MAC', n.mac)}
          ${info('Location', n.location)}
          ${info('Notes', n.notes)}
        </div>
      </section>
    `).join('')

  const photoPages = groupedPhotos(survey.photos || []).map(group => `
    <section class="report-page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Site photos</div>
          <h2>${esc(group.category)}</h2>
        </div>
        <div class="page-meta">${group.photos.length} photo${group.photos.length === 1 ? '' : 's'}</div>
      </div>
      <div class="photo-grid">
        ${group.photos.map(p => `
          <figure>
            <img src="${p.dataUrl}" alt="${esc(p.caption || p.name)}">
            <figcaption>${esc(p.caption || p.name)}</figcaption>
          </figure>
        `).join('')}
      </div>
    </section>
  `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Site Survey - ${esc(c.company || c.siteName || 'Customer')}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #0f172a;
      margin: 0;
      background: #e5e7eb;
      line-height: 1.45;
    }
    .print-bar {
      max-width: 816px;
      margin: 16px auto 0;
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #fff;
    }
    .print-bar p { margin: 0; color: #475569; font-size: 13px; }
    .print-bar button {
      border: 0;
      border-radius: 8px;
      background: #0f766e;
      color: #fff;
      font-weight: 700;
      padding: 9px 12px;
      cursor: pointer;
    }
    .report-page {
      width: 816px;
      min-height: 1056px;
      margin: 18px auto;
      padding: 42px 46px;
      background: #fff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      page-break-after: always;
      break-after: page;
    }
    .report-page:last-child { page-break-after: auto; break-after: auto; }
    .eyebrow {
      color: #0f766e;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .page-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f766e;
      margin-bottom: 22px;
    }
    .page-head h1, .page-head h2 { margin: 0; letter-spacing: -0.02em; }
    .page-head h1 { font-size: 28px; }
    .page-head h2 { font-size: 22px; }
    .page-meta { color: #64748b; font-size: 12px; text-align: right; }
    .cover-hero {
      margin-top: 28px;
      padding: 24px;
      border-radius: 16px;
      background: linear-gradient(180deg, #f8fafc 0%, #ecfeff 100%);
      border: 1px solid #cbd5e1;
    }
    .tech-line { color: #0f766e; font-size: 14px; font-weight: 700; margin-bottom: 10px; }
    .tech-line strong { color: #0f172a; }
    .site-line { color: #475569; margin-top: 6px; }
    .verdict {
      display: inline-block;
      margin-top: 14px;
      padding: 7px 12px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
    }
    .ready { background: #dcfce7; color: #166534; }
    .warn { background: #fef3c7; color: #92400e; }
    .fail { background: #fee2e2; color: #991b1b; }
    .cover-detail { margin-top: 12px; color: #334155; max-width: 62ch; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 22px;
      margin-top: 8px;
    }
    .label {
      color: #64748b;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .notes-box {
      margin-top: 18px;
      padding: 14px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .score-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 8px 0 18px;
    }
    .score {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px;
      background: #f8fafc;
    }
    .score span {
      display: block;
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .score strong {
      display: block;
      margin-top: 4px;
      font-family: ui-monospace, Menlo, monospace;
      font-size: 16px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      padding: 9px 8px;
      font-size: 12.5px;
      vertical-align: top;
    }
    th {
      color: #64748b;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.05em;
    }
    tr.section td {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }
    .pass { color: #166534; font-weight: 700; }
    .missing, .warn { color: #92400e; font-weight: 700; }
    .fail { color: #991b1b; font-weight: 700; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    .topo-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
      background: #fff;
      margin-bottom: 16px;
    }
    .topo-wrap svg { display: block; width: 100%; height: auto; }
    .ports {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .port {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px;
      min-height: 48px;
      font-size: 11px;
      background: #f8fafc;
    }
    .port.used { border-color: #0f766e; background: #ecfeff; }
    .port strong { display: block; font-family: ui-monospace, Menlo, monospace; font-size: 11px; margin-bottom: 3px; }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    figure { margin: 0; }
    figure img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }
    figcaption { margin-top: 6px; font-size: 12px; color: #475569; }
    .empty { color: #64748b; font-size: 13px; }
    @media print {
      body { background: #fff; }
      .print-bar { display: none !important; }
      .report-page {
        width: auto;
        min-height: 0;
        margin: 0;
        border: 0;
        box-shadow: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar"${forPdf ? ' style="display:none"' : ''}>
    <p>Use <strong>Export PDF</strong> from Site Survey for a downloadable multi-page PDF.</p>
    <button type="button" onclick="window.print()">Print</button>
  </div>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">ClearLine site survey</div>
        <h1>${esc(c.company || 'Customer Site Survey')}</h1>
      </div>
      <div class="page-meta">
        ${esc(new Date(survey.updatedAt || Date.now()).toLocaleDateString())}<br>
        Ticket ${esc(c.ticketId || '-')}
      </div>
    </div>
    <div class="cover-hero">
      <div class="tech-line">Prepared by: <strong>${esc(techName || 'Field technician')}</strong></div>
      <div class="site-line">${esc(c.siteName || 'Site')} · ${esc(c.address || 'Address not entered')}</div>
      <div class="verdict ${readiness.status}">${esc(readiness.title)}</div>
      <p class="cover-detail">${esc(readiness.detail)}</p>
    </div>
    <div class="meta-grid" style="margin-top:22px">
      ${info('Contact', c.contactName)}
      ${info('Contact phone', c.contactPhone)}
      ${info('Contact email', c.contactEmail)}
      ${info('Phones planned', survey.phoneCount)}
    </div>
    ${c.notes ? `<div class="notes-box"><div class="label">Site / access notes</div>${esc(c.notes)}</div>` : ''}
  </section>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Numbers</div>
        <h2>Company main numbers</h2>
      </div>
      <div class="page-meta">${(survey.mainNumbers || []).length} listed</div>
    </div>
    <table>
      <thead><tr><th>Label</th><th>Number</th><th>Notes</th></tr></thead>
      <tbody>${mainNumberRows || '<tr><td colspan="3" class="empty">No main numbers entered</td></tr>'}</tbody>
    </table>
  </section>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Users</div>
        <h2>Users and phones</h2>
      </div>
      <div class="page-meta">${(survey.users || []).length} users</div>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Username</th><th>Ext</th><th>DID</th><th>Location</th><th>Role</th></tr></thead>
      <tbody>${userRows || '<tr><td colspan="6" class="empty">No users entered</td></tr>'}</tbody>
    </table>
  </section>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Readiness</div>
        <h2>Network readiness</h2>
      </div>
      <div class="page-meta">${esc(readiness.title)}</div>
    </div>
    <div class="score-grid">
      <div class="score"><span>Worst jitter</span><strong>${esc(readiness.summary.jitter != null ? `${readiness.summary.jitter} ms` : '-')}</strong></div>
      <div class="score"><span>Worst loss</span><strong>${esc(readiness.summary.loss != null ? `${readiness.summary.loss}%` : '-')}</strong></div>
      <div class="score"><span>Lowest MOS</span><strong>${esc(readiness.summary.mos ?? '-')}</strong></div>
      <div class="score"><span>Calls</span><strong>${esc(readiness.summary.supported != null ? `${readiness.summary.supported}/${readiness.summary.requested}` : '-')}</strong></div>
    </div>
    <p style="margin:0 0 12px;color:#666;font-size:13px">
      Speedtests ${esc(String(readiness.summary.speedFilled ?? 0))}/3 · MyConnection ${esc(String(readiness.summary.vwFilled ?? 0))}/3
      (verdict uses worst-case across runs)
    </p>
    <table>
      <thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>${metricRows}</tbody>
    </table>
    <h3 style="margin:18px 0 6px;font-size:15px">Next steps</h3>
    <ul>${readiness.recommendations.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
  </section>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Topology</div>
        <h2>Network overview</h2>
      </div>
      <div class="page-meta">${nodes.length} devices · ${links.length} cables</div>
    </div>
    <div class="topo-wrap">${topoSvg}</div>
    <h3 style="margin:0 0 8px;font-size:15px">Connections</h3>
    <table>
      <thead><tr><th>From</th><th>Port</th><th>To</th><th>Port</th><th>Media</th><th>Notes</th></tr></thead>
      <tbody>${connectionRows || '<tr><td colspan="6" class="empty">No connections entered</td></tr>'}</tbody>
    </table>
  </section>

  <section class="report-page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Inventory</div>
        <h2>Device details</h2>
      </div>
      <div class="page-meta">${nodes.length} devices</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th>Label</th><th>Ext</th><th>DID</th><th>IP</th><th>MAC</th><th>Location</th><th>Ports</th><th>Notes</th></tr></thead>
      <tbody>${deviceRows || '<tr><td colspan="9" class="empty">No devices</td></tr>'}</tbody>
    </table>
  </section>

  ${faceplatePages}
  ${photoPages || `
    <section class="report-page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Site photos</div>
          <h2>Photos</h2>
        </div>
      </div>
      <p class="empty">No photos attached.</p>
    </section>
  `}
</body>
</html>`
}

function info(label, value) {
  return `<div><div class="label">${escapeHtml(label)}</div><div>${escapeHtml(value || '-')}</div></div>`
}

function statusLabel(status) {
  return status === 'pass' ? 'Good' : status === 'warn' ? 'Watch' : status === 'fail' ? 'Fail' : '-'
}

function groupedPhotos(photos) {
  const map = new Map()
  for (const photo of photos) {
    const category = photo.category || 'Other'
    if (!map.has(category)) map.set(category, [])
    map.get(category).push(photo)
  }
  return Array.from(map, ([category, groupPhotos]) => ({ category, photos: groupPhotos }))
}

function faceplateTable(node, links, nodeMap) {
  const count = Number(node.portCount || defaultPortCount(node.type))
  const assignments = new Map()
  for (const link of links) {
    if (link.from === node.id) {
      assignments.set(normalizePort(link.fromPort), {
        port: link.fromPort,
        other: nodeMap[link.to],
        otherPort: link.toPort,
      })
    }
    if (link.to === node.id) {
      assignments.set(normalizePort(link.toPort), {
        port: link.toPort,
        other: nodeMap[link.from],
        otherPort: link.fromPort,
      })
    }
  }
  const ports = Array.from({ length: count }, (_, i) => {
    const port = String(i + 1)
    const assigned = assignments.get(port)
    const connected = assigned?.other ? `${assigned.other.label || assigned.other.type} ${assigned.otherPort ? `(${portLabel(assigned.otherPort, assigned.other.type)})` : ''}` : ''
    return `<div class="port ${assigned ? 'used' : ''}"><strong>${escapeHtml(portLabel(port, node.type))}</strong>${escapeHtml(connected)}</div>`
  }).join('')
  return `<h4 style="margin:0 0 8px">${escapeHtml(node.label || node.type)} (${escapeHtml(node.type)})</h4><div class="ports">${ports}</div>`
}

export function defaultPortCount(type) {
  if (type === 'Switch') return 24
  if (type === 'Firewall' || type === 'Router') return 8
  if (type === 'AP' || type === 'PC' || type === 'Server' || type === 'Other') return 1
  if (type === 'Phone') return 2
  return 4
}

export function portPresets(type) {
  if (type === 'Switch') return [8, 16, 24, 48]
  if (type === 'Firewall' || type === 'Router') return [4, 8, 16]
  if (type === 'Phone') return [2]
  if (type === 'AP' || type === 'PC' || type === 'Server') return [1, 2]
  return [1, 2, 4, 8]
}

export function portLabel(port, type) {
  if (type === 'Phone') {
    return String(port) === '2' ? 'PC' : 'LAN'
  }
  const value = String(port ?? '').trim()
  if (!value) return ''
  return /^\d+$/.test(value) ? `P${value}` : value
}

export function normalizePort(port) {
  const value = String(port ?? '').trim()
  const match = value.match(/^p(?:ort)?\s*(\d+)$/i)
  return match ? match[1] : value
}

export const TOPO_BASE_W = 720
export const TOPO_BASE_H = 360
export const TOPO_NODE_HALF_W = 44
export const TOPO_NODE_HALF_H = 18
export const TOPO_PAD = 56

/** Canvas grows so devices never clip off a fixed viewBox. */
export function topologyCanvasSize(nodes = []) {
  let width = TOPO_BASE_W
  let height = TOPO_BASE_H
  for (const n of nodes) {
    width = Math.max(width, (Number(n.x) || 0) + TOPO_NODE_HALF_W + TOPO_PAD)
    height = Math.max(height, (Number(n.y) || 0) + TOPO_NODE_HALF_H + TOPO_PAD)
  }
  return { width: Math.ceil(width), height: Math.ceil(height) }
}

/** Grid placement that continues onto new rows instead of falling off the map. */
export function nextTopologyPosition(nodes = []) {
  const cols = 6
  const colGap = 108
  const rowGap = 72
  const startX = 90
  const startY = 56
  const i = nodes.length
  return {
    x: startX + (i % cols) * colGap,
    y: startY + Math.floor(i / cols) * rowGap,
  }
}

/**
 * For each link, assign slot indexes at both ends so cables fan out
 * around busy devices and port badges can be staggered.
 */
export function assignLinkSlots(nodes = [], links = []) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const slots = {}

  for (const node of nodes) {
    const connected = []
    for (const link of links) {
      if (link.from === node.id) connected.push({ link, end: 'from', otherId: link.to })
      if (link.to === node.id) connected.push({ link, end: 'to', otherId: link.from })
    }
    connected.sort((a, b) => {
      const oa = nodeMap[a.otherId]
      const ob = nodeMap[b.otherId]
      if (!oa || !ob) return 0
      return Math.atan2(oa.y - node.y, oa.x - node.x) - Math.atan2(ob.y - node.y, ob.x - node.x)
    })
    const count = connected.length
    connected.forEach((c, i) => {
      const entry = slots[c.link.id] || (slots[c.link.id] = {
        fromSlot: 0, fromCount: 1, toSlot: 0, toCount: 1,
      })
      if (c.end === 'from') {
        entry.fromSlot = i
        entry.fromCount = count
      } else {
        entry.toSlot = i
        entry.toCount = count
      }
    })
  }
  return slots
}

function attachPoint(node, other, slot, count) {
  const halfW = TOPO_NODE_HALF_W
  const halfH = TOPO_NODE_HALF_H
  const dx = other.x - node.x
  const dy = other.y - node.y
  const spread = count <= 1 ? 0 : ((slot + 0.5) / count - 0.5)

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: node.x + Math.sign(dx || 1) * (halfW + 2),
      y: node.y + spread * (halfH * 2 - 6),
    }
  }
  return {
    x: node.x + spread * (halfW * 2 - 10),
    y: node.y + Math.sign(dy || 1) * (halfH + 2),
  }
}

function portBadgePoint(attach, otherAttach, slot, count) {
  const dx = otherAttach.x - attach.x
  const dy = otherAttach.y - attach.y
  const len = Math.max(1, Math.hypot(dx, dy))
  const ux = dx / len
  const uy = dy / len
  // Push badges further out as slot increases so they don't stack on hubs
  const along = Math.min(len * 0.42, 14 + slot * 11)
  const side = slot % 2 === 0 ? 1 : -1
  const perp = 8 + Math.floor(slot / 2) * 5
  // Extra nudge when many cables share an end
  const dense = count > 3 ? (slot - (count - 1) / 2) * 3 : 0
  return {
    x: attach.x + ux * along - uy * (side * perp + dense),
    y: attach.y + uy * along + ux * (side * perp + dense),
  }
}

export function cableGeometry(from, to, slotInfo = {}) {
  const fromSlot = slotInfo.fromSlot ?? 0
  const fromCount = slotInfo.fromCount ?? 1
  const toSlot = slotInfo.toSlot ?? 0
  const toCount = slotInfo.toCount ?? 1

  const start = attachPoint(from, to, fromSlot, fromCount)
  const end = attachPoint(to, from, toSlot, toCount)
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  const fromLabel = portBadgePoint(start, end, fromSlot, fromCount)
  const toLabel = portBadgePoint(end, start, toSlot, toCount)

  return { path, mid, fromLabel, toLabel, start, end }
}

function formatTopoPort(port) {
  const value = String(port).trim()
  if (!value) return ''
  if (/^\d+$/.test(value)) return `P${value}`
  return value
}

function topologySvg(topology) {
  const nodes = topology.nodes || []
  const links = topology.links || []
  const lineMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const halfW = TOPO_NODE_HALF_W
  const halfH = TOPO_NODE_HALF_H
  const { width, height } = topologyCanvasSize(nodes)
  const slots = assignLinkSlots(nodes, links)

  const cables = links.map(l => {
    const a = lineMap[l.from]
    const b = lineMap[l.to]
    if (!a || !b) return ''

    const cable = cableGeometry(a, b, slots[l.id])

    return `
      <g>
        <path d="${cable.path}" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
        <path d="${cable.path}" fill="none" stroke="#14b8a6" stroke-width="2.5" stroke-linecap="round"/>
      </g>
    `
  }).join('')

  const nodeEls = nodes.map(n => {
    return `
    <g>
      <rect x="${n.x - halfW}" y="${n.y - halfH}" width="${halfW * 2}" height="${halfH * 2}" rx="8" fill="#ecfeff" stroke="#0f766e"/>
      <text x="${n.x}" y="${n.y - 3}" text-anchor="middle" font-size="10" font-weight="700">${escapeHtml(String(n.label || n.type).slice(0, 14))}</text>
      <text x="${n.x}" y="${n.y + 10}" text-anchor="middle" font-size="8" fill="#475569">${escapeHtml(n.type)}</text>
    </g>
  `
  }).join('')

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${cables}${nodeEls}</svg>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
