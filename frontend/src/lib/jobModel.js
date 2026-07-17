/**
 * Job library — one customer job links Survey + Design + Go-Live.
 * Migrates legacy single drafts on first load.
 */

import { createEmptySurvey, makeId } from './surveyModel.js'
import { normalizeNetworkSurvey } from './networkReadiness.js'
import {
  clearAllJobPhotos,
  deleteJobPhotos,
  getJobPhotos,
  photosHaveDataUrls,
  putJobPhotos,
  stripPhotoDataUrls,
} from './photoStore.js'

const INDEX_KEY = 'voip-ops-jobs-index'
const ACTIVE_KEY = 'voip-ops-active-job'
const LEGACY_SURVEY = 'voip-ops-survey-draft'
const LEGACY_DESIGN = 'voip-ops-system-design'
const STORAGE_VERSION_KEY = 'voip-ops-storage-version'
const STORAGE_UPGRADE_PENDING_KEY = 'voip-ops-storage-upgrade-pending'
/** Bump when a wipe/migration is intentionally required. Never auto-wipe without a prompt. */
const STORAGE_VERSION = '3'

const SAVE_EVENT = 'clearline-save-status'
/** Soft warn when localStorage payload approaches typical 5MB browser quotas. */
const STORAGE_WARN_BYTES = 3.5 * 1024 * 1024

export function jobKey(jobId, kind) {
  return `voip-ops-job-${jobId}-${kind}`
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    emitSaveStatus({
      type: 'error',
      message: 'Could not save — browser storage is full. Export a job file, remove photos, or delete old jobs.',
      error: err,
    })
    return false
  }
}

export function emitSaveStatus(detail) {
  try {
    window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail }))
  } catch {
    // ignore (SSR / tests)
  }
}

export function subscribeSaveStatus(handler) {
  const fn = (e) => handler(e.detail)
  window.addEventListener(SAVE_EVENT, fn)
  return () => window.removeEventListener(SAVE_EVENT, fn)
}

export function getLocalStorageBytes() {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      const val = localStorage.getItem(key) || ''
      total += key.length + val.length
    }
  } catch {
    return 0
  }
  // UTF-16 ≈ 2 bytes per char in most browsers' quota accounting
  return total * 2
}

export function checkStoragePressure() {
  const used = getLocalStorageBytes()
  if (used < STORAGE_WARN_BYTES) return null
  return {
    type: 'warn',
    message: `Browser storage is getting full (~${Math.round(used / (1024 * 1024))} MB). Export job files and delete finished jobs, or remove site photos.`,
    usedBytes: used,
  }
}

function warnIfStoragePressure() {
  const pressure = checkStoragePressure()
  if (pressure) emitSaveStatus(pressure)
}

function hasAnyJobData() {
  const jobs = readJson(INDEX_KEY, [])
  if (Array.isArray(jobs) && jobs.length > 0) return true
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('voip-ops-job-') || key === LEGACY_SURVEY || key === LEGACY_DESIGN)) {
        return true
      }
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Fingerprint of Survey fields that Design / Provision depend on.
 */
export function surveySyncFingerprint(survey) {
  if (!survey) return ''
  const payload = {
    company: survey.customer?.company || '',
    site: survey.customer?.siteName || '',
    tech: survey.techName || '',
    phoneCount: survey.phoneCount || '',
    numbers: (survey.mainNumbers || []).map(n => ({
      label: n.label || '',
      number: n.number || '',
      notes: n.notes || '',
    })),
    users: (survey.users || []).map(u => ({
      name: u.name || '',
      username: u.username || '',
      extension: u.extension || '',
      phone: u.phone || '',
      location: u.location || '',
      role: u.role || '',
    })),
  }
  return JSON.stringify(payload)
}

export function isDesignOutOfDate(jobId) {
  const design = loadJobDesign(jobId)
  if (!design) return false
  const fp = design.surveyImport?.fingerprint
  if (!fp) return false
  const survey = readJson(jobKey(jobId, 'survey'), null) || createEmptySurvey()
  return surveySyncFingerprint(survey) !== fp
}

