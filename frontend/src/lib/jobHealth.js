/**
 * Job health / completeness helpers for cockpit next-actions.
 */

import { networkRunProgress, normalizeNetworkSurvey } from './networkReadiness.js'
import { mergeGoLive } from './goLiveModel.js'
import { emptyPort } from './repo.js'

function filled(v) {
  return Boolean(String(v ?? '').trim())
}

function pctOf(done, total) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

/**
 * @returns {{ pct: number, missing: Array<{ id: string, label: string, severity: 'blocker'|'warn'|'info', route: string }> }}
 */
export function surveyCompleteness(survey, jobId = '') {
  const s = normalizeNetworkSurvey(survey || {})
  const base = jobId ? `/job/${jobId}/survey` : '/job/survey'
  const missing = []
  let checks = 0
  let passed = 0

  const mark = (ok, item) => {
    checks += 1
    if (ok) passed += 1
    else missing.push(item)
  }

  mark(filled(s.customer?.company), {
    id: 'survey-company',
    label: 'Customer / company name',
    severity: 'blocker',
    route: `${base}?focus=site`,
  })

  const hasMain = (s.mainNumbers || []).some(n => filled(n.number))
  mark(hasMain, {
    id: 'survey-main',
    label: 'At least one main number',
    severity: 'blocker',
    route: `${base}?focus=numbers`,
  })

  const namedUsers = (s.users || []).filter(u => filled(u.name))
  mark(namedUsers.length >= 1, {
    id: 'survey-users',
    label: 'At least one user',
    severity: 'blocker',
    route: `${base}?focus=users`,
  })

  const net = networkRunProgress(s)
  const hasNet = net.speedFilled > 0 || net.vwFilled > 0
  mark(hasNet, {
    id: 'survey-network',
    label: 'Network test (Speedtest or MyConnection)',
    severity: 'blocker',
    route: `${base}?focus=network`,
  })

  const hasPhoto = (s.photos || []).length > 0
  mark(hasPhoto, {
    id: 'survey-photos',
    label: 'Site photo (MDF / IDF / evidence)',
    severity: 'warn',
    route: `${base}?focus=photos`,
  })

  const locations = Array.isArray(s.e911Locations) ? s.e911Locations : []
  const locationIds = new Set(locations.map(l => l.id).filter(Boolean))

  if (locations.length > 0) {
    const incompleteLoc = locations.filter(l => !filled(l.name) || !filled(l.address))
    mark(incompleteLoc.length === 0, {
      id: 'survey-e911-locs',
      label: 'E911 locations complete (name + address)',
      severity: 'blocker',
      route: `${base}?focus=e911`,
    })
    const missingAssign = namedUsers.filter(u => !u.e911LocationId || !locationIds.has(u.e911LocationId))
    mark(missingAssign.length === 0, {
      id: 'survey-e911-assign',
      label: 'Assign E911 location to every named user',
      severity: 'blocker',
      route: `${base}?focus=e911`,
    })
  } else if (namedUsers.length > 0) {
    const lacking = namedUsers.filter(u => !filled(u.e911LocationId))
    if (lacking.length) {
      checks += 1
      missing.push({
        id: 'survey-e911-warn',
        label: 'Users lack E911 location assignment',
        severity: 'warn',
        route: `${base}?focus=e911`,
      })
    } else {
      checks += 1
      passed += 1
    }
  }

  return { pct: pctOf(passed, checks), missing }
}

export function designCompleteness(design, jobId = '') {
  const d = design || {}
  const base = jobId ? `/job/${jobId}/design` : '/job/design'
  const missing = []
  let checks = 0
  let passed = 0

  const mark = (ok, item) => {
    checks += 1
    if (ok) passed += 1
    else missing.push(item)
  }

  const hoursOk = filled(d.hours?.weekdayOpen) && filled(d.hours?.weekdayClose)
  mark(hoursOk, {
    id: 'design-hours',
    label: 'Hours / timeframes (weekday open & close)',
    severity: 'blocker',
    route: `${base}?focus=hours`,
  })

  const aa = d.autoAttendant || {}
  const aaOk = filled(aa.enabled) || filled(aa.greeting) || filled(aa.option1) || filled(aa.option0)
  mark(aaOk, {
    id: 'design-aa',
    label: 'Auto attendant configured',
    severity: 'blocker',
    route: `${base}?focus=autoAttendant`,
  })

  const night = d.nightButton || {}
  const nightOk = filled(night.enabled) || filled(night.destination) || filled(night.whoUses)
    || filled(d.callFlow?.afterHoursPath)
  mark(nightOk, {
    id: 'design-night',
    label: 'Night / after-hours handling',
    severity: 'warn',
    route: `${base}?focus=nightButton`,
  })

  return { pct: pctOf(passed, checks), missing }
}

