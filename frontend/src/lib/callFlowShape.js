/**
 * Shared call-flow field shape — used by System Design and Account Call Flows.
 * Keep these in sync so CallFlowDiagram works for both.
 */

import { makeId } from './surveyModel.js'

export const EMPTY_HOURS = {
  weekdayOpen: '',
  weekdayClose: '',
  saturdayOpen: '',
  saturdayClose: '',
  sundayOpen: '',
  sundayClose: '',
  timezone: '',
  lunchHours: '',
  notes: '',
}

export const EMPTY_AUTO_ATTENDANT = {
  enabled: '',
  greeting: '',
  menuPrompt: '',
  option0: '',
  option1: '',
  option2: '',
  option3: '',
  option4: '',
  option5: '',
  option6: '',
  option7: '',
  option8: '',
  option9: '',
  timeoutAction: '',
  invalidAction: '',
  notes: '',
}

export const EMPTY_NIGHT_BUTTON = {
  enabled: '',
  whoUses: '',
  whenUsed: '',
  destination: '',
  message: '',
  notes: '',
}

export const EMPTY_VOICEMAIL = {
  needed: '',
  perUser: '',
  generalMailbox: '',
  emailNotification: '',
  retention: '',
  notes: '',
}

export const EMPTY_CALL_FLOW_NOTES = {
  daytimePath: '',
  afterHoursPath: '',
  ringGroups: '',
  queues: '',
  failover: '',
  notes: '',
}

/** Payload shape that CallFlowDiagram understands. */
export function createEmptyCallFlowPayload() {
  return {
    hours: { ...EMPTY_HOURS },
    autoAttendant: { ...EMPTY_AUTO_ATTENDANT },
    nightButton: { ...EMPTY_NIGHT_BUTTON },
    voicemail: { ...EMPTY_VOICEMAIL },
    callFlow: { ...EMPTY_CALL_FLOW_NOTES },
    mainNumbers: [],
  }
}

export function mergeCallFlowPayload(saved = {}) {
  const empty = createEmptyCallFlowPayload()
  return {
    hours: { ...empty.hours, ...saved.hours },
    autoAttendant: { ...empty.autoAttendant, ...saved.autoAttendant },
    nightButton: { ...empty.nightButton, ...saved.nightButton },
    voicemail: { ...empty.voicemail, ...saved.voicemail },
    callFlow: { ...empty.callFlow, ...saved.callFlow },
    mainNumbers: Array.isArray(saved.mainNumbers) ? saved.mainNumbers : [],
  }
}

/** One named route: entry numbers + AA + night path (customers often have several). */
export function createEmptyRoute(patch = {}) {
  const flow = mergeCallFlowPayload(patch)
  return {
    id: patch.id || makeId(),
    name: patch.name || 'Main route',
    ...flow,
  }
}

export function mergeRoute(saved = {}) {
  return createEmptyRoute(saved)
}

/**
 * Normalize account routes. Migrates legacy single `flow` → `routes[]`.
 */
export function normalizeAccountRoutes(account = {}) {
  if (Array.isArray(account.routes) && account.routes.length > 0) {
    return account.routes.map((r, i) => mergeRoute({
      ...r,
      name: r.name || (i === 0 ? 'Main route' : `Route ${i + 1}`),
    }))
  }
  if (account.flow) {
    return [mergeRoute({
      ...account.flow,
      name: account.flow.name || 'Main route',
      mainNumbers: account.flow.mainNumbers?.length
        ? account.flow.mainNumbers
        : (account.mainDid
          ? [{ id: makeId(), number: account.mainDid, label: 'Main' }]
          : []),
    })]
  }
  const seed = createEmptyRoute({ name: 'Main route' })
  if (account.mainDid) {
    seed.mainNumbers = [{ id: makeId(), number: account.mainDid, label: 'Main' }]
  }
  return [seed]
}

function flowHasContent(flow = {}) {
  const aa = flow.autoAttendant || {}
  for (let i = 0; i <= 9; i += 1) {
    if (String(aa[`option${i}`] || '').trim()) return true
  }
  if (String(flow.nightButton?.destination || '').trim()) return true
  if (String(flow.callFlow?.daytimePath || '').trim()) return true
  if (String(flow.callFlow?.afterHoursPath || '').trim()) return true
  if ((flow.mainNumbers || []).some(n => String(n.number || '').trim())) return true
  if (String(flow.hours?.weekdayOpen || '').trim()) return true
  if (String(aa.greeting || '').trim()) return true
  return false
}

export function routeHasContent(route) {
  return flowHasContent(route)
}

function entryLabel(design = {}) {
  const mains = (design.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())
  if (!mains.length) return 'Main DID'
  if (mains.length === 1) return mains[0].number || mains[0].label
  const first = mains[0].number || mains[0].label
  return `${first} +${mains.length - 1} more`
}