export function applySurveyToDesign(design, survey) {
  const customer = survey?.customer || {}
  const mainNumbers = (survey?.mainNumbers || [])
    .filter(n => n.number || n.label)
    .map(n => ({
      id: n.id || makeId(),
      label: n.label || 'Main line',
      number: n.number || '',
      notes: n.notes || '',
    }))
  const users = (survey?.users || [])
    .filter(u => u.name || u.extension || u.phone)
    .map(u => ({
      id: u.id || makeId(),
      name: u.name || '',
      username: u.username || '',
      extension: u.extension || '',
      did: u.phone || '',
      location: u.location || '',
      role: u.role || 'User',
      voicemail: 'Yes',
    }))

  const prev = design || {}
  return {
    ...prev,
    project: {
      ...(prev.project || {}),
      customer: customer.company || prev.project?.customer || '',
      site: customer.siteName || prev.project?.site || '',
      designer: survey?.techName || prev.project?.designer || '',
      summary: prev.project?.summary || customer.notes || '',
    },
    numbering: {
      ...(prev.numbering || {}),
      mainNumbers: mainNumbers.map(n => `${n.label}: ${n.number}`).filter(Boolean).join('\n')
        || prev.numbering?.mainNumbers
        || '',
      didPlan: users.filter(u => u.did).map(u => `${u.name || u.extension}: ${u.did}`).join('\n')
        || prev.numbering?.didPlan
        || '',
    },
    devices: {
      ...(prev.devices || {}),
      phones: survey?.phoneCount ? `${survey.phoneCount} phones planned` : (prev.devices?.phones || ''),
    },
    mainNumbers: mainNumbers.length ? mainNumbers : (prev.mainNumbers || []),
    users: users.length ? users : (prev.users || []),
    surveyImport: {
      fingerprint: surveySyncFingerprint(survey),
      importedAt: new Date().toISOString(),
    },
  }
}

export function listJobs() {
  ensureStorageVersion()
  migrateLegacyDrafts()
  const jobs = readJson(INDEX_KEY, [])
  return Array.isArray(jobs)
    ? jobs.filter(j => !j.archived).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    : []
}

export function listAllJobs() {
  ensureStorageVersion()
  migrateLegacyDrafts()
  const jobs = readJson(INDEX_KEY, [])
  return Array.isArray(jobs) ? jobs : []
}

export function getActiveJobId() {
  ensureStorageVersion()
  migrateLegacyDrafts()
  const id = localStorage.getItem(ACTIVE_KEY)
  if (id && listAllJobs().some(j => j.id === id && !j.archived)) return id
  return null
}

