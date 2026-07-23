/**
 * Call-flow map geometry + plain-language labels (shared by diagram + customer export).
 */

export const PREVIEW_LAYOUT = { nodeW: 200, nodeH: 52, diamond: 54, layerGapY: 92, optionGap: 64 }
export const EXPANDED_LAYOUT = { nodeW: 280, nodeH: 64, diamond: 66, layerGapY: 110, optionGap: 76 }

export function buildFlowModel(design = {}, layout = PREVIEW_LAYOUT) {
  const { nodeW, nodeH, diamond, layerGapY, optionGap } = layout
  const mains = (design.mainNumbers || []).filter(n => String(n.number || n.label || '').trim())
  const mainTitle = mains[0]
    ? String(mains[0].number || mains[0].label)
    : (String(design.numbering?.mainNumbers || '').split('\n')[0].trim() || 'Main number (not set)')
  const mainDetail = mains.length > 1
    ? mains.map(m => [m.number, m.label].filter(Boolean).join(' — ')).join(' · ')
    : (mains[0]?.label && mains[0]?.number ? mains[0].label : '')

  const aaOn = (design.autoAttendant?.enabled || 'Yes') !== 'No'
  const nightEnabled = (design.nightButton?.enabled || '') === 'Yes'
  const whoUses = String(design.nightButton?.whoUses || '').trim()
  const nightDest = String(design.nightButton?.destination || '').trim()
  const afterHoursPath = String(design.callFlow?.afterHoursPath || '').trim()
  const hoursLabel = [
    design.hours?.weekdayOpen,
    design.hours?.weekdayClose,
  ].filter(Boolean).join('–') || 'Hours not set'

  const options = []
  for (let i = 0; i <= 9; i += 1) {
    const value = String(design.autoAttendant?.[`option${i}`] || '').trim()
    if (value) options.push({ digit: String(i), label: `Press ${i}`, detail: value })
  }

  const dayPath = String(design.callFlow?.daytimePath || '').trim()
  const aaGreeting = String(design.autoAttendant?.greeting || '').trim()

  let afterTitle = 'After hours'
  let afterDetail = afterHoursPath || nightDest || 'Not set'
  let afterEdge = 'After hours'
  if (nightEnabled || whoUses || nightDest) {
    afterTitle = 'Night button'
    afterDetail = [
      whoUses ? `Phone: ${whoUses}` : 'Phone not set — add which phone has the night button',
      nightDest || afterHoursPath || null,
    ].filter(Boolean).join(' · ')
    afterEdge = 'Night button'
  } else if (afterHoursPath) {
    afterTitle = 'After-hours path'
    afterDetail = afterHoursPath
    afterEdge = 'After hours'
  }

  const nodes = []
  const edges = []
  // Keep left branch fully on-canvas (old math put AA at negative x → clipped)
  const padX = 48
  const colGap = 64
  const leftX = padX
  const spineX = leftX + nodeW + colGap + diamond / 2
  const rightX = spineX + diamond / 2 + colGap
  const startY = 36

  function pushNode(node) {
    nodes.push({ ...node, edgeIn: node.edgeIn || '' })
  }

  function linkNodes(fromId, toId, label, tone) {
    edges.push(link(fromId, toId, nodes, label, layout, tone))
  }

  pushNode({
    id: 'main',
    kind: 'main',
    title: mainTitle,
    detail: mainDetail,
    x: spineX - nodeW / 2,
    y: startY,
    tone: 'open',
  })

  pushNode({
    id: 'hours',
    kind: 'branch',
    title: 'Open hours?',
    detail: hoursLabel,
    x: spineX - diamond / 2,
    y: startY + layerGapY,
    edgeIn: hoursLabel,
  })
  linkNodes('main', 'hours', hoursLabel)

  const dayId = aaOn ? 'aa' : 'day'
  pushNode({
    id: dayId,
    kind: aaOn ? 'main' : 'leaf',
    title: aaOn ? 'Auto attendant' : (dayPath || 'Day path'),
    detail: aaOn ? (aaGreeting || dayPath || 'Day menu') : dayPath,
    x: leftX,
    y: startY + layerGapY * 2,
    edgeIn: 'Open',
    tone: 'open',
  })
  linkNodes('hours', dayId, 'Open', 'open')

  pushNode({
    id: 'night',
    kind: 'leaf',
    title: afterTitle,
    detail: afterDetail,
    x: rightX,
    y: startY + layerGapY * 2,
    edgeIn: afterEdge,
    tone: 'night',
  })
  linkNodes('hours', 'night', afterEdge, 'night')

  let optionLayerY = startY + layerGapY * 3
  const optionX = leftX

  if (aaOn && options.length) {
    options.forEach((opt, idx) => {
      const id = `opt-${opt.digit}`
      pushNode({
        id,
        kind: 'leaf',
        title: opt.label,
        detail: opt.detail,
        x: optionX,
        y: optionLayerY + idx * optionGap,
        edgeIn: `Press ${opt.digit}`,
        tone: 'open',
      })
      linkNodes(dayId, id, opt.digit, 'open')
    })
    optionLayerY += options.length * optionGap
  } else if (aaOn) {
    const timeout = String(design.autoAttendant?.timeoutAction || '').trim() || 'Menu options not set'
    pushNode({
      id: 'aa-empty',
      kind: 'leaf',
      title: 'Menu / timeout',
      detail: timeout,
      x: optionX,
      y: optionLayerY,
      edgeIn: 'Menu',
      tone: 'open',
    })
    linkNodes(dayId, 'aa-empty', 'Menu', 'open')
    optionLayerY += optionGap
  }

  if (nightDest && (nightEnabled || whoUses) && afterHoursPath && nightDest !== afterHoursPath) {
    pushNode({
      id: 'night-dest',
      kind: 'leaf',
      title: 'Night destination',
      detail: nightDest,
      x: rightX,
      y: Math.max(optionLayerY, startY + layerGapY * 3),
      edgeIn: 'Night button',
      tone: 'night',
    })
    linkNodes('night', 'night-dest', 'Routes to', 'night')
    optionLayerY = Math.max(optionLayerY, startY + layerGapY * 3 + optionGap)
  }

  if (design.voicemail?.needed !== 'No' && design.voicemail?.generalMailbox) {
    const vmY = Math.max(optionLayerY, startY + layerGapY * 3)
    pushNode({
      id: 'vm',
      kind: 'leaf',
      title: 'Voicemail',
      detail: design.voicemail.generalMailbox,
      x: rightX,
      y: vmY + (nightDest && afterHoursPath ? optionGap : 0),
      edgeIn: 'Voicemail',
      tone: 'night',
    })
    linkNodes('night', 'vm', 'VM', 'night')
    optionLayerY = Math.max(optionLayerY, vmY + optionGap * 2)
  }

  const extraNotes = [
    { id: 'note-queues', title: 'Queues', detail: design.callFlow?.queues },
    { id: 'note-rings', title: 'Ring groups', detail: design.callFlow?.ringGroups },
    { id: 'note-fail', title: 'Failover', detail: design.callFlow?.failover },
  ].filter(n => String(n.detail || '').trim())

  extraNotes.forEach((note) => {
    pushNode({
      id: note.id,
      kind: 'leaf',
      title: note.title,
      detail: String(note.detail).trim(),
      x: optionX,
      y: optionLayerY,
      edgeIn: 'Routing note',
      tone: 'open',
    })
    linkNodes(dayId, note.id, 'note', 'open')
    optionLayerY += optionGap
  })

  const outline = nodes.map(n => ({
    id: n.id,
    title: n.title,
    detail: n.detail || '',
  }))

  const maxX = Math.max(...nodes.map(n => n.x + (n.kind === 'branch' ? diamond : nodeW)), rightX + nodeW) + padX
  const maxY = Math.max(...nodes.map(n => n.y + (n.kind === 'branch' ? diamond : nodeH)), 280) + 56

  return {
    nodes,
    edges,
    outline,
    width: Math.max(820, maxX),
    height: maxY,
  }
}