export function goLiveCompleteness(golive, { survey, port, jobId = '' } = {}) {
  const g = mergeGoLive(golive)
  const p = emptyPort(port || {})
  const base = jobId ? `/job/${jobId}/golive` : '/job/golive'
  const cockpit = jobId ? `/job/${jobId}` : '/job'
  const missing = []
  let checks = 0
  let passed = 0

  const mark = (ok, item) => {
    checks += 1
    if (ok) passed += 1
    else missing.push(item)
  }

  const focDate = p.focDate || g.cutover?.portDate || ''
  if (filled(focDate)) {
    mark(Boolean(p.focConfirmed), {
      id: 'golive-foc',
      label: 'FOC confirmed for port date',
      severity: 'blocker',
      route: cockpit,
    })
  }

  const items = g.install?.items || []
  const doneCount = items.filter(i => i.done).length
  const installOk = items.length > 0 && doneCount === items.length
  mark(installOk, {
    id: 'golive-install',
    label: `Install checklist (${doneCount}/${items.length || 0})`,
    severity: doneCount === 0 ? 'warn' : 'info',
    route: `${base}?focus=install`,
  })

  mark(Boolean(g.e911Test?.testedAt), {
    id: 'golive-e911-test',
    label: 'E911 test completed',
    severity: 'blocker',
    route: `${base}?focus=install`,
  })

  const handoffOk = filled(g.handoff?.signOffName) || filled(g.handoff?.trainingDone)
  mark(handoffOk, {
    id: 'golive-handoff',
    label: 'Customer handoff / sign-off',
    severity: 'warn',
    route: `${base}?focus=handoff`,
  })

  // survey unused directly but kept for gated location checks by callers
  void survey

  return { pct: pctOf(passed, checks), missing }
}

/**
 * Merge next actions from survey / design / go-live completeness.
 */
export function jobNextActions(survey, design, golive, extras = {}) {
  const jobId = extras.jobId || ''
  const surveyC = surveyCompleteness(survey, jobId)
  const designC = designCompleteness(design, jobId)
  const goLiveC = goLiveCompleteness(golive, {
    survey,
    port: extras.port,
    jobId,
  })

  const severityRank = { blocker: 0, warn: 1, info: 2 }
  const merged = [...surveyC.missing, ...designC.missing, ...goLiveC.missing]
    .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))

  return {
    actions: merged,
    survey: surveyC,
    design: designC,
    golive: goLiveC,
  }
}

/**
 * FOC chip status for cockpit.
 * warn ≤3d unconfirmed, blocker if past without focConfirmed.
 */