export function setActiveJobId(jobId) {
  if (jobId) localStorage.setItem(ACTIVE_KEY, jobId)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function getJob(jobId) {
  return listAllJobs().find(j => j.id === jobId) || null
}

function upsertIndex(meta) {
  const jobs = listAllJobs()
  const idx = jobs.findIndex(j => j.id === meta.id)
  const next = { ...meta, updatedAt: new Date().toISOString() }
  if (idx >= 0) jobs[idx] = { ...jobs[idx], ...next }
  else jobs.unshift(next)
  writeJson(INDEX_KEY, jobs)
  return next
}

export function createJob(patch = {}) {
  const id = makeId()
  const survey = createEmptySurvey()
  if (patch.customer) survey.customer.company = patch.customer
  if (patch.site) survey.customer.siteName = patch.site
  if (patch.ticket) survey.customer.ticketId = patch.ticket

  const meta = upsertIndex({
    id,
    customer: patch.customer || '',
    site: patch.site || '',
    ticket: patch.ticket || '',
    createdAt: new Date().toISOString(),
    archived: false,
  })

  writeJson(jobKey(id, 'survey'), survey)
  writeJson(jobKey(id, 'design'), null)
  writeJson(jobKey(id, 'golive'), null)
  setActiveJobId(id)
  warnIfStoragePressure()
  return meta
}

export function openJob(jobId) {
  const job = getJob(jobId)
  if (!job || job.archived) return null
  setActiveJobId(jobId)
  return job
}

export async function duplicateJob(jobId) {
  const source = getJob(jobId)
  if (!source) return null
  const survey = await loadJobSurveyAsync(jobId)
  const design = loadJobDesign(jobId)
  const golive = loadJobGoLive(jobId)
  const id = makeId()
  const meta = upsertIndex({
    id,
    customer: `${source.customer || 'Job'} (copy)`,
    site: source.site || '',
    ticket: source.ticket || '',
    createdAt: new Date().toISOString(),
    archived: false,
  })
  if (survey) {
    await saveJobSurvey(id, {
      ...survey,
      id: makeId(),
      customer: { ...survey.customer, company: meta.customer },
      updatedAt: new Date().toISOString(),
    })
  }
  if (design) writeJson(jobKey(id, 'design'), { ...design })
  if (golive) writeJson(jobKey(id, 'golive'), { ...golive })
  setActiveJobId(id)
  return meta
}

export function archiveJob(jobId) {
  const jobs = listAllJobs().map(j => (j.id === jobId ? { ...j, archived: true, updatedAt: new Date().toISOString() } : j))
  writeJson(INDEX_KEY, jobs)
  if (getActiveJobId() === jobId) setActiveJobId(null)
}

/** Permanently remove a job and all Survey / Design / Go-Live data from this browser. */
export function deleteJob(jobId) {
  if (!jobId) return
  localStorage.removeItem(jobKey(jobId, 'survey'))
  localStorage.removeItem(jobKey(jobId, 'design'))
  localStorage.removeItem(jobKey(jobId, 'golive'))
  deleteJobPhotos(jobId).catch(() => {})
  const jobs = listAllJobs().filter(j => j.id !== jobId)
  writeJson(INDEX_KEY, jobs)
  if (getActiveJobId() === jobId) setActiveJobId(null)
}

/**
 * Wipe all ClearLine job data from this device (jobs, drafts, legacy keys).
 * Theme preference is kept.
 */
export function clearAllJobData() {
  const jobs = readJson(INDEX_KEY, [])
  if (Array.isArray(jobs)) {
    jobs.forEach(j => {
      localStorage.removeItem(jobKey(j.id, 'survey'))
      localStorage.removeItem(jobKey(j.id, 'design'))
      localStorage.removeItem(jobKey(j.id, 'golive'))
    })
  }
  const toRemove = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (
      key === INDEX_KEY
      || key === ACTIVE_KEY
      || key === LEGACY_SURVEY
      || key === LEGACY_DESIGN
      || key === 'voip-ops-jobs-migrated'
      || key.startsWith('voip-ops-job-')
      || key.startsWith('voip-ops-section-')
      || key === 'voip-ops-survey-draft'
      || key === 'voip-ops-system-design'
    ) {
      toRemove.push(key)
    }
  }
  toRemove.forEach(key => localStorage.removeItem(key))
  localStorage.removeItem(ACTIVE_KEY)
  clearAllJobPhotos().catch(() => {})
}

/**
 * Storage schema check — never silently wipe when jobs exist.
 * Returns status for the App upgrade prompt.
 */
export function getStorageVersionStatus() {
  try {
    const current = localStorage.getItem(STORAGE_VERSION_KEY)
    if (current === STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
      return { ok: true, version: STORAGE_VERSION }
    }
    if (!hasAnyJobData()) {
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
      localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
      return { ok: true, version: STORAGE_VERSION }
    }
    localStorage.setItem(STORAGE_UPGRADE_PENDING_KEY, '1')
    return {
      ok: false,
      needsUpgrade: true,
      from: current || 'unknown',
      to: STORAGE_VERSION,
    }
  } catch {
    return { ok: true, version: STORAGE_VERSION }
  }
}

/** Called on load — marks pending upgrade; does not wipe. */
export function ensureStorageVersion() {
  getStorageVersionStatus()
}

export function exportAllJobs() {
  const jobs = listJobs()
  jobs.forEach(j => {
    try {
      exportJobFile(j.id)
    } catch (err) {
      console.error(err)
    }
  })
  return jobs.length
}

