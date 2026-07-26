/**
 * ClearLine local-first data API — IndexedDB + in-memory cache.
 * UI should prefer these functions (also re-exported via jobModel / accountModel).
 */

import {
  deleteOutbox,
  enqueueOutbox,
  getMeta,
  idbClear,
  idbDelete,
  idbGetAll,
  idbPut,
  listOutbox,
  migrateLegacyPhotoDb,
  setMeta,
} from './db.js'
import {
  createEmptyRoute,
  mergeCallFlowPayload,
  normalizeAccountRoutes,
  routeHasContent,
} from './callFlowShape.js'
import { emitSaveStatus } from './saveStatus.js'
import {
  clearAllJobPhotos,
  deleteJobPhotos,
  getJobPhotos,
  hydrateSurveyPhotosForExport,
  photosHaveDataUrls,
  photosHavePayload,
  putJobPhotos,
  stripPhotoDataUrls,
} from './photoStore.js'
import { createEmptySurvey, makeId } from './surveyModel.js'
import { normalizeNetworkSurvey } from './networkReadiness.js'

const JOBS_INDEX_KEY = 'voip-ops-jobs-index'
const ACTIVE_JOB_KEY = 'voip-ops-active-job'
const LEGACY_SURVEY = 'voip-ops-survey-draft'
const LEGACY_DESIGN = 'voip-ops-system-design'
const ACCOUNTS_INDEX_KEY = 'voip-ops-accounts-index'
const ACTIVE_ACCOUNT_KEY = 'voip-ops-active-account'

/** @type {Map<string, object>} */
const _jobsCache = new Map()
/** @type {Map<string, object>} */
const _accountsCache = new Map()

let _ready = false
let _readyPromise = null

/** @type {null | (() => void)} */
export let _onWrite = null

export function onRepoWrite(fn) {
  _onWrite = fn
}

export function notifySyncNeeded() {
  if (typeof _onWrite === 'function') {
    try {
      _onWrite()
    } catch (err) {
      console.error(err)
    }
  }
}

function requireReady() {
  if (!_ready) {
    throw new Error('Repo not ready — await ensureRepoReady() before using data APIs')
  }
}

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function jobKey(jobId, kind) {
  return `voip-ops-job-${jobId}-${kind}`
}

function accountKey(accountId) {
  return `voip-ops-account-${accountId}`
}

function photosFingerprint(photos) {
  return (photos || [])
    .map(p => `${p.id}|${p.name || ''}|${p.caption || ''}|${p.category || ''}|${p.dataUrl || p.blob ? 1 : 0}|${p.storage_path || ''}`)
    .join(';')
}

const lastSavedPhotoFp = new Map()

function nowIso() {
  return new Date().toISOString()
}

function toJobMeta(job) {
  if (!job) return null
  return {
    id: job.id,
    customer: job.customer || '',
    site: job.site || '',
    ticket: job.ticket || '',
    stage: job.stage || 'survey',
    assigned_to: job.assigned_to ?? null,
    org_id: job.org_id ?? null,
    createdAt: job.createdAt || '',
    updatedAt: job.updatedAt || '',
    archived: !!job.archived,
    deleted_at: job.deleted_at ?? null,
    foc_date: job.foc_date ?? null,
    cutover_date: job.cutover_date ?? null,
    account_id: job.account_id ?? null,
    conflicts: job.conflicts || null,
    updated_by: job.updated_by ?? null,
  }
}

function emptyJobRecord(patch = {}) {
  const createdAt = patch.createdAt || nowIso()
  return {
    id: patch.id || makeId(),
    customer: patch.customer || '',
    site: patch.site || '',
    ticket: patch.ticket || '',
    stage: patch.stage || 'survey',
    assigned_to: patch.assigned_to ?? null,
    org_id: patch.org_id ?? null,
    survey: patch.survey ?? createEmptySurvey(),
    survey_rev: patch.survey_rev ?? 0,
    design: patch.design ?? null,
    design_rev: patch.design_rev ?? 0,
    golive: patch.golive ?? null,
    golive_rev: patch.golive_rev ?? 0,
    createdAt,
    updatedAt: patch.updatedAt || createdAt,
    archived: !!patch.archived,
    deleted_at: patch.deleted_at ?? null,
    conflicts: patch.conflicts ?? null,
    updated_by: patch.updated_by ?? null,
    foc_date: patch.foc_date ?? null,
    cutover_date: patch.cutover_date ?? null,
    account_id: patch.account_id ?? null,
    port: patch.port ?? null,
  }
}

export function emptyPort(patch = {}) {
  return {
    carrier: patch.carrier || '',
    focDate: patch.focDate || '',
    focConfirmed: Boolean(patch.focConfirmed),
    csrVerified: Boolean(patch.csrVerified),
    orderNumber: patch.orderNumber || '',
    submittedDate: patch.submittedDate || '',
    portingWindow: patch.portingWindow || '',
    dayOfContact: patch.dayOfContact || '',
    rollbackPlan: patch.rollbackPlan || '',
    dids: Array.isArray(patch.dids) ? patch.dids.map(d => String(d || '')) : [],
    notes: patch.notes || '',
    checklist: patch.checklist && typeof patch.checklist === 'object' ? { ...patch.checklist } : {},
  }
}