export function focChipStatus(port, fallbackFocDate) {
  const p = emptyPort(port || {})
  const focDate = p.focDate || fallbackFocDate || ''
  if (!filled(focDate)) {
    return { status: 'info', label: 'FOC not set', daysUntil: null }
  }
  if (p.focConfirmed) {
    return { status: 'pass', label: 'FOC confirmed', daysUntil: null }
  }
  const dayMs = 24 * 60 * 60 * 1000
  const target = new Date(`${focDate}T12:00:00`)
  if (Number.isNaN(target.getTime())) {
    return { status: 'warn', label: 'FOC date invalid', daysUntil: null }
  }
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const daysUntil = Math.round((target.getTime() - today.getTime()) / dayMs)
  if (daysUntil < 0) {
    return { status: 'fail', label: 'FOC past — unconfirmed', daysUntil }
  }
  if (daysUntil <= 3) {
    return { status: 'warn', label: `FOC in ${daysUntil}d — unconfirmed`, daysUntil }
  }
  return { status: 'info', label: `FOC in ${daysUntil}d`, daysUntil }
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysUntilDate(iso, now = new Date()) {
  if (!iso) return null
  const target = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

function weekdayLabel(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

function jobDate(job) {
  return job?.cutover_date || job?.foc_date || ''
}

/**
 * One status sentence for the home greeting.
 * Priority: blockers > cutover/FOC within 7 days > jobs in flight > quiet.
 *
 * Jobs may include `blockerCount` (number of blocker-severity gaps).
 *
 * @param {Array<object>} jobs
 * @param {{ display_name?: string }|null} _profile
 * @param {{ now?: Date }} [opts]
 * @returns {string}
 */
export function describeDay(jobs, _profile, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const list = Array.isArray(jobs) ? jobs : []
  if (list.length === 0) return 'nothing due — all quiet.'

  const weekJobs = list.filter((j) => {
    const d = daysUntilDate(jobDate(j), now)
    return d != null && d >= 0 && d <= 7
  })

  const blocked = list
    .map(j => ({
      job: j,
      blockers: Math.max(0, Number(j.blockerCount) || 0),
      days: daysUntilDate(jobDate(j), now),
    }))
    .filter(x => x.blockers > 0)
    .sort((a, b) => {
      if (b.blockers !== a.blockers) return b.blockers - a.blockers
      if (a.days == null && b.days == null) return 0
      if (a.days == null) return 1
      if (b.days == null) return -1
      return a.days - b.days
    })

  if (blocked.length > 0) {
    const top = blocked[0]
    const name = top.job.customer || 'A job'
    const date = jobDate(top.job)
    const inWeek = top.days != null && top.days >= 0 && top.days <= 7
    const head = weekJobs.length > 0
      ? `${weekJobs.length} job${weekJobs.length === 1 ? '' : 's'} this week`
      : `${list.length} job${list.length === 1 ? '' : 's'} in flight`
    const mid = inWeek && date
      ? `${name} cuts over ${weekdayLabel(date)}`
      : name
    const n = top.blockers
    return `${head} — ${mid}, and it has ${n} blocker${n === 1 ? '' : 's'}.`
  }

  if (weekJobs.length > 0) {
    const sorted = [...weekJobs].sort((a, b) => {
      const da = daysUntilDate(jobDate(a), now) ?? 99
      const db = daysUntilDate(jobDate(b), now) ?? 99
      return da - db
    })
    const top = sorted[0]
    const name = top.customer || 'A job'
    const day = weekdayLabel(jobDate(top))
    const n = weekJobs.length
    return `${n} job${n === 1 ? '' : 's'} this week — ${name} cuts over ${day}.`
  }

  const n = list.length
  return `${n} job${n === 1 ? '' : 's'} in flight — nothing urgent due this week.`
}

/**
 * Most urgent blocker across job health rows.
 * @param {Array<{ job: object, actions: Array<{ severity: string, label: string, route: string }> }>} rows
 * @param {{ now?: Date }} [opts]
 * @returns {{ job: object, action: object, moreCount: number }|null}
 */
export function pickTopBlocker(rows, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const candidates = []
  for (const row of rows || []) {
    const blockers = (row.actions || []).filter(a => a.severity === 'blocker')
    if (!blockers.length || !row.job) continue
    const days = daysUntilDate(jobDate(row.job), now)
    candidates.push({
      job: row.job,
      action: blockers[0],
      blockerCount: blockers.length,
      days: days == null ? 9999 : days,
    })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    if (a.days !== b.days) return a.days - b.days
    return b.blockerCount - a.blockerCount
  })
  const top = candidates[0]
  return {
    job: top.job,
    action: top.action,
    moreCount: Math.max(0, candidates.length - 1),
  }
}

export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * One urgent line for toolkit-home jobs strip.
 * Prefers a blocker; else nearest cutover/FOC; else most recently updated job.
 *
 * @param {Array<object>} jobs
 * @param {Array<{ job: object, actions: Array<{ severity: string, label: string, route: string }> }>} healthRows
 * @param {{ now?: Date }} [opts]
 * @returns {{ label: string, route: string }|null}
 */
export function pickHomeUrgent(jobs, healthRows, opts = {}) {
  const list = Array.isArray(jobs) ? jobs : []
  if (!list.length) return null

  const blocker = pickTopBlocker(healthRows, opts)
  if (blocker) {
    return {
      label: `${blocker.job.customer || 'Job'} — ${blocker.action.label}`,
      route: blocker.action.route,
    }
  }

  const now = opts.now instanceof Date ? opts.now : new Date()
  let nearest = null
  for (const job of list) {
    const days = daysUntilDate(jobDate(job), now)
    if (days == null) continue
    if (
      !nearest
      || Math.abs(days) < Math.abs(nearest.days)
      || (Math.abs(days) === Math.abs(nearest.days) && days < nearest.days)
    ) {
      nearest = { job, days }
    }
  }
  if (nearest) {
    const when = nearest.days === 0
      ? 'today'
      : nearest.days > 0
        ? `in ${nearest.days}d`
        : `${Math.abs(nearest.days)}d ago`
    const kind = nearest.job.cutover_date ? 'Cutover' : 'FOC'
    return {
      label: `${nearest.job.customer || 'Job'} — ${kind} ${when}`,
      route: `/job/${nearest.job.id}`,
    }
  }

  const recent = [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
  return {
    label: [recent.customer || 'Job', recent.site].filter(Boolean).join(' · '),
    route: `/job/${recent.id}`,
  }
}