/** After user exports (or accepts data loss), clear and stamp the new version. */
export function completeStorageVersionUpgrade() {
  clearAllJobData()
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
    localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
  } catch {
    // ignore
  }
}

/** Keep existing data and just stamp the new version (no wipe). */
export function acknowledgeStorageVersionKeepData() {
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
    localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
  } catch {
    // ignore
  }
}

/**
 * Download one ClearLine job file (.clearline) with Survey + Design + Go-Live.
 */
export function exportJobFile(jobId) {
  const meta = getJob(jobId)
  if (!meta) throw new Error('Job not found')
  // Sync path uses lean survey; hydrate photos for a complete file.
  // Callers that need guaranteed photos should use exportJobFileAsync.
  const survey = loadJobSurvey(jobId)
  const payload = {
    format: 'clearline-job',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: {
      customer: meta.customer || '',
      site: meta.site || '',
      ticket: meta.ticket || '',
    },
    survey,
    design: loadJobDesign(jobId),
    golive: loadJobGoLive(jobId),
  }
  downloadClearlinePayload(payload, meta)
}

export async function exportJobFileAsync(jobId) {
  const meta = getJob(jobId)
  if (!meta) throw new Error('Job not found')
  const survey = await loadJobSurveyAsync(jobId)
  const payload = {
    format: 'clearline-job',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: {
      customer: meta.customer || '',
      site: meta.site || '',
      ticket: meta.ticket || '',
    },
    survey,
    design: loadJobDesign(jobId),
    golive: loadJobGoLive(jobId),
  }
  downloadClearlinePayload(payload, meta)
}