function createEmptyAccount(patch = {}) {
  const createdAt = patch.createdAt || nowIso()
  const routes = normalizeAccountRoutes(patch)
  const flow = mergeCallFlowPayload(routes[0] || createEmptyRoute())
  return {
    id: patch.id || makeId(),
    name: patch.name || '',
    site: patch.site || '',
    mainDid: patch.mainDid || '',
    accountNumber: patch.accountNumber || '',
    haloClientId: patch.haloClientId || '',
    haloKbArticleId: patch.haloKbArticleId || '',
    supportEmail: patch.supportEmail || '',
    exceptions: patch.exceptions || '',
    updatedBy: patch.updatedBy || '',
    createdAt,
    updatedAt: patch.updatedAt || createdAt,
    routes,
    flow,
    call_flow: patch.call_flow || {
      routes,
      flow,
      exceptions: patch.exceptions || '',
      updatedBy: patch.updatedBy || '',
    },
    call_flow_rev: patch.call_flow_rev ?? 0,
    org_id: patch.org_id ?? null,
    deleted_at: patch.deleted_at ?? null,
    conflicts: patch.conflicts ?? null,
    updated_by: patch.updated_by ?? null,
  }
}

function syncAccountCallFlow(account) {
  const routes = account.routes || []
  const flow = mergeCallFlowPayload(routes[0] || createEmptyRoute())
  return {
    ...account,
    flow,
    call_flow: {
      routes,
      flow,
      exceptions: account.exceptions || '',
      updatedBy: account.updatedBy || '',
    },
  }
}

function syncPrimaryDid(account) {
  const routes = account.routes || []
  for (const route of routes) {
    const first = (route.mainNumbers || []).find(n => String(n.number || '').trim())
    if (first?.number) {
      return { ...account, mainDid: String(first.number).trim() }
    }
  }
  return account
}

function toAccountMeta(account) {
  return {
    id: account.id,
    name: account.name || '',
    site: account.site || '',
    mainDid: account.mainDid || '',
    accountNumber: account.accountNumber || '',
    haloClientId: account.haloClientId || '',
    routeCount: Array.isArray(account.routes) ? account.routes.length : 1,
    updatedAt: account.updatedAt || '',
    createdAt: account.createdAt || '',
  }
}

async function afterWrite(entry) {
  await enqueueOutbox(entry)
  emitSaveStatus({ type: 'ok' })
  notifySyncNeeded()
}

async function persistJob(job, outbox) {
  await idbPut('jobs', job)
  _jobsCache.set(job.id, job)
  await afterWrite(outbox)
}

async function persistAccount(account, outbox) {
  await idbPut('accounts', account)
  _accountsCache.set(account.id, account)
  await afterWrite(outbox)
}

function schedulePersist(promise) {
  promise.catch((err) => {
    console.error(err)
    emitSaveStatus({
      type: 'error',
      message: 'Could not save — device storage failed. Export a backup if this keeps happening.',
      error: err,
    })
  })
}

/**
 * One-time: fold legacy single drafts into a job in localStorage so migration can copy them.
 */
function migrateLegacyDraftsLocalStorage() {
  if (localStorage.getItem('voip-ops-jobs-migrated') === '1') return
  const jobs = readLocalJson(JOBS_INDEX_KEY, [])
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
    const stamp = nowIso()
    localStorage.setItem(JOBS_INDEX_KEY, JSON.stringify([{
      id,
      customer,
      site,
      ticket,
      createdAt: stamp,
      updatedAt: stamp,
      archived: false,
    }]))
    if (survey) {
      const lean = { ...survey, photos: stripPhotoDataUrls(survey.photos || []) }
      localStorage.setItem(jobKey(id, 'survey'), JSON.stringify(lean))
      if (photosHaveDataUrls(survey.photos)) {
        putJobPhotos(id, survey.photos).catch(() => {})
      }
    } else {
      localStorage.setItem(jobKey(id, 'survey'), JSON.stringify(createEmptySurvey()))
    }
    if (design) localStorage.setItem(jobKey(id, 'design'), JSON.stringify(design))
    localStorage.setItem(ACTIVE_JOB_KEY, id)
  }

  localStorage.setItem('voip-ops-jobs-migrated', '1')
}

async function migrateLocalStorageToIdb() {
  const done = await getMeta('localStorageMigrated')
  if (done) return

  migrateLegacyDraftsLocalStorage()

  const jobIndex = readLocalJson(JOBS_INDEX_KEY, [])
  if (Array.isArray(jobIndex)) {
    for (const meta of jobIndex) {
      if (!meta?.id) continue
      const survey = readLocalJson(jobKey(meta.id, 'survey'), null)
      const design = readLocalJson(jobKey(meta.id, 'design'), null)
      const golive = readLocalJson(jobKey(meta.id, 'golive'), null)
      const record = emptyJobRecord({
        ...meta,
        survey: survey || createEmptySurvey(),
        design,
        golive,
      })
      await idbPut('jobs', record)
    }
  }

  const accountIndex = readLocalJson(ACCOUNTS_INDEX_KEY, [])
  if (Array.isArray(accountIndex)) {
    for (const meta of accountIndex) {
      if (!meta?.id) continue
      const raw = readLocalJson(accountKey(meta.id), null) || meta
      const account = syncAccountCallFlow(createEmptyAccount(raw))
      await idbPut('accounts', account)
    }
  }

  await setMeta('localStorageMigrated', true)
}

