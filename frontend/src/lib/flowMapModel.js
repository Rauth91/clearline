/**
 * Call-flow graph builder + layout engine.
 *
 * Two-step design keeps data logic and geometry logic separate:
 *   buildFlowGraph(design) → { nodes, edges, outline }   ← pure data, easy to unit-test
 *   layoutGraph(graph, layout) → { nodes with x/y/w/h, edges with path, width, height }
 *
 * Adding a new node type: add it to buildFlowGraph, layoutGraph picks it up automatically.
 * Changing the layout algorithm: edit layoutGraph only, data logic untouched.
 */

// ─── Layout presets ───────────────────────────────────────────────────────────
// mainW/mainH  — entry + AA nodes (larger, prominent)
// leafW/leafH  — destination/option nodes (smaller, compact)
// diamond      — side-length of the decision rhombus
// vGap         — vertical gap between rows
// hGap         — horizontal gap between option columns
// padX/padY    — outer canvas padding

export const PREVIEW_LAYOUT = {
  mainW: 200, mainH: 52,
  leafW: 150, leafH: 44,
  diamond: 52,
  vGap: 72, hGap: 14,
  padX: 36, padY: 28,
}

export const EXPANDED_LAYOUT = {
  mainW: 268, mainH: 64,
  leafW: 178, leafH: 52,
  diamond: 64,
  vGap: 88, hGap: 18,
  padX: 44, padY: 36,
}

// ─── Step 1: Build the data graph (no coordinates) ───────────────────────────
// Returns { nodes[], edges[], outline[] }
// node: { id, kind: 'main'|'branch'|'leaf', tone: 'open'|'night'|null, title, detail, sectionKey }
// edge: { from, to, label, tone, style: 'curve'|'bus' }
// outline: [{ id, title, detail }] — ordered for the steps panel

export function buildFlowGraph(design = {}) {
  const mains = (design.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())
  const mainTitle = mains[0]
    ? String(mains[0].number || mains[0].label)
    : 'Main number (not set)'
  const mainDetail = mains.length > 1
    ? mains.map(m => [m.number, m.label].filter(Boolean).join(' — ')).join(' · ')
    : (mains[0]?.label && mains[0]?.number ? mains[0].label : null)

  const aa = design.autoAttendant || {}
  // Only show AA box if explicitly enabled — don't assume on by default
  const aaOn = aa.enabled === 'Yes'
  const aaGreeting = String(aa.greeting || '').trim()
  const dayPath = String(design.callFlow?.daytimePath || '').trim()

  const nightEnabled = (design.nightButton?.enabled || '') === 'Yes'
  const whoUses = String(design.nightButton?.whoUses || '').trim()
  const nightDest = String(design.nightButton?.destination || '').trim()
  const afterHoursPath = String(design.callFlow?.afterHoursPath || '').trim()

  const hoursOpen = String(design.hours?.weekdayOpen || '').trim()
  const hoursClose = String(design.hours?.weekdayClose || '').trim()
  const hoursLabel = hoursOpen && hoursClose ? `${hoursOpen}–${hoursClose}` : ''

  // Collect AA digits (0–9)
  const aaDigits = []
  for (let i = 0; i <= 9; i++) {
    const v = String(aa[`option${i}`] || '').trim()
    if (v) aaDigits.push({ digit: String(i), label: `Press ${i}`, detail: v })
  }
  const aaTimeout = String(aa.timeoutAction || '').trim()

  // Build after-hours display
  let afterTitle = 'After hours'
  let afterDetail = afterHoursPath || nightDest || 'Not configured'
  let afterEdge = 'After hours'
  if (nightEnabled || whoUses || nightDest) {
    afterTitle = 'Night button'
    afterDetail = [
      whoUses ? `On: ${whoUses}` : null,
      nightDest || afterHoursPath || null,
    ].filter(Boolean).join(' · ') || 'Not configured'
    afterEdge = 'Night'
  }

  const nodes = []
  const edges = []

  // ── Core nodes ──
  nodes.push({ id: 'main', kind: 'main', tone: 'open',
    title: mainTitle, detail: mainDetail, sectionKey: 'numbers' })

  nodes.push({ id: 'hours', kind: 'branch', tone: null,
    title: 'Open?', detail: hoursLabel || null, sectionKey: 'hours' })
  edges.push({ from: 'main', to: 'hours', label: null, tone: null, style: 'curve' })

  nodes.push({ id: 'aa', kind: aaOn ? 'main' : 'leaf', tone: 'open',
    title: aaOn ? 'Auto attendant' : (dayPath || 'Daytime path'),
    detail: aaOn ? (aaGreeting || dayPath || null) : null,
    sectionKey: 'aa' })
  edges.push({ from: 'hours', to: 'aa', label: 'Open', tone: 'open', style: 'curve' })

  nodes.push({ id: 'night', kind: 'leaf', tone: 'night',
    title: afterTitle, detail: afterDetail, sectionKey: 'night' })
  edges.push({ from: 'hours', to: 'night', label: afterEdge, tone: 'night', style: 'curve' })

  // ── AA option leaf nodes — spread horizontally ──
  if (aaOn) {
    if (aaDigits.length > 0) {
      aaDigits.forEach(opt => {
        nodes.push({ id: `opt-${opt.digit}`, kind: 'leaf', tone: 'open',
          title: opt.label, detail: opt.detail, sectionKey: 'aa' })
        edges.push({ from: 'aa', to: `opt-${opt.digit}`, label: opt.digit, tone: 'open', style: 'bus' })
      })
      if (aaTimeout) {
        nodes.push({ id: 'aa-timeout', kind: 'leaf', tone: 'open',
          title: 'Timeout', detail: aaTimeout, sectionKey: 'aa' })
        edges.push({ from: 'aa', to: 'aa-timeout', label: '⏱', tone: 'open', style: 'bus' })
      }
    } else {
      // AA enabled but no options filled in yet
      nodes.push({ id: 'aa-empty', kind: 'leaf', tone: 'open',
        title: 'Menu / timeout', detail: aaTimeout || '(options not set)', sectionKey: 'aa' })
      edges.push({ from: 'aa', to: 'aa-empty', label: null, tone: 'open', style: 'bus' })
    }
  }

  // ── Night children — stack vertically at night column ──
  if (nightDest && afterHoursPath && nightDest !== afterHoursPath && (nightEnabled || whoUses)) {
    nodes.push({ id: 'night-dest', kind: 'leaf', tone: 'night',
      title: 'Night destination', detail: nightDest, sectionKey: 'night' })
    edges.push({ from: 'night', to: 'night-dest', label: '→', tone: 'night', style: 'curve' })
  }

  if (design.voicemail?.generalMailbox) {
    nodes.push({ id: 'vm', kind: 'leaf', tone: 'night',
      title: 'Voicemail', detail: design.voicemail.generalMailbox, sectionKey: 'voicemail' })
    edges.push({ from: 'night', to: 'vm', label: 'VM', tone: 'night', style: 'curve' })
  }

  // ── Extra routing notes ──
  const extras = [
    { id: 'note-rings', title: 'Ring groups', val: design.callFlow?.ringGroups },
    { id: 'note-queues', title: 'Queues', val: design.callFlow?.queues },
    { id: 'note-fail', title: 'Failover', val: design.callFlow?.failover },
  ].filter(n => String(n.val || '').trim())

  extras.forEach(n => {
    nodes.push({ id: n.id, kind: 'leaf', tone: 'open',
      title: n.title, detail: String(n.val).trim(), sectionKey: 'daytime' })
    edges.push({ from: 'aa', to: n.id, label: null, tone: 'open', style: 'bus' })
  })

  const outline = nodes.map(n => ({ id: n.id, title: n.title, detail: n.detail || '' }))

  return { nodes, edges, outline }
}