/** ASCII / plain-text tree for copy-paste and future Halo KB sync. */
export function callFlowAscii(design = {}) {
  const entry = entryLabel(design)
  const mains = (design.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())
  const opts = []
  for (let i = 0; i <= 9; i += 1) {
    const v = String(design.autoAttendant?.[`option${i}`] || '').trim()
    if (v) opts.push(`  ${i} → ${v}`)
  }
  const night = design.nightButton?.destination || design.callFlow?.afterHoursPath || 'After-hours path'
  const lines = [entry]
  if (mains.length > 1) {
    mains.forEach((m) => {
      lines.push(`  · ${[m.number, m.label].filter(Boolean).join(' — ')}`)
    })
  }
  lines.push(
    '  ├─ Open hours → Auto attendant',
    ...(opts.length ? opts : ['  │   (menu options TBD)']),
    `  └─ Closed / night → ${night}`,
  )
  return lines.join('\n')
}

function summarizeOneRoute(flow, heading) {
  const hours = flow.hours || {}
  const aa = flow.autoAttendant || {}
  const night = flow.nightButton || {}
  const vm = flow.voicemail || {}
  const notes = flow.callFlow || {}
  const mains = (flow.mainNumbers || [])
    .filter(n => String(n.number || '').trim() || String(n.label || '').trim())
    .map(n => [n.number, n.label].filter(Boolean).join(' — '))

  const lines = [
    `## ${heading}`,
    '',
    '### Entry numbers',
    mains.length ? mains.map(m => `- ${m}`).join('\n') : '- (not set)',
    '',
    '### Hours',
    `- Weekday: ${hours.weekdayOpen || '—'} – ${hours.weekdayClose || '—'}`,
    hours.timezone ? `- Timezone: ${hours.timezone}` : null,
    hours.notes ? `- Notes: ${hours.notes}` : null,
    '',
    '### Auto attendant',
    `- Enabled: ${aa.enabled || '—'}`,
    aa.greeting ? `- Greeting: ${aa.greeting}` : null,
    aa.menuPrompt ? `- Menu prompt: ${aa.menuPrompt}` : null,
  ].filter(line => line != null)

  for (let i = 0; i <= 9; i += 1) {
    const v = String(aa[`option${i}`] || '').trim()
    if (v) lines.push(`- Press ${i}: ${v}`)
  }
  if (aa.timeoutAction) lines.push(`- Timeout: ${aa.timeoutAction}`)
  if (aa.invalidAction) lines.push(`- Invalid: ${aa.invalidAction}`)

  lines.push(
    '',
    '### After hours / night',
    `- Night button: ${night.enabled || '—'}`,
    night.whoUses ? `- Phone / extension: ${night.whoUses}` : null,
    night.destination ? `- Destination: ${night.destination}` : null,
    notes.afterHoursPath ? `- After-hours path: ${notes.afterHoursPath}` : null,
    '',
    '### Day path & notes',
    notes.daytimePath ? `- Daytime: ${notes.daytimePath}` : null,
    notes.ringGroups ? `- Ring groups: ${notes.ringGroups}` : null,
    notes.queues ? `- Queues: ${notes.queues}` : null,
    notes.failover ? `- Failover: ${notes.failover}` : null,
    notes.notes ? `- Notes: ${notes.notes}` : null,
    '',
    '### Voicemail',
    `- Needed: ${vm.needed || '—'}`,
    vm.generalMailbox ? `- General mailbox: ${vm.generalMailbox}` : null,
    '',
    '### Tree',
    '```',
    callFlowAscii(flow),
    '```',
    '',
  )
  return lines.filter(line => line != null)
}

/**
 * Markdown-friendly summary for Halo KB / clipboard.
 * Supports multi-route accounts and legacy single-flow payloads.
 */
export function callFlowSummary(accountOrDesign = {}) {
  const name = accountOrDesign.name || accountOrDesign.customer || accountOrDesign.project?.customer || 'Customer'
  const site = accountOrDesign.site || accountOrDesign.project?.site || ''

  const routes = Array.isArray(accountOrDesign.routes) && accountOrDesign.routes.length
    ? normalizeAccountRoutes(accountOrDesign)
    : (accountOrDesign.flow || accountOrDesign.autoAttendant || accountOrDesign.hours
      ? [mergeRoute({ ...mergeCallFlowPayload(accountOrDesign.flow || accountOrDesign), name: 'Main route' })]
      : normalizeAccountRoutes(accountOrDesign))

  const lines = [
    `# ${name}${site ? ` — ${site}` : ''} — Call flows`,
    '',
    `${routes.length} route${routes.length === 1 ? '' : 's'}`,
    '',
  ]

  routes.forEach((route, i) => {
    lines.push(...summarizeOneRoute(route, route.name || `Route ${i + 1}`))
  })

  if (accountOrDesign.exceptions) {
    lines.push('## Account exceptions', accountOrDesign.exceptions, '')
  }
  if (accountOrDesign.haloClientId) {
    lines.push(`Halo client ID: ${accountOrDesign.haloClientId}`)
  }
  if (accountOrDesign.updatedAt) {
    lines.push('', `_Last updated: ${accountOrDesign.updatedAt}_`)
  }

  return lines.filter(line => line != null).join('\n')
}

/** Diagram-friendly design from a route (multi-DID entry label). */
export function routeToDiagramDesign(route) {
  const flow = mergeCallFlowPayload(route)
  const mains = flow.mainNumbers || []
  if (mains.length > 1) {
    const first = { ...mains[0] }
    const label = entryLabel(flow)
    return {
      ...flow,
      mainNumbers: [{ ...first, number: label, label: first.label || 'Entry' }, ...mains.slice(1)],
    }
  }
  return flow
}