function downloadClearlinePayload(payload, meta) {
  const name = (meta.customer || meta.site || 'job')
    .replace(/\W+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'job'
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.clearline`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Import a previously exported job file into this browser as a new job.
 */
export function importJobFile(payload) {
  if (!payload || (payload.format !== 'clearline-job' && payload.format !== 'voip-ops-job')) {
    throw new Error('Not a ClearLine job file')
  }
  const metaIn = payload.meta || {}
  const survey = payload.survey || createEmptySurvey()
  const design = payload.design || null
  const golive = payload.golive || null

  const id = makeId()
  const customer = metaIn.customer || survey.customer?.company || design?.project?.customer || 'Imported job'
  const site = metaIn.site || survey.customer?.siteName || design?.project?.site || ''
  const ticket = metaIn.ticket || survey.customer?.ticketId || ''

  const meta = upsertIndex({
    id,
    customer,
    site,
    ticket,
    createdAt: new Date().toISOString(),
    archived: false,
  })

  // Persist async — caller uses importJobFromFile which awaits photos
  const lean = {
    ...createEmptySurvey(),
    ...survey,
    id: makeId(),
    customer: {
      ...createEmptySurvey().customer,
      ...(survey.customer || {}),
      company: customer,
      siteName: site || survey.customer?.siteName || '',
      ticketId: ticket || survey.customer?.ticketId || '',
    },
    photos: stripPhotoDataUrls(survey.photos || []),
    updatedAt: new Date().toISOString(),
  }
  writeJson(jobKey(id, 'survey'), lean)
  if (design) writeJson(jobKey(id, 'design'), design)
  if (golive) writeJson(jobKey(id, 'golive'), golive)
  setActiveJobId(id)

  // Fire-and-forget photo store; importJobFromFile awaits a proper path
  if (photosHaveDataUrls(survey.photos)) {
    putJobPhotos(id, survey.photos).catch(() => {})
  }

  return meta
}

export async function importJobFromFile(file) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  if (!parsed || (parsed.format !== 'clearline-job' && parsed.format !== 'voip-ops-job')) {
    throw new Error('Not a ClearLine job file')
  }
  const metaIn = parsed.meta || {}
  const surveyIn = parsed.survey || createEmptySurvey()
  const design = parsed.design || null
  const golive = parsed.golive || null

  const id = makeId()
  const customer = metaIn.customer || surveyIn.customer?.company || design?.project?.customer || 'Imported job'
  const site = metaIn.site || surveyIn.customer?.siteName || design?.project?.site || ''
  const ticket = metaIn.ticket || surveyIn.customer?.ticketId || ''

  const meta = upsertIndex({
    id,
    customer,
    site,
    ticket,
    createdAt: new Date().toISOString(),
    archived: false,
  })

  await saveJobSurvey(id, {
    ...createEmptySurvey(),
    ...surveyIn,
    id: makeId(),
    customer: {
      ...createEmptySurvey().customer,
      ...(surveyIn.customer || {}),
      company: customer,
      siteName: site || surveyIn.customer?.siteName || '',
      ticketId: ticket || surveyIn.customer?.ticketId || '',
    },
    updatedAt: new Date().toISOString(),
  })
  if (design) writeJson(jobKey(id, 'design'), design)
  if (golive) writeJson(jobKey(id, 'golive'), golive)
  setActiveJobId(id)
  return meta
}

export function touchJobMeta(jobId, patch = {}) {
  const job = getJob(jobId)
  if (!job) return null
  return upsertIndex({ ...job, ...patch })
}

export function syncJobMetaFromSurvey(jobId, survey) {
  if (!jobId || !survey) return
  touchJobMeta(jobId, {
    customer: survey.customer?.company || '',
    site: survey.customer?.siteName || '',
    ticket: survey.customer?.ticketId || '',
  })
}

/** Sync lean survey (photos without dataUrls). Prefer loadJobSurveyAsync for UI. */
export function loadJobSurvey(jobId) {
  if (!jobId) return createEmptySurvey()
  const data = readJson(jobKey(jobId, 'survey'), null)
  return normalizeNetworkSurvey(data || createEmptySurvey())
}

export async function loadJobSurveyAsync(jobId) {
  const survey = loadJobSurvey(jobId)
  if (!jobId) return survey

  try {
    let photos = await getJobPhotos(jobId)
    if ((!photos || photos.length === 0) && photosHaveDataUrls(survey.photos)) {
      // Migrate legacy embedded dataUrls into IndexedDB
      photos = survey.photos
      await putJobPhotos(jobId, photos)
      const lean = { ...survey, photos: stripPhotoDataUrls(photos) }
      writeJson(jobKey(jobId, 'survey'), lean)
      return { ...lean, photos }
    }
    if (photos.length > 0) {
      return { ...survey, photos }
    }
  } catch (err) {
    console.error(err)
    emitSaveStatus({
      type: 'warn',
      message: 'Could not load site photos from device storage. Survey text still loaded.',
    })
  }
  return survey
}

/**
 * Persist survey; photo dataUrls go to IndexedDB, lean metadata to localStorage.
 * @returns {{ ok: boolean }}
 */
export async function saveJobSurvey(jobId, survey) {
  if (!jobId) return { ok: false }
  const next = normalizeNetworkSurvey({ ...survey, updatedAt: new Date().toISOString() })
  const photos = next.photos || []

  try {
    if (photosHaveDataUrls(photos)) {
      await putJobPhotos(jobId, photos)
    } else if (photos.length === 0) {
      await putJobPhotos(jobId, [])
    } else {
      await putJobPhotos(jobId, await mergePhotosForStore(jobId, photos))
    }
  } catch (err) {
    console.error(err)
    emitSaveStatus({
      type: 'error',
      message: 'Could not save site photos. Try fewer or smaller photos, then export a job file as backup.',
    })
    return { ok: false }
  }

  const lean = { ...next, photos: stripPhotoDataUrls(photos) }
  const ok = writeJson(jobKey(jobId, 'survey'), lean)
  if (ok) {
    syncJobMetaFromSurvey(jobId, lean)
    warnIfStoragePressure()
  }
  return { ok }
}

async function mergePhotosForStore(jobId, leanPhotos) {
  const existing = await getJobPhotos(jobId)
  const byId = new Map((existing || []).map(p => [p.id, p]))
  return leanPhotos.map(p => {
    const prev = byId.get(p.id)
    return prev?.dataUrl ? { ...prev, ...p, dataUrl: prev.dataUrl } : p
  })
}

export function loadJobDesign(jobId) {
  if (!jobId) return null
  return readJson(jobKey(jobId, 'design'), null)
}

export function saveJobDesign(jobId, design) {
  if (!jobId) return { ok: false }
  const ok = writeJson(jobKey(jobId, 'design'), design)
  if (ok) {
    touchJobMeta(jobId, {})
    if (design?.project) {
      touchJobMeta(jobId, {
        customer: design.project.customer || getJob(jobId)?.customer || '',
        site: design.project.site || getJob(jobId)?.site || '',
      })
    }
    warnIfStoragePressure()
  }
  return { ok }
}

export function loadJobGoLive(jobId) {
  if (!jobId) return null
  return readJson(jobKey(jobId, 'golive'), null)
}

export function saveJobGoLive(jobId, golive) {
  if (!jobId) return { ok: false }
  const ok = writeJson(jobKey(jobId, 'golive'), golive)
  if (ok) {
    touchJobMeta(jobId, {})
    warnIfStoragePressure()
  }
  return { ok }
}

/** Completion badges for hub cards — only real user content counts */
export function jobCompletion(jobId) {
  const survey = loadJobSurvey(jobId)
  const design = loadJobDesign(jobId)
  const golive = loadJobGoLive(jobId)

  const surveyDone = Boolean(
    String(survey?.customer?.company || '').trim()
    || String(survey?.customer?.siteName || '').trim()
    || (survey?.users || []).some(u => String(u.name || '').trim() || String(u.extension || '').trim())
    || (survey?.mainNumbers || []).some(n => String(n.number || '').trim()),
  )
  const designDone = Boolean(
    String(design?.project?.customer || '').trim()
    || String(design?.project?.site || '').trim()
    || String(design?.autoAttendant?.option1 || '').trim()
    || String(design?.autoAttendant?.greeting || '').trim()
    || (design?.users || []).some(u => String(u.name || '').trim() || String(u.extension || '').trim())
    || (design?.mainNumbers || []).some(n => String(n.number || '').trim()),
  )
  const goLiveDone = Boolean(
    String(golive?.cutover?.portDate || '').trim()
    || String(golive?.handoff?.signOffName || '').trim()
    || (golive?.install?.items || []).some(i => i.done),
  )

  return {
    survey: surveyDone,
    design: designDone,
    golive: goLiveDone,
  }
}

/**
 * One-time: fold legacy single drafts into a job so nothing is lost.
 */
export function migrateLegacyDrafts() {
  if (localStorage.getItem('voip-ops-jobs-migrated') === '1') return
  const jobs = readJson(INDEX_KEY, [])
  if (Array.isArray(jobs) && jobs.length > 0) {
    localStorage.setItem('voip-ops-jobs-migrated', '1')
    return
  }

  let survey = null
  let design = null
  try {
    const s = localStorage.getItem(LEGACY_SURVEY)
    if (s) survey = JSON.parse(s)
  } catch { /* ignore */ }
  try {
    const d = localStorage.getItem(LEGACY_DESIGN)
    if (d) design = JSON.parse(d)
  } catch { /* ignore */ }

  const hasSurvey = survey && (survey.customer?.company || survey.customer?.siteName || survey.techName)
  const hasDesign = design && (design.project?.customer || design.project?.site || design.users?.length)

  if (hasSurvey || hasDesign) {
    const id = makeId()
    const customer = survey?.customer?.company || design?.project?.customer || 'Migrated job'
    const site = survey?.customer?.siteName || design?.project?.site || ''
    const ticket = survey?.customer?.ticketId || ''
    writeJson(INDEX_KEY, [{
      id,
      customer,
      site,
      ticket,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
    }])
    if (survey) {
      // Persist lean + photos async
      const lean = { ...survey, photos: stripPhotoDataUrls(survey.photos || []) }
      writeJson(jobKey(id, 'survey'), lean)
      if (photosHaveDataUrls(survey.photos)) {
        putJobPhotos(id, survey.photos).catch(() => {})
      }
    } else {
      writeJson(jobKey(id, 'survey'), createEmptySurvey())
    }
    if (design) writeJson(jobKey(id, 'design'), design)
    setActiveJobId(id)
  }

  localStorage.setItem('voip-ops-jobs-migrated', '1')
}