async function refreshCachesFromIdb() {
  _jobsCache.clear()
  _accountsCache.clear()
  const jobs = await idbGetAll('jobs')
  for (const job of jobs) {
    if (job?.id) _jobsCache.set(job.id, job)
  }
  const accounts = await idbGetAll('accounts')
  for (const account of accounts) {
    if (account?.id) _accountsCache.set(account.id, syncAccountCallFlow(createEmptyAccount(account)))
  }
}

/**
 * Idempotent: link jobs lacking account_id to an account named from customer/site.
 * Gated by meta key `jobsLinkedToAccounts`.
 */
export async function migrateJobsToAccounts() {
  const done = await getMeta('jobsLinkedToAccounts')
  if (done) return

  const accountsByKey = new Map()
  for (const account of _accountsCache.values()) {
    if (account?.deleted_at) continue
    const key = `${String(account.name || '').trim().toLowerCase()}|${String(account.site || '').trim().toLowerCase()}`
    if (!accountsByKey.has(key)) accountsByKey.set(key, account)
  }

  for (const job of [..._jobsCache.values()]) {
    if (!job?.id || job.deleted_at || job.account_id) continue
    const customer = String(job.customer || '').trim() || 'Untitled account'
    const site = String(job.site || '').trim()
    const key = `${customer.toLowerCase()}|${site.toLowerCase()}`
    let account = accountsByKey.get(key)
    if (!account) {
      account = createEmptyAccount({
        id: crypto.randomUUID(),
        name: customer,
        site,
      })
      account = syncPrimaryDid(syncAccountCallFlow(account))
      _accountsCache.set(account.id, account)
      await idbPut('accounts', account)
      await enqueueOutbox({
        type: 'account.create',
        entityId: account.id,
        payload: { id: account.id },
        createdAt: nowIso(),
        status: 'pending',
      })
      accountsByKey.set(key, account)
    }
    const next = { ...job, account_id: account.id, updatedAt: nowIso() }
    _jobsCache.set(job.id, next)
    await idbPut('jobs', next)
    await enqueueOutbox({
      type: 'job.meta',
      entityId: job.id,
      payload: { account_id: account.id },
      createdAt: nowIso(),
      status: 'pending',
    })
  }

  await setMeta('jobsLinkedToAccounts', true)
  notifySyncNeeded()
}

export async function ensureRepoReady() {
  if (_ready) return
  if (_readyPromise) return _readyPromise
  _readyPromise = (async () => {
    await migrateLegacyPhotoDb()
    await migrateLocalStorageToIdb()
    await refreshCachesFromIdb()
    await migrateJobsToAccounts()
    _ready = true
  })()
  try {
    await _readyPromise
  } catch (err) {
    _readyPromise = null
    throw err
  }
}

export function isRepoReady() {
  return _ready
}

