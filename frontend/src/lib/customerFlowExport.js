/**
 * Customer-facing call-flow review HTML — easy to read + change-request table.
 */

import { plainStepsFromDesign } from './flowMapModel.js'
import { mergeCallFlowPayload, normalizeAccountRoutes } from './callFlowShape.js'

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function routeNumbers(route) {
  return (route.mainNumbers || [])
    .filter(n => String(n.number || n.label || '').trim())
    .map(n => ({
      number: String(n.number || '').trim() || '—',
      label: String(n.label || '').trim(),
      summary: summarizeRouteForNumber(route),
    }))
}

function summarizeRouteForNumber(route) {
  const flow = mergeCallFlowPayload(route)
  const parts = []
  const hours = [flow.hours?.weekdayOpen, flow.hours?.weekdayClose].filter(Boolean).join('–')
  if (hours) parts.push(`Open ${hours}`)
  const aaOn = (flow.autoAttendant?.enabled || 'Yes') !== 'No'
  if (aaOn) {
    const opts = []
    for (let i = 0; i <= 9; i += 1) {
      const v = String(flow.autoAttendant?.[`option${i}`] || '').trim()
      if (v) opts.push(`${i}→${v}`)
    }
    parts.push(opts.length ? `AA: ${opts.join(', ')}` : 'Auto attendant')
  } else if (flow.callFlow?.daytimePath) {
    parts.push(flow.callFlow.daytimePath)
  }
  if ((flow.nightButton?.enabled || '') === 'Yes' || flow.nightButton?.whoUses || flow.nightButton?.destination) {
    const phone = flow.nightButton?.whoUses ? ` on ${flow.nightButton.whoUses}` : ''
    const dest = flow.nightButton?.destination || flow.callFlow?.afterHoursPath || ''
    parts.push(`Night button${phone}${dest ? ` → ${dest}` : ''}`)
  } else if (flow.callFlow?.afterHoursPath) {
    parts.push(`After hours → ${flow.callFlow.afterHoursPath}`)
  }
  return parts.join(' · ') || 'Routing not documented yet'
}

function routeSectionHtml(route, index) {
  const name = route.name || `Route ${index + 1}`
  const steps = plainStepsFromDesign(route)
  const stepsHtml = steps.map(s => `
    <li>
      <strong>${esc(s.title)}</strong>
      ${s.detail ? `<span>${esc(s.detail)}</span>` : ''}
    </li>
  `).join('')

  const numbers = routeNumbers(route)
  const numberRows = numbers.length
    ? numbers.map(n => `
      <tr>
        <td>${esc(n.number)}${n.label ? `<div class="muted">${esc(n.label)}</div>` : ''}</td>
        <td>${esc(n.summary)}</td>
        <td class="blank">&nbsp;</td>
      </tr>
    `).join('')
    : `
      <tr>
        <td class="muted">No numbers listed</td>
        <td>${esc(summarizeRouteForNumber(route))}</td>
        <td class="blank">&nbsp;</td>
      </tr>
    `

  return `
    <section class="route">
      <h2>${esc(name)}</h2>
      <h3>How calls flow today</h3>
      <ol class="steps">${stepsHtml || '<li class="muted">No steps documented yet.</li>'}</ol>
      <h3>Numbers on this route</h3>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Current routing</th>
            <th>I want it to route this way</th>
          </tr>
        </thead>
        <tbody>${numberRows}</tbody>
      </table>
    </section>
  `
}

export function buildCustomerFlowHtml(account) {
  const routes = normalizeAccountRoutes(account)
  const name = account.name || 'Customer'
  const site = account.site || ''
  const date = new Date().toLocaleDateString()
  const routeBlocks = routes.map((r, i) => routeSectionHtml(r, i)).join('\n')

  // Extra blank rows for numbers not already listed
  const extraRows = Array.from({ length: 4 }, () => `
    <tr>
      <td class="blank">&nbsp;</td>
      <td class="blank">&nbsp;</td>
      <td class="blank">&nbsp;</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Call routing review — ${esc(name)}</title>
<style>
  @page { size: letter; margin: 0.65in; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 32px 40px 48px;
    line-height: 1.45;
    font-size: 15px;
  }
  .kicker {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #666;
    font-weight: 700;
  }
  h1 {
    font-size: 28px;
    margin: 6px 0 8px;
    letter-spacing: -0.02em;
  }
  .meta { color: #555; font-size: 14px; margin-bottom: 28px; }
  h2 {
    font-size: 20px;
    margin: 32px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ddd;
  }
  h3 {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #555;
    margin: 20px 0 8px;
  }
  .intro {
    background: #f6f6f4;
    border: 1px solid #e5e5e0;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 8px;
  }
  ol.steps { margin: 0 0 8px; padding-left: 1.35em; }
  ol.steps li { margin: 0 0 8px; }
  ol.steps li span {
    display: block;
    color: #444;
    font-size: 14px;
    margin-top: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #d8d8d4;
    padding: 10px 12px;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: #f0f0ec;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #444;
  }
  td.blank { min-height: 40px; height: 42px; background: #fcfcfa; }
  .muted { color: #777; font-size: 12px; }
  .notes {
    margin-top: 12px;
    border: 1px solid #d8d8d4;
    border-radius: 8px;
    min-height: 96px;
    padding: 12px;
    background: #fcfcfa;
  }
  .footer {
    margin-top: 36px;
    padding-top: 14px;
    border-top: 1px solid #ddd;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #666;
  }
  @media print {
    body { padding: 0; }
    .route { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="kicker">Call routing review</div>
  <h1>${esc(name)}${site ? ` — ${esc(site)}` : ''}</h1>
  <div class="meta">Prepared ${esc(date)}. Please review how your numbers route today and note any changes below.</div>

  <div class="intro">
    <strong>How to use this page:</strong>
    Read each route, then in the right column write how you want that number to route
    (for example: “Press 1 should go to the front desk phone” or “Main number should ring Sales only”).
    Print to PDF or return this file to your project contact.
  </div>

  ${routeBlocks}

  <section class="route">
    <h2>More numbers / other changes</h2>
    <p class="muted">Use these blank rows for numbers not listed above, or extra requests.</p>
    <table>
      <thead>
        <tr>
          <th>Number</th>
          <th>Current routing (if known)</th>
          <th>I want it to route this way</th>
        </tr>
      </thead>
      <tbody>${extraRows}</tbody>
    </table>
    <h3>Other notes</h3>
    <div class="notes"></div>
  </section>

  <div class="footer">
    Generated by ClearLine for customer review.
    ${account.haloClientId ? `Halo client ID: ${esc(account.haloClientId)}. ` : ''}
    Return marked-up PDF or notes to your voice project contact so we can update the live call-flow chart.
  </div>
</body>
</html>`
}

export function exportCustomerFlowReview(account) {
  const html = buildCustomerFlowHtml(account)
  const base = (account.name || account.site || 'customer')
    .replace(/\W+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'customer'
  downloadHtml(html, `${base}-call-routing-review-${new Date().toISOString().slice(0, 10)}.html`)
}