// ─── Step 2: Assign coordinates and compute edge paths ───────────────────────
// All position math lives here. To change the layout, only edit this function.

export function layoutGraph(graph, layout) {
  const { mainW, mainH, leafW, leafH, diamond, vGap, hGap, padX, padY } = layout
  const { nodes, edges, outline } = graph

  // Mutable node map for position assignment
  const nm = {}
  nodes.forEach(n => { nm[n.id] = { ...n } })

  // Identify children by parent
  const aaChildIds  = edges.filter(e => e.from === 'aa').map(e => e.to)
  const nightChildIds = edges.filter(e => e.from === 'night').map(e => e.to)

  // ── Horizontal position math ──
  // Options spread horizontally from padX
  const optCount  = aaChildIds.length
  const optStride = leafW + hGap
  const optBlockW = optCount > 0 ? optCount * optStride - hGap : mainW

  // AA node centered above its option children
  const aaCX = padX + optBlockW / 2
  const aaX  = aaCX - mainW / 2

  // Night column sits to the right of options with a wider gap
  const nightGap = hGap * 5
  const nightX   = padX + optBlockW + nightGap
  const nightCX  = nightX + leafW / 2

  // Spine (DID + Hours diamond) centered between AA and Night
  const spineCX = (aaCX + nightCX) / 2

  // ── Vertical row Y positions ──
  const y0 = padY                        // DID entry
  const y1 = y0 + mainH + vGap          // Hours decision
  const y2 = y1 + diamond + vGap        // AA + Night
  const y3 = y2 + mainH + vGap          // Options row

  // ── Assign positions ──
  if (nm.main)  Object.assign(nm.main,  { x: spineCX - mainW / 2,    y: y0, w: mainW,   h: mainH })
  if (nm.hours) Object.assign(nm.hours, { x: spineCX - diamond / 2,  y: y1, w: diamond, h: diamond })
  if (nm.aa) {
    const h = nm.aa.kind === 'main' ? mainH : leafH
    Object.assign(nm.aa, { x: aaX, y: y2, w: mainW, h })
  }
  if (nm.night) Object.assign(nm.night, { x: nightX, y: y2, w: leafW, h: leafH })

  // Options spread horizontally in y3 row
  aaChildIds.forEach((id, i) => {
    if (!nm[id]) return
    Object.assign(nm[id], { x: padX + i * optStride, y: y3, w: leafW, h: leafH })
  })

  // Night children stack vertically in the night column
  nightChildIds.forEach((id, i) => {
    if (!nm[id]) return
    const yPos = y2 + leafH + hGap * 3 + i * (leafH + hGap * 2)
    Object.assign(nm[id], { x: nightX, y: yPos, w: leafW, h: leafH })
  })

  // ── Compute edge paths ──
  function bottomCenter(id) {
    const n = nm[id]
    return n ? { x: n.x + n.w / 2, y: n.y + n.h } : { x: 0, y: 0 }
  }
  function topCenter(id) {
    const n = nm[id]
    return n ? { x: n.x + n.w / 2, y: n.y } : { x: 0, y: 0 }
  }
  function sCurve(sx, sy, tx, ty) {
    const my = (sy + ty) / 2
    return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`
  }
  function busCurve(sx, sy, tx, ty) {
    // Right-angle routing: down from source → horizontal bus → up to target
    // Creates a clean schematic look with no crossing lines
    const busY = sy + (ty - sy) * 0.38
    return `M ${sx} ${sy} L ${sx} ${busY} L ${tx} ${busY} L ${tx} ${ty}`
  }

  const layoutEdges = edges.map(edge => {
    const src = nm[edge.from]
    const tgt = nm[edge.to]
    if (!src || !tgt) return { ...edge, path: '', labelX: 0, labelY: 0 }

    const sp = bottomCenter(edge.from)
    const tp = topCenter(edge.to)

    const path = edge.style === 'bus'
      ? busCurve(sp.x, sp.y, tp.x, tp.y)
      : sCurve(sp.x, sp.y, tp.x, tp.y)

    return {
      ...edge,
      path,
      labelX: (sp.x + tp.x) / 2,
      labelY: (sp.y + tp.y) / 2 - 4,
    }
  })

  // ── Canvas size ──
  const xs = Object.values(nm).flatMap(n => n.x != null ? [n.x, n.x + (n.w || 0)] : [])
  const ys = Object.values(nm).flatMap(n => n.y != null ? [n.y, n.y + (n.h || 0)] : [])
  const width  = Math.max(820, (xs.length ? Math.max(...xs) : 0) + padX)
  const height = Math.max(300, (ys.length ? Math.max(...ys) : 0) + padY * 2)

  return { nodes: Object.values(nm), edges: layoutEdges, outline, width, height }
}

// ─── Convenience wrapper (keeps backward compatibility) ───────────────────────
export function buildFlowModel(design = {}, layout = PREVIEW_LAYOUT) {
  return layoutGraph(buildFlowGraph(design), layout)
}

export function plainStepsFromDesign(design = {}) {
  return buildFlowGraph(design).outline.map((s, i) => ({
    n: i + 1,
    title: s.title,
    detail: s.detail || '',
  }))
}

// ─── Validation ───────────────────────────────────────────────────────────────
// Returns array of { nodeId, sectionKey, message, severity: 'warn'|'info' }
// Zero deps on layout — works on raw design object.

export function validateFlowGraph(design = {}) {
  const warnings = []
  const aa = design.autoAttendant || {}
  const night = design.nightButton || {}
  const hours = design.hours || {}
  const callFlow = design.callFlow || {}
  const mains = (design.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())

  if (!mains.length) {
    warnings.push({ nodeId: 'main', sectionKey: 'numbers', message: 'No phone number set', severity: 'warn' })
  }

  const aaOn = aa.enabled === 'Yes'
  if (aaOn) {
    const hasOpts = [0,1,2,3,4,5,6,7,8,9].some(i => String(aa[`option${i}`] || '').trim())
    if (!hasOpts) {
      warnings.push({ nodeId: 'aa', sectionKey: 'aa', message: 'AA enabled but no menu options set', severity: 'warn' })
    }
    if (!String(aa.greeting || '').trim()) {
      warnings.push({ nodeId: 'aa', sectionKey: 'aa', message: 'No greeting message', severity: 'info' })
    }
  }

  const hasNightDest = String(night.destination || '').trim() || String(callFlow.afterHoursPath || '').trim()
  if (!hasNightDest) {
    warnings.push({ nodeId: 'night', sectionKey: 'night', message: 'After-hours destination not set', severity: 'warn' })
  }

  const hasHours = String(hours.weekdayOpen || '').trim() && String(hours.weekdayClose || '').trim()
  if (hasHours && !hasNightDest) {
    warnings.push({ nodeId: 'hours', sectionKey: 'hours', message: 'Hours set but after-hours path is empty', severity: 'warn' })
  }

  return warnings
}