export function plainStepsFromDesign(design = {}) {
  const model = buildFlowModel(design, PREVIEW_LAYOUT)
  return model.outline.map((s, i) => ({
    n: i + 1,
    title: s.title,
    detail: s.detail || '',
  }))
}

function nodeCenter(node, layout) {
  if (node.kind === 'branch') {
    return { x: node.x + layout.diamond / 2, y: node.y + layout.diamond / 2 }
  }
  return { x: node.x + layout.nodeW / 2, y: node.y + layout.nodeH / 2 }
}

function link(fromId, toId, nodes, label, layout, tone) {
  const from = nodes.find(n => n.id === fromId)
  const to = nodes.find(n => n.id === toId)
  if (!from || !to) {
    return { path: '', label, labelX: 0, labelY: 0, tone }
  }
  const a = nodeCenter(from, layout)
  const b = nodeCenter(to, layout)
  const midY = (a.y + b.y) / 2
  const fromBottom = from.kind === 'branch' ? layout.diamond / 2 - 4 : layout.nodeH / 2 - 4
  const toTop = to.kind === 'branch' ? layout.diamond / 2 : layout.nodeH / 2
  const path = `M ${a.x} ${a.y + fromBottom} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - toTop}`
  return {
    path,
    label,
    labelX: (a.x + b.x) / 2,
    labelY: midY - 4,
    tone,
  }
}