/** @deprecated Prefer ensureRepoReady — kept for callers that still invoke it. */
export function migrateLegacyDrafts() {
  if (_ready) return
  migrateLegacyDraftsLocalStorage()
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export function listAllJobs() {
  requireReady()
  return [..._jobsCache.values()]
    .filter(j => !j.deleted_at)
    .map(toJobMeta)
}

export function listJobs() {
  return listAllJobs()
    .filter(j => !j.archived)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function getActiveJobId() {
  requireReady()
  const id = localStorage.getItem(ACTIVE_JOB_KEY)
  if (id && listAllJobs().some(j => j.id === id && !j.archived)) return id
  return null
}

export function setActiveJobId(jobId) {
  if (jobId) localStorage.setItem(ACTIVE_JOB_KEY, jobId)
  else localStorage.removeItem(ACTIVE_JOB_KEY)
}

export function getJob(jobId) {
  requireReady()
  if (!jobId) return null
  const job = _jobsCache.get(jobId)
  if (!job || job.deleted_at) return null
  return toJobMeta(job)
}

export function getJobRecord(jobId) {
  requireReady()
  if (!jobId) return null
  const job = _jobsCache.get(jobId)
  if (!job || job.deleted_at) return null
  return job
}

/** Includes soft-deleted jobs (for sync outbox drain). */
export function getJobRecordAny(jobId) {
  requireReady()
  if (!jobId) return null
  return _jobsCache.get(jobId) || null
}

export function createJob(patch = {}) {
  requireReady()
  const id = crypto.randomUUID()
  const survey = createEmptySurvey()
  if (patch.customer) survey.customer.company = patch.customer
  if (patch.site) survey.customer.siteName = patch.site
  if (patch.ticket) survey.customer.ticketId = patch.ticket

  const job = emptyJobRecord({
    id,
    customer: patch.customer || '',
    site: patch.site || '',
    ticket: patch.ticket || '',
    assigned_to: patch.assigned_to ?? null,
    account_id: patch.account_id ?? null,
    foc_date: patch.foc_date ?? null,
    cutover_date: patch.cutover_date ?? null,
    survey,
    design: null,
    golive: null,
    port: patch.port ? emptyPort(patch.port) : null,
  })
  _jobsCache.set(id, job)
  setActiveJobId(id)
  schedulePersist(persistJob(job, {
    type: 'job.create',
    entityId: id,
    payload: { id },
  }))
  return toJobMeta(job)
}

export function listJobsForAccount(accountId) {
  requireReady()
  if (!accountId) return []
  return listJobs()
    .filter(j => j.account_id === accountId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function getPort(jobId) {
  requireReady()
  const job = getJobRecord(jobId)
  if (!job) return emptyPort()
  return emptyPort(job.port || {})
}

export function savePort(jobId, port) {
  requireReady()
  if (!jobId) return { ok: false }
  const job = getJobRecord(jobId)
  if (!job) return { ok: false }
  const nextPort = emptyPort(port || {})
  const next = {
    ...job,
    port: nextPort,
    foc_date: nextPort.focDate || job.foc_date || null,
    updatedAt: nowIso(),
  }
  _jobsCache.set(jobId, next)
  schedulePersist(persistJob(next, {
    type: 'job.meta',
    entityId: jobId,
    payload: { port: nextPort, foc_date: next.foc_date },
  }))
  return { ok: true }
}

export function openJob(jobId) {
  const job = getJob(jobId)
  if (!job || job.archived) return null
  setActiveJobId(jobId)
  return job
}

export async function duplicateJob(jobId) {
  requireReady()
  const source = getJobRecord(jobId)
  if (!source) return null
  const survey = await loadJobSurveyAsync(jobId)
  const design = loadJobDesign(jobId)
  const golive = loadJobGoLive(jobId)
  const id = makeId()
  const job = emptyJobRecord({
    id,
    customer: `${source.customer || 'Job'} (copy)`,
    site: source.site || '',
    ticket: source.ticket || '',
    survey: survey || createEmptySurvey(),
    design: design ? { ...design } : null,
    golive: golive ? { ...golive } : null,
  })
  if (survey) {
    job.survey = {
      ...survey,
      id: makeId(),
      customer: { ...survey.customer, company: job.customer },
      updatedAt: nowIso(),
    }
  }
  _jobsCache.set(id, job)
  await persistJob(job, { type: 'job.create', entityId: id, payload: { id } })
  if (photosHaveDataUrls(survey?.photos) || (survey?.photos || []).length) {
    try {
      await putJobPhotos(id, survey.photos || [])
      await afterWrite({ type: 'photo.upload', entityId: id, payload: { jobId: id } })
    } catch { /* ignore photo copy failures */ }
  }
  setActiveJobId(id)
  return toJobMeta(job)
}

export function archiveJob(jobId) {
  requireReady()
  const job = getJobRecord(jobId)
  if (!job) return
  const wasActive = localStorage.getItem(ACTIVE_JOB_KEY) === jobId
  const next = { ...job, archived: true, updatedAt: nowIso() }
  _jobsCache.set(jobId, next)
  if (wasActive) setActiveJobId(null)
  schedulePersist(persistJob(next, {
    type: 'job.meta',
    entityId: jobId,
    payload: { archived: true },
  }))
}

export function deleteJob(jobId) {
  requireReady()
  if (!jobId) return
  const job = getJobRecord(jobId)
  if (!job) return
  const wasActive = localStorage.getItem(ACTIVE_JOB_KEY) === jobId
  lastSavedPhotoFp.delete(jobId)
  deleteJobPhotos(jobId).catch(() => {})
  const next = { ...job, deleted_at: nowIso(), updatedAt: nowIso() }
  _jobsCache.set(jobId, next)
  if (wasActive) setActiveJobId(null)
  schedulePersist(persistJob(next, {
    type: 'job.softDelete',
    entityId: jobId,
    payload: { deleted_at: next.deleted_at },
  }))
}

export function clearAllJobData() {
  const ids = [..._jobsCache.keys()]
  _jobsCache.clear()
  lastSavedPhotoFp.clear()
  setActiveJobId(null)

  const toRemove = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key === JOBS_INDEX_KEY
        || key === ACTIVE_JOB_KEY
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
  } catch { /* ignore */ }
  toRemove.forEach(key => localStorage.removeItem(key))

  schedulePersist((async () => {
    for (const id of ids) {
      await idbDelete('jobs', id)
    }
    await idbClear('jobs')
    await clearAllJobPhotos()
  })())
}

export function touchJobMeta(jobId, patch = {}) {
  requireReady()
  const job = getJobRecord(jobId)
  if (!job) return null
  const next = { ...job, ...patch, updatedAt: nowIso() }
  _jobsCache.set(jobId, next)
  schedulePersist(persistJob(next, {
    type: 'job.meta',
    entityId: jobId,
    payload: patch,
  }))
  return toJobMeta(next)
}

export function syncJobMetaFromSurvey(jobId, survey) {
  if (!jobId || !survey) return
  touchJobMeta(jobId, {
    customer: survey.customer?.company || '',
    site: survey.customer?.siteName || '',
    ticket: survey.customer?.ticketId || '',
  })
}

export function loadJobSurvey(jobId) {
  if (!jobId) return createEmptySurvey()
  requireReady()
  const job = getJobRecord(jobId)
  return normalizeNetworkSurvey(job?.survey || createEmptySurvey())
}

export async function loadJobSurveyAsync(jobId) {
  const survey = loadJobSurvey(jobId)
  if (!jobId) return survey

  try {
    let photos = await getJobPhotos(jobId)
    if ((!photos || photos.length === 0) && photosHaveDataUrls(survey.photos)) {
      photos = survey.photos
      await putJobPhotos(jobId, photos)
      const lean = { ...survey, photos: stripPhotoDataUrls(photos) }
      const job = getJobRecord(jobId)
      if (job) {
        const next = { ...job, survey: lean, updatedAt: nowIso() }
        _jobsCache.set(jobId, next)
        await idbPut('jobs', next)
      }
      return lean
    }
    if (photos.length > 0) {
      return { ...survey, photos: stripPhotoDataUrls(photos) }
    }
  } catch (err) {
    console.error(err)
    emitSaveStatus({
      type: 'warn',
      message: 'Could not load site photos from device storage. Survey text still loaded.',
    })
  }
  return { ...survey, photos: stripPhotoDataUrls(survey.photos || []) }
}

async function mergePhotosForStore(jobId, leanPhotos) {
  const existing = await getJobPhotos(jobId)
  const byId = new Map((existing || []).map(p => [p.id, p]))
  return leanPhotos.map((p) => {
    const prev = byId.get(p.id)
    if (!prev) return p
    return {
      ...prev,
      ...stripPhotoDataUrls([p])[0],
      blob: p.blob || prev.blob,
      dataUrl: p.dataUrl || prev.dataUrl,
      storage_path: p.storage_path || prev.storage_path,
    }
  })
}

export async function saveJobSurvey(jobId, survey) {
  requireReady()
  if (!jobId) return { ok: false }
  const job = getJobRecord(jobId)
  if (!job) return { ok: false }

  const nextSurvey = normalizeNetworkSurvey({ ...survey, updatedAt: nowIso() })
  const photos = nextSurvey.photos || []
  const fp = photosFingerprint(photos)
  const photosChanged = lastSavedPhotoFp.get(jobId) !== fp

  if (photosChanged) {
    try {
      if (photosHavePayload(photos)) {
        await putJobPhotos(jobId, await mergePhotosForStore(jobId, photos))
      } else if (photos.length === 0) {
        await putJobPhotos(jobId, [])
      } else {
        await putJobPhotos(jobId, await mergePhotosForStore(jobId, photos))
      }
      lastSavedPhotoFp.set(jobId, fp)
      await enqueueOutbox({
        type: 'photo.upload',
        entityId: jobId,
        payload: { jobId },
        createdAt: nowIso(),
        status: 'pending',
      })
      notifySyncNeeded()
    } catch (err) {
      console.error(err)
      emitSaveStatus({
        type: 'error',
        message: 'Could not save site photos. Try fewer or smaller photos, then export a job file as backup.',
      })
      return { ok: false }
    }
  }

  const lean = { ...nextSurvey, photos: stripPhotoDataUrls(photos) }
  const next = {
    ...job,
    survey: lean,
    customer: lean.customer?.company || job.customer || '',
    site: lean.customer?.siteName || job.site || '',
    ticket: lean.customer?.ticketId || job.ticket || '',
    updatedAt: nowIso(),
  }
  _jobsCache.set(jobId, next)
  try {
    await persistJob(next, {
      type: 'job.section',
      entityId: jobId,
      payload: {
        jobId,
        section: 'survey',
        baseRev: next.survey_rev ?? 0,
        payload: lean,
      },
    })
    return { ok: true }
  } catch (err) {
    console.error(err)
    emitSaveStatus({
      type: 'error',
      message: 'Could not save survey. Export a job file as backup.',
      error: err,
    })
    return { ok: false }
  }
}

export function loadJobDesign(jobId) {
  if (!jobId) return null
  requireReady()
  return getJobRecord(jobId)?.design ?? null
}

export function saveJobDesign(jobId, design) {
  requireReady()
  if (!jobId) return { ok: false }
  const job = getJobRecord(jobId)
  if (!job) return { ok: false }

  const patch = {}
  if (design?.project) {
    patch.customer = design.project.customer || job.customer || ''
    patch.site = design.project.site || job.site || ''
  }
  const next = {
    ...job,
    ...patch,
    design,
    updatedAt: nowIso(),
  }
  _jobsCache.set(jobId, next)
  schedulePersist(persistJob(next, {
    type: 'job.section',
    entityId: jobId,
    payload: {
      jobId,
      section: 'design',
      baseRev: next.design_rev ?? 0,
      payload: design,
    },
  }))
  return { ok: true }
}

export function loadJobGoLive(jobId) {
  if (!jobId) return null
  requireReady()
  return getJobRecord(jobId)?.golive ?? null
}

export function saveJobGoLive(jobId, golive) {
  requireReady()
  if (!jobId) return { ok: false }
  const job = getJobRecord(jobId)
  if (!job) return { ok: false }
  const next = { ...job, golive, updatedAt: nowIso() }
  _jobsCache.set(jobId, next)
  schedulePersist(persistJob(next, {
    type: 'job.section',
    entityId: jobId,
    payload: {
      jobId,
      section: 'golive',
      baseRev: next.golive_rev ?? 0,
      payload: golive,
    },
  }))
  return { ok: true }
}

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

export function exportJobFile(jobId) {
  const meta = getJob(jobId)
  if (!meta) throw new Error('Job not found')
  const survey = loadJobSurvey(jobId)
  const payload = {
    format: 'clearline-job',
    version: 1,
    exportedAt: nowIso(),
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
  const surveyLean = await loadJobSurveyAsync(jobId)
  const survey = await hydrateSurveyPhotosForExport(jobId, surveyLean)
  const payload = {
    format: 'clearline-job',
    version: 1,
    exportedAt: nowIso(),
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

export function importJobFile(payload) {
  requireReady()
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
    updatedAt: nowIso(),
  }

  const job = emptyJobRecord({
    id,
    customer,
    site,
    ticket,
    survey: lean,
    design,
    golive,
  })
  _jobsCache.set(id, job)
  setActiveJobId(id)
  schedulePersist(persistJob(job, { type: 'job.create', entityId: id, payload: { id } }))

  if (photosHaveDataUrls(survey.photos)) {
    putJobPhotos(id, survey.photos)
      .then(() => afterWrite({ type: 'photo.upload', entityId: id, payload: { jobId: id } }))
      .catch(() => {})
  }

  return toJobMeta(job)
}

export async function importJobFromFile(file) {
  requireReady()
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

  const job = emptyJobRecord({
    id,
    customer,
    site,
    ticket,
    survey: createEmptySurvey(),
    design,
    golive,
  })
  _jobsCache.set(id, job)
  await persistJob(job, { type: 'job.create', entityId: id, payload: { id } })

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
    updatedAt: nowIso(),
  })

  if (design || golive) {
    const current = getJobRecord(id)
    if (current) {
      const next = {
        ...current,
        design: design || current.design,
        golive: golive || current.golive,
        updatedAt: nowIso(),
      }
      _jobsCache.set(id, next)
      await persistJob(next, {
        type: 'job.section',
        entityId: id,
        payload: { section: design ? 'design' : 'golive' },
      })
    }
  }

  setActiveJobId(id)
  return toJobMeta(getJobRecord(id))
}

// ── Accounts ────────────────────────────────────────────────────────────────

export function listAccounts() {
  requireReady()
  return [..._accountsCache.values()]
    .filter(a => !a.deleted_at)
    .map(toAccountMeta)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function getAccount(accountId) {
  requireReady()
  if (!accountId) return null
  const account = _accountsCache.get(accountId)
  if (!account || account.deleted_at) return null
  return syncAccountCallFlow(createEmptyAccount(account))
}

export function getActiveAccountId() {
  requireReady()
  const id = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
  if (id && [..._accountsCache.values()].some(a => a.id === id && !a.deleted_at)) return id
  return null
}

export function setActiveAccountId(accountId) {
  if (accountId) localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId)
  else localStorage.removeItem(ACTIVE_ACCOUNT_KEY)
}

export function createAccount(patch = {}) {
  requireReady()
  let account = createEmptyAccount({ ...patch, id: patch.id || crypto.randomUUID() })
  if (patch.mainDid) {
    const route = account.routes[0] || createEmptyRoute({ name: 'Main route' })
    if (!route.mainNumbers.length) {
      route.mainNumbers = [{ id: makeId(), number: patch.mainDid, label: 'Main' }]
    }
    account.routes = [route, ...account.routes.slice(1)]
    account.mainDid = patch.mainDid
  }
  account = syncPrimaryDid(syncAccountCallFlow(account))
  _accountsCache.set(account.id, account)
  setActiveAccountId(account.id)
  schedulePersist(persistAccount(account, {
    type: 'account.create',
    entityId: account.id,
    payload: { id: account.id },
  }))
  return getAccount(account.id)
}

export function saveAccount(account) {
  requireReady()
  if (!account?.id) throw new Error('Account id required')
  const prev = getAccount(account.id) || createEmptyAccount({ id: account.id })
  const routes = normalizeAccountRoutes({
    ...account,
    routes: account.routes?.length ? account.routes : prev.routes,
    flow: account.flow || prev.flow,
  })
  let next = createEmptyAccount({
    ...prev,
    ...account,
    routes,
    flow: mergeCallFlowPayload(routes[0]),
    call_flow_rev: prev.call_flow_rev ?? 0,
    org_id: prev.org_id ?? null,
    updatedAt: nowIso(),
  })
  next = syncPrimaryDid(syncAccountCallFlow(next))
  _accountsCache.set(next.id, next)
  schedulePersist(persistAccount(next, {
    type: 'account.update',
    entityId: next.id,
    payload: { call_flow_rev: next.call_flow_rev },
  }))
  return getAccount(next.id)
}

export function deleteAccount(accountId) {
  requireReady()
  if (!accountId) return
  const account = _accountsCache.get(accountId)
  if (!account || account.deleted_at) return
  const wasActive = localStorage.getItem(ACTIVE_ACCOUNT_KEY) === accountId
  const next = { ...account, deleted_at: nowIso(), updatedAt: nowIso() }
  _accountsCache.set(accountId, next)
  if (wasActive) setActiveAccountId(null)
  schedulePersist(persistAccount(next, {
    type: 'account.softDelete',
    entityId: accountId,
    payload: { deleted_at: next.deleted_at },
  }))
}

export function clearAllAccountData() {
  const ids = [..._accountsCache.keys()]
  _accountsCache.clear()
  setActiveAccountId(null)
  try {
    for (const id of ids) {
      localStorage.removeItem(accountKey(id))
    }
    localStorage.removeItem(ACCOUNTS_INDEX_KEY)
  } catch { /* ignore */ }
  schedulePersist((async () => {
    await idbClear('accounts')
  })())
}

function downloadAccountPayload(payload, filenameBase) {
  const name = (filenameBase || 'account')
    .replace(/\W+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'account'
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-callflow-${new Date().toISOString().slice(0, 10)}.clearline-account`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAccountFile(accountId) {
  const account = getAccount(accountId)
  if (!account) throw new Error('Account not found')
  const payload = {
    format: 'clearline-account',
    version: 2,
    exportedAt: nowIso(),
    account,
  }
  downloadAccountPayload(payload, account.name || account.site || 'account')
}

export function exportAllAccounts() {
  const accounts = listAccounts().map(m => getAccount(m.id)).filter(Boolean)
  const payload = {
    format: 'clearline-accounts',
    version: 2,
    exportedAt: nowIso(),
    accounts,
  }
  downloadAccountPayload(payload, 'clearline-accounts')
  return accounts.length
}

function importOneAccount(raw) {
  requireReady()
  let account = createEmptyAccount({
    ...raw,
    id: makeId(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  account = syncPrimaryDid(syncAccountCallFlow(account))
  _accountsCache.set(account.id, account)
  setActiveAccountId(account.id)
  schedulePersist(persistAccount(account, {
    type: 'account.create',
    entityId: account.id,
    payload: { id: account.id },
  }))
  return getAccount(account.id)
}

export async function importAccountFromFile(file) {
  requireReady()
  const text = await file.text()
  const data = JSON.parse(text)

  if (data.format === 'clearline-accounts' && Array.isArray(data.accounts)) {
    const imported = []
    for (const raw of data.accounts) {
      imported.push(importOneAccount(raw))
    }
    return imported[imported.length - 1] || null
  }

  if (data.format === 'clearline-account' && data.account) {
    return importOneAccount(data.account)
  }

  if (data.name || data.flow || data.routes) {
    return importOneAccount(data)
  }

  throw new Error('Unrecognized account file')
}

export function searchAccounts(query) {
  const q = String(query || '').trim().toLowerCase()
  const all = listAccounts()
  if (!q) return all
  return all.filter(a => {
    const full = getAccount(a.id)
    const routeHay = (full?.routes || [])
      .flatMap(r => [
        r.name,
        ...(r.mainNumbers || []).map(n => `${n.number || ''} ${n.label || ''}`),
      ])
      .join(' ')
    const hay = [a.name, a.site, a.mainDid, a.accountNumber, a.haloClientId, routeHay]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function accountHasFlowContent(accountId) {
  const account = getAccount(accountId)
  if (!account) return false
  return (account.routes || []).some(routeHasContent)
}

export function accountRouteCount(accountId) {
  const account = getAccount(accountId)
  return account?.routes?.length || 0
}

// ── Sync helpers ────────────────────────────────────────────────────────────

export async function pendingOutboxFor(entityId) {
  if (!entityId) return []
  const rows = await listOutbox()
  return rows.filter(e => e.entityId === entityId && e.status !== 'done')
}

function hasConflictMap(conflicts) {
  return Boolean(conflicts && typeof conflicts === 'object' && Object.keys(conflicts).length > 0)
}

function mapServerJobToLocal(row, local = null) {
  const createdAt = local?.createdAt || row.updated_at || nowIso()
  return emptyJobRecord({
    id: row.id,
    org_id: row.org_id ?? local?.org_id ?? null,
    account_id: row.account_id ?? local?.account_id ?? null,
    customer: row.customer ?? local?.customer ?? '',
    site: row.site ?? local?.site ?? '',
    ticket: local?.ticket || '',
    stage: row.stage || local?.stage || 'survey',
    assigned_to: row.assigned_to ?? local?.assigned_to ?? null,
    survey: row.survey ?? local?.survey ?? createEmptySurvey(),
    survey_rev: row.survey_rev ?? local?.survey_rev ?? 0,
    design: row.design ?? local?.design ?? null,
    design_rev: row.design_rev ?? local?.design_rev ?? 0,
    golive: row.golive ?? local?.golive ?? null,
    golive_rev: row.golive_rev ?? local?.golive_rev ?? 0,
    createdAt,
    updatedAt: row.updated_at || local?.updatedAt || createdAt,
    archived: local?.archived || false,
    deleted_at: row.deleted_at ?? local?.deleted_at ?? null,
    conflicts: local?.conflicts ?? null,
    updated_by: row.updated_by ?? local?.updated_by ?? null,
    foc_date: row.foc_date ?? local?.foc_date ?? null,
    cutover_date: row.cutover_date ?? local?.cutover_date ?? null,
    port: row.port ?? local?.port ?? null,
  })
}

function mapServerAccountToLocal(row, local = null) {
  const callFlow = row.call_flow || local?.call_flow || {}
  const routes = callFlow.routes || local?.routes
  return syncAccountCallFlow(createEmptyAccount({
    ...(local || {}),
    id: row.id,
    org_id: row.org_id ?? local?.org_id ?? null,
    name: row.name ?? local?.name ?? '',
    site: row.site ?? local?.site ?? '',
    mainDid: local?.mainDid || '',
    accountNumber: local?.accountNumber || '',
    haloClientId: local?.haloClientId || '',
    haloKbArticleId: local?.haloKbArticleId || '',
    exceptions: callFlow.exceptions ?? local?.exceptions ?? '',
    updatedBy: callFlow.updatedBy ?? local?.updatedBy ?? '',
    routes,
    flow: callFlow.flow || local?.flow,
    call_flow: callFlow,
    call_flow_rev: row.call_flow_rev ?? local?.call_flow_rev ?? 0,
    deleted_at: row.deleted_at ?? local?.deleted_at ?? null,
    conflicts: local?.conflicts ?? null,
    updated_by: row.updated_by ?? local?.updated_by ?? null,
    createdAt: local?.createdAt || row.updated_at || nowIso(),
    updatedAt: row.updated_at || local?.updatedAt || nowIso(),
  }))
}

/** Persist job without enqueueing outbox (used by sync engine). */
export async function writeJobLocal(job) {
  requireReady()
  if (!job?.id) return
  _jobsCache.set(job.id, job)
  await idbPut('jobs', job)
}

/** Persist account without enqueueing outbox (used by sync engine). */
export async function writeAccountLocal(account) {
  requireReady()
  if (!account?.id) return
  const next = syncAccountCallFlow(account)
  _accountsCache.set(next.id, next)
  await idbPut('accounts', next)
}

/**
 * Merge a server job row into cache/IDB when safe.
 * Skips overwrite if pending outbox entries exist or local conflicts are present.
 */
export async function upsertRemoteJob(row) {
  requireReady()
  if (!row?.id) return false
  const pending = await pendingOutboxFor(row.id)
  const local = _jobsCache.get(row.id) || null
  if (pending.length > 0) return false
  if (hasConflictMap(local?.conflicts)) return false

  const next = mapServerJobToLocal(row, local)
  // Remote wins on conflicts field only when local has none
  next.conflicts = null
  await writeJobLocal(next)
  return true
}

/**
 * Merge a server account row into cache/IDB when safe.
 */
export async function upsertRemoteAccount(row) {
  requireReady()
  if (!row?.id) return false
  const pending = await pendingOutboxFor(row.id)
  const local = _accountsCache.get(row.id) || null
  if (pending.length > 0) return false
  if (hasConflictMap(local?.conflicts)) return false

  const next = mapServerAccountToLocal(row, local)
  next.conflicts = null
  await writeAccountLocal(next)
  return true
}

export function listJobConflicts() {
  requireReady()
  return [..._jobsCache.values()]
    .filter(j => !j.deleted_at && hasConflictMap(j.conflicts))
    .map(toJobMeta)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

/**
 * Resolve a section conflict: keep local ('mine') or take server ('theirs').
 */
export async function resolveConflict(jobId, section, choice) {
  requireReady()
  const job = _jobsCache.get(jobId)
  if (!job?.conflicts?.[section]) return null

  const conflict = job.conflicts[section]
  const remaining = { ...job.conflicts }
  delete remaining[section]
  const nextConflicts = hasConflictMap(remaining) ? remaining : null

  if (choice === 'theirs') {
    const next = {
      ...job,
      [section]: conflict.server,
      [`${section}_rev`]: conflict.serverRev ?? job[`${section}_rev`] ?? 0,
      conflicts: nextConflicts,
      updatedAt: nowIso(),
    }
    await writeJobLocal(next)

    const outbox = await listOutbox()
    for (const entry of outbox) {
      if (
        entry.entityId === jobId
        && entry.type === 'job.section'
        && entry.payload?.section === section
        && entry.status === 'conflicted'
      ) {
        await deleteOutbox(entry.id)
      }
    }
    return toJobMeta(next)
  }

  // Keep mine — adopt server rev as base so next push overwrites
  const baseRev = conflict.serverRev ?? job[`${section}_rev`] ?? 0
  const next = {
    ...job,
    [`${section}_rev`]: baseRev,
    conflicts: nextConflicts,
    updatedAt: nowIso(),
  }
  await writeJobLocal(next)

  const outbox = await listOutbox()
  for (const entry of outbox) {
    if (
      entry.entityId === jobId
      && entry.type === 'job.section'
      && entry.payload?.section === section
      && entry.status === 'conflicted'
    ) {
      await deleteOutbox(entry.id)
    }
  }

  await afterWrite({
    type: 'job.section',
    entityId: jobId,
    payload: {
      jobId,
      section,
      baseRev,
      payload: next[section],
    },
  })
  return toJobMeta(next)
}

export async function markSectionConflict(jobId, section, info) {
  requireReady()
  const job = _jobsCache.get(jobId)
  if (!job) return
  const next = {
    ...job,
    conflicts: {
      ...(job.conflicts || {}),
      [section]: info,
    },
    updatedAt: nowIso(),
  }
  await writeJobLocal(next)
}

export function getAccountRecord(accountId) {
  requireReady()
  if (!accountId) return null
  const account = _accountsCache.get(accountId)
  if (!account || account.deleted_at) return null
  return account
}

/** Includes soft-deleted accounts (for sync outbox drain). */
export function getAccountRecordAny(accountId) {
  requireReady()
  if (!accountId) return null
  return _accountsCache.get(accountId) || null
}
