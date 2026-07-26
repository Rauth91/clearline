/**
 * ClearLine sync engine — outbox push, pull, realtime, status bus.
 */

import {
  deleteOutbox,
  getMeta,
  listOutbox,
  setMeta,
  updateOutbox,
} from './db.js'
import {
  fetchProfile,
  getCachedProfile,
  getSession,
} from './authModel.js'
import { getJobPhotos, putJobPhotos, stripPhotoDataUrls, dataUrlToBlob } from './photoStore.js'
import { emitDataChanged } from './dataEvents.js'
import {
  getFirmwareRef,
  upsertRemoteFirmware,
  writeFirmwareLocal,
} from './firmwareModel.js'
import {
  getAccountRecordAny,
  getJobRecordAny,
  listJobConflicts,
  markSectionConflict,
  onRepoWrite,
  pendingOutboxFor,
  upsertRemoteAccount,
  upsertRemoteJob,
  writeAccountLocal,
  writeJobLocal,
} from './repo.js'
import { emitSaveStatus } from './saveStatus.js'
import { getSupabase, isSupabaseConfigured } from './supabaseClient.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LAST_SYNC_KEY = 'lastSyncAt'
const PUSH_INTERVAL_MS = 30_000
const PULL_INTERVAL_MS = 60_000
const PUSH_DEBOUNCE_MS = 800

/** @typedef {'synced'|'syncing'|'offline'|'conflicts'} SyncState */
/** @typedef {{ state: SyncState, pendingCount: number, conflictCount: number }} SyncStatus */

/** @type {SyncStatus} */
let _status = { state: 'offline', pendingCount: 0, conflictCount: 0 }
/** @type {Set<(s: SyncStatus) => void>} */
const _listeners = new Set()

let _started = false
let _pushTimer = null
let _pushInFlight = false
let _pullInFlight = false
let _pushIntervalId = null
let _pullIntervalId = null
/** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
let _realtimeChannel = null
let _orgIdFilter = null

function isUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}

function emitStatus() {
  const snapshot = { ..._status }
  for (const cb of _listeners) {
    try {
      cb(snapshot)
    } catch (err) {
      console.error(err)
    }
  }
}

async function countPending() {
  const rows = await listOutbox()
  return rows.filter(e => e.status === 'pending' || e.status === 'conflicted').length
}

async function refreshStatus(partial = {}) {
  const pendingCount = partial.pendingCount ?? await countPending()
  let conflictCount = partial.conflictCount
  if (conflictCount == null) {
    try {
      conflictCount = listJobConflicts().length
    } catch {
      conflictCount = _status.conflictCount
    }
  }

  let state = partial.state
  if (!state) {
    if (!isSupabaseConfigured) {
      state = 'synced'
    } else if (!navigator.onLine) {
      state = 'offline'
    } else if (conflictCount > 0) {
      state = 'conflicts'
    } else if (_pushInFlight || _pullInFlight) {
      state = 'syncing'
    } else if (pendingCount > 0) {
      state = 'syncing'
    } else {
      state = 'synced'
    }
  }

  _status = { state, pendingCount, conflictCount }
  emitStatus()
}

export function subscribeSyncStatus(cb) {
  _listeners.add(cb)
  try {
    cb(getSyncStatus())
  } catch (err) {
    console.error(err)
  }
  return () => { _listeners.delete(cb) }
}

export function getSyncStatus() {
  return { ..._status }
}

export function getFirstConflictedJobId() {
  try {
    const jobs = listJobConflicts()
    return jobs[0]?.id || null
  } catch {
    return null
  }
}

/**
 * Append a job_events row when online (no-op offline / unconfigured).
 * @param {string} jobId
 * @param {string} type
 * @param {Record<string, unknown>} [detail]
 */
export async function logJobEvent(jobId, type, detail = {}) {
  if (!jobId || !type || !isSupabaseConfigured || !navigator.onLine) return
  const sb = getSupabase()
  if (!sb) return
  try {
    const session = await getSession()
    if (!session) return
    const profile = await resolveProfile()
    if (!profile?.org_id) return
    const { error } = await sb.from('job_events').insert({
      org_id: profile.org_id,
      job_id: jobId,
      actor: profile.id,
      type,
      detail,
    })
    if (error) console.error('logJobEvent', error)
  } catch (err) {
    console.error('logJobEvent', err)
  }
}

async function resolveProfile() {
  let profile = await getCachedProfile()
  if (profile?.org_id) return profile
  try {
    const session = await getSession()
    if (!session) return profile
    profile = await fetchProfile()
    return profile
  } catch {
    return profile
  }
}

function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (_pushTimer) clearTimeout(_pushTimer)
  _pushTimer = setTimeout(() => {
    _pushTimer = null
    pushOutbox().catch((err) => console.error(err))
  }, delay)
}

function errMessage(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  return err.message || err.error_description || err.details || String(err)
}

async function handleJobCreate(sb, entry, profile) {
  const job = getJobRecordAny(entry.entityId) || getJobRecordAny(entry.payload?.id)
  if (!job) {
    await deleteOutbox(entry.id)
    return
  }
  const row = {
    org_id: profile.org_id,
    customer: job.customer || 'Untitled',
    site: job.site || null,
    stage: job.stage || 'survey',
    assigned_to: job.assigned_to || null,
    foc_date: job.foc_date || null,
    cutover_date: job.cutover_date || null,
    account_id: job.account_id || null,
    survey: job.survey || {},
    survey_rev: job.survey_rev ?? 0,
    design: job.design || {},
    design_rev: job.design_rev ?? 0,
    golive: job.golive || {},
    golive_rev: job.golive_rev ?? 0,
    deleted_at: job.deleted_at || null,
  }
  if (isUuid(job.id)) row.id = job.id

  const { data, error } = await sb.from('jobs').insert(row).select().single()
  if (error) throw error

  if (data?.id && data.id !== job.id) {
    // Server generated a new id — remap local record (rare; prefer client UUIDs)
    const remapped = { ...job, id: data.id, org_id: data.org_id || profile.org_id }
    await writeJobLocal(remapped)
    await setMeta(`jobIdMap:${job.id}`, data.id)
  } else if (data) {
    await writeJobLocal({
      ...job,
      org_id: data.org_id || profile.org_id,
      survey_rev: data.survey_rev ?? job.survey_rev,
      design_rev: data.design_rev ?? job.design_rev,
      golive_rev: data.golive_rev ?? job.golive_rev,
      updated_by: data.updated_by ?? job.updated_by,
      updatedAt: data.updated_at || job.updatedAt,
    })
  }
  await deleteOutbox(entry.id)
}

async function handleJobSection(sb, entry) {
  const jobId = entry.payload?.jobId || entry.entityId
  const section = entry.payload?.section
  if (!jobId || !['survey', 'design', 'golive'].includes(section)) {
    await deleteOutbox(entry.id)
    return
  }

  const job = getJobRecordAny(jobId)
  if (!job) {
    await deleteOutbox(entry.id)
    return
  }

  const baseRev = job[`${section}_rev`]
    ?? entry.payload?.baseRev
    ?? entry.payload?.[`${section}_rev`]
    ?? 0
  // Prefer live local section so rapid saves coalesce at push time
  const sectionPayload = job[section] ?? entry.payload?.payload ?? {}

  const { data, error } = await sb
    .from('jobs')
    .update({
      [section]: sectionPayload,
      [`${section}_rev`]: baseRev,
    })
    .eq('id', jobId)
    .select()
    .maybeSingle()

  if (error) {
    const msg = errMessage(error)
    if (msg.includes(`conflict:${section}`) || msg.includes('conflict:')) {
      const { data: serverRow } = await sb.from('jobs').select('*').eq('id', jobId).maybeSingle()
      const serverRevKey = `${section}_rev`
      await markSectionConflict(jobId, section, {
        server: serverRow?.[section] ?? null,
        serverRev: serverRow?.[serverRevKey] ?? null,
        local: sectionPayload,
      })
      await updateOutbox(entry.id, { status: 'conflicted' })
      emitSaveStatus({
        type: 'warn',
        message: `Sync conflict on ${section} — review and choose whose version to keep.`,
      })
      return
    }
    throw error
  }

  if (data) {
    await writeJobLocal({
      ...job,
      [section]: data[section] ?? sectionPayload,
      [`${section}_rev`]: data[`${section}_rev`] ?? (baseRev + 1),
      updated_by: data.updated_by ?? job.updated_by,
      updatedAt: data.updated_at || job.updatedAt,
    })
  }
  await deleteOutbox(entry.id)
  logJobEvent(jobId, 'section.save', { section }).catch(() => {})
}

async function handleJobMeta(sb, entry) {
  const jobId = entry.entityId
  const job = getJobRecordAny(jobId)
  if (!job) {
    await deleteOutbox(entry.id)
    return
  }
  const patch = entry.payload || {}
  const metaUpdate = {
    customer: patch.customer ?? job.customer ?? 'Untitled',
    site: patch.site ?? job.site ?? null,
    stage: patch.stage ?? job.stage ?? 'survey',
    assigned_to: 'assigned_to' in patch ? patch.assigned_to : job.assigned_to,
    foc_date: 'foc_date' in patch ? patch.foc_date : job.foc_date,
    cutover_date: 'cutover_date' in patch ? patch.cutover_date : job.cutover_date,
    account_id: 'account_id' in patch ? patch.account_id : job.account_id,
  }

  const { error } = await sb.from('jobs').update(metaUpdate).eq('id', jobId)
  if (error) throw error
  await deleteOutbox(entry.id)
  if ('assigned_to' in patch) {
    logJobEvent(jobId, 'assignment.change', { assigned_to: metaUpdate.assigned_to }).catch(() => {})
  }
  if ('stage' in patch && patch.stage != null) {
    logJobEvent(jobId, 'stage.change', { stage: metaUpdate.stage }).catch(() => {})
  }
}

async function handleJobSoftDelete(sb, entry) {
  const jobId = entry.entityId
  const deletedAt = entry.payload?.deleted_at || new Date().toISOString()
  const { error } = await sb.from('jobs').update({ deleted_at: deletedAt }).eq('id', jobId)
  if (error) throw error
  await deleteOutbox(entry.id)
}

async function handleAccountCreate(sb, entry, profile) {
  const account = getAccountRecordAny(entry.entityId)
  if (!account) {
    await deleteOutbox(entry.id)
    return
  }
  const row = {
    org_id: profile.org_id,
    name: account.name || 'Untitled',
    site: account.site || null,
    call_flow: account.call_flow || {},
    call_flow_rev: account.call_flow_rev ?? 0,
    deleted_at: account.deleted_at || null,
  }
  if (isUuid(account.id)) row.id = account.id

  const { data, error } = await sb.from('accounts').insert(row).select().single()
  if (error) throw error
  if (data) {
    await writeAccountLocal({
      ...account,
      id: data.id,
      org_id: data.org_id || profile.org_id,
      call_flow_rev: data.call_flow_rev ?? account.call_flow_rev,
      updated_by: data.updated_by ?? account.updated_by,
      updatedAt: data.updated_at || account.updatedAt,
    })
  }
  await deleteOutbox(entry.id)
}

async function handleAccountUpdate(sb, entry) {
  const accountId = entry.entityId
  const account = getAccountRecordAny(accountId)
  if (!account) {
    await deleteOutbox(entry.id)
    return
  }
  const baseRev = account.call_flow_rev
    ?? entry.payload?.baseRev
    ?? entry.payload?.call_flow_rev
    ?? 0

  const { data, error } = await sb
    .from('accounts')
    .update({
      name: account.name || 'Untitled',
      site: account.site || null,
      call_flow: account.call_flow || {},
      call_flow_rev: baseRev,
    })
    .eq('id', accountId)
    .select()
    .maybeSingle()

  if (error) {
    const msg = errMessage(error)
    if (msg.includes('conflict:call_flow') || msg.includes('conflict:')) {
      await updateOutbox(entry.id, { status: 'conflicted' })
      emitSaveStatus({
        type: 'warn',
        message: 'Sync conflict on account call flow. Re-open the account and save again after review.',
      })
      return
    }
    throw error
  }

  if (data) {
    await writeAccountLocal({
      ...account,
      call_flow_rev: data.call_flow_rev ?? (baseRev + 1),
      updated_by: data.updated_by ?? account.updated_by,
      updatedAt: data.updated_at || account.updatedAt,
    })
  }
  await deleteOutbox(entry.id)
}

async function handleAccountSoftDelete(sb, entry) {
  const deletedAt = entry.payload?.deleted_at || new Date().toISOString()
  const { error } = await sb.from('accounts').update({ deleted_at: deletedAt }).eq('id', entry.entityId)
  if (error) throw error
  await deleteOutbox(entry.id)
}

async function handlePhotoUpload(sb, entry, profile) {
  const jobId = entry.payload?.jobId || entry.entityId
  if (!jobId) {
    await deleteOutbox(entry.id)
    return
  }
  const photos = await getJobPhotos(jobId)
  const remaining = []
  for (const photo of photos) {
    let blob = photo?.blob || null
    if (!blob && photo?.dataUrl) {
      try {
        blob = dataUrlToBlob(photo.dataUrl)
      } catch {
        blob = null
      }
    }
    if (!blob) {
      remaining.push(photo)
      continue
    }
    const photoId = photo.id || crypto.randomUUID()
    const path = `${profile.org_id}/${jobId}/${photoId}.jpg`
    const { error: upErr } = await sb.storage.from('job-photos').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    })
    if (upErr) throw upErr

    const { error: rowErr } = await sb.from('photos').insert({
      ...(isUuid(photoId) ? { id: photoId } : {}),
      org_id: profile.org_id,
      job_id: jobId,
      storage_path: path,
      caption: photo.caption || null,
      category: photo.category || null,
      created_by: profile.id,
    })
    if (rowErr) throw rowErr

    remaining.push({
      ...stripPhotoDataUrls([photo])[0],
      id: photoId,
      storage_path: path,
    })
  }
  await putJobPhotos(jobId, remaining)
  await deleteOutbox(entry.id)
}

async function handleFirmwareUpsert(sb, entry, profile) {
  const id = entry.entityId || entry.payload?.id
  const ref = id ? await getFirmwareRef(id) : null
  if (!ref?.model) {
    await deleteOutbox(entry.id)
    return
  }

  const row = {
    org_id: profile.org_id,
    model: ref.model,
    family: ref.family || null,
    certified_version: ref.certified_version || null,
    platform: ref.platform || null,
    notes: ref.notes || null,
    eol: Boolean(ref.eol),
    support_url: ref.support_url || null,
  }
  if (isUuid(ref.id)) row.id = ref.id

  const { data, error } = await sb
    .from('firmware_refs')
    .upsert(row, { onConflict: 'org_id,model' })
    .select()
    .single()

  if (error) throw error

  if (data) {
    await writeFirmwareLocal({
      ...ref,
      id: data.id,
      org_id: data.org_id || profile.org_id,
      updated_at: data.updated_at || ref.updated_at,
      updated_by: data.updated_by ?? ref.updated_by,
      certified_version: data.certified_version ?? ref.certified_version,
      platform: data.platform ?? ref.platform,
      notes: data.notes ?? ref.notes,
      eol: data.eol ?? ref.eol,
      family: data.family ?? ref.family,
      support_url: data.support_url ?? ref.support_url,
    })
  }
  await deleteOutbox(entry.id)
}

async function processOutboxEntry(sb, entry, profile) {
  switch (entry.type) {
    case 'job.create':
      return handleJobCreate(sb, entry, profile)
    case 'job.section':
      return handleJobSection(sb, entry)
    case 'job.meta':
      return handleJobMeta(sb, entry)
    case 'job.softDelete':
      return handleJobSoftDelete(sb, entry)
    case 'account.create':
      return handleAccountCreate(sb, entry, profile)
    case 'account.update':
      return handleAccountUpdate(sb, entry)
    case 'account.softDelete':
      return handleAccountSoftDelete(sb, entry)
    case 'photo.upload':
      return handlePhotoUpload(sb, entry, profile)
    case 'firmware.upsert':
      return handleFirmwareUpsert(sb, entry, profile)
    default:
      console.warn('Unknown outbox type', entry.type)
      await deleteOutbox(entry.id)
  }
}

export async function pushOutbox() {
  if (!isSupabaseConfigured || !navigator.onLine) {
    await refreshStatus()
    return
  }
  if (_pushInFlight) return
  _pushInFlight = true
  await refreshStatus({ state: 'syncing' })

  try {
    const sb = getSupabase()
    if (!sb) return
    const session = await getSession()
    if (!session) {
      await refreshStatus()
      return
    }
    const profile = await resolveProfile()
    if (!profile?.org_id) {
      await refreshStatus()
      return
    }

    const entries = (await listOutbox())
      .filter(e => e.status === 'pending')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

    for (const entry of entries) {
      try {
        await processOutboxEntry(sb, entry, profile)
      } catch (err) {
        console.error('Outbox push failed', entry.type, err)
        await updateOutbox(entry.id, {
          status: 'pending',
          lastError: errMessage(err),
        })
        // Stop FIFO drain on hard failure so order is preserved
        break
      }
    }
  } finally {
    _pushInFlight = false
    await refreshStatus()
  }
}

export async function pullRemote() {
  if (!isSupabaseConfigured || !navigator.onLine) {
    await refreshStatus()
    return
  }
  if (_pullInFlight) return
  _pullInFlight = true
  await refreshStatus({ state: 'syncing' })

  try {
    const sb = getSupabase()
    if (!sb) return
    const session = await getSession()
    if (!session) {
      await refreshStatus()
      return
    }
    const profile = await resolveProfile()
    if (!profile?.org_id) {
      await refreshStatus()
      return
    }

    const lastSyncAt = await getMeta(LAST_SYNC_KEY)
    const pullStarted = new Date().toISOString()

    let jobsQuery = sb.from('jobs').select('*').eq('org_id', profile.org_id)
    let accountsQuery = sb.from('accounts').select('*').eq('org_id', profile.org_id)
    let photosQuery = sb.from('photos').select('id, org_id, job_id, storage_path, caption, category, created_at, created_by').eq('org_id', profile.org_id)
    let firmwareQuery = sb.from('firmware_refs').select('*').eq('org_id', profile.org_id)

    if (lastSyncAt) {
      jobsQuery = jobsQuery.gt('updated_at', lastSyncAt)
      accountsQuery = accountsQuery.gt('updated_at', lastSyncAt)
      photosQuery = photosQuery.gt('created_at', lastSyncAt)
      firmwareQuery = firmwareQuery.gt('updated_at', lastSyncAt)
    }

    const [jobsRes, accountsRes, photosRes, firmwareRes] = await Promise.all([
      jobsQuery,
      accountsQuery,
      photosQuery,
      firmwareQuery,
    ])

    if (jobsRes.error) throw jobsRes.error
    if (accountsRes.error) throw accountsRes.error
    if (photosRes.error) throw photosRes.error
    // Firmware table may not exist until migration 0002 runs — don't fail the whole pull
    if (firmwareRes.error) {
      console.warn('Firmware pull skipped', firmwareRes.error)
    }

    const changedJobIds = []
    const changedAccountIds = []
    const changedFirmwareIds = []

    for (const row of jobsRes.data || []) {
      if (await upsertRemoteJob(row)) changedJobIds.push(row.id)
    }
    for (const row of accountsRes.data || []) {
      if (await upsertRemoteAccount(row)) changedAccountIds.push(row.id)
    }

    // Merge photo metadata into local bundles (do not overwrite pending uploads)
    const photoJobIds = new Set()
    for (const row of photosRes.data || []) {
      if (!row.job_id) continue
      const pending = await pendingOutboxFor(row.job_id)
      if (pending.some(e => e.type === 'photo.upload')) continue
      const local = await getJobPhotos(row.job_id)
      const exists = local.some(p => p.id === row.id || p.storage_path === row.storage_path)
      if (exists) continue
      await putJobPhotos(row.job_id, [
        ...local,
        {
          id: row.id,
          name: '',
          caption: row.caption || '',
          category: row.category || 'Other',
          storage_path: row.storage_path,
        },
      ])
      photoJobIds.add(row.job_id)
    }

    for (const id of photoJobIds) {
      if (!changedJobIds.includes(id)) changedJobIds.push(id)
    }

    if (!firmwareRes.error) {
      const outbox = await listOutbox()
      const pendingFwModels = new Set(
        outbox
          .filter(e => e.type === 'firmware.upsert' && e.status === 'pending')
          .map(e => String(e.payload?.model || '').toUpperCase())
          .filter(Boolean),
      )
      for (const row of firmwareRes.data || []) {
        const pending = await pendingOutboxFor(row.id)
        if (pending.some(e => e.type === 'firmware.upsert')) continue
        if (pendingFwModels.has(String(row.model || '').toUpperCase())) continue
        if (await upsertRemoteFirmware(row)) changedFirmwareIds.push(row.id)
      }
    }

    if (changedJobIds.length) {
      emitDataChanged({ kind: 'job', ids: changedJobIds })
    }
    if (changedAccountIds.length) {
      emitDataChanged({ kind: 'account', ids: changedAccountIds })
    }
    if (changedFirmwareIds.length) {
      emitDataChanged({ kind: 'firmware', ids: changedFirmwareIds })
    }

    await setMeta(LAST_SYNC_KEY, pullStarted)
    ensureRealtime(profile.org_id)
  } catch (err) {
    console.error('Pull failed', err)
  } finally {
    _pullInFlight = false
    await refreshStatus()
  }
}

function teardownRealtime() {
  if (_realtimeChannel) {
    const sb = getSupabase()
    if (sb) sb.removeChannel(_realtimeChannel)
    _realtimeChannel = null
    _orgIdFilter = null
  }
}

function ensureRealtime(orgId) {
  if (!orgId || !isSupabaseConfigured) return
  if (_realtimeChannel && _orgIdFilter === orgId) return

  teardownRealtime()
  const sb = getSupabase()
  if (!sb) return

  _orgIdFilter = orgId
  _realtimeChannel = sb
    .channel(`clearline-sync:${orgId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` },
      () => { pullRemote().catch((err) => console.error(err)) },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts', filter: `org_id=eq.${orgId}` },
      () => { pullRemote().catch((err) => console.error(err)) },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'firmware_refs', filter: `org_id=eq.${orgId}` },
      () => { pullRemote().catch((err) => console.error(err)) },
    )
    .subscribe()
}

function onOnline() {
  pushOutbox()
    .then(() => pullRemote())
    .catch((err) => console.error(err))
}

function onOffline() {
  refreshStatus({ state: 'offline' }).catch(() => {})
}

/**
 * Start the sync engine once (safe no-op when Supabase is not configured).
 */
export function startSyncEngine() {
  if (_started) return
  _started = true

  if (!isSupabaseConfigured) {
    refreshStatus({ state: 'synced', pendingCount: 0, conflictCount: 0 }).catch(() => {})
    return
  }

  onRepoWrite(() => {
    refreshStatus().catch(() => {})
    schedulePush()
  })

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  _pushIntervalId = setInterval(() => {
    pushOutbox().catch((err) => console.error(err))
  }, PUSH_INTERVAL_MS)

  _pullIntervalId = setInterval(() => {
    pullRemote().catch((err) => console.error(err))
  }, PULL_INTERVAL_MS)

  refreshStatus().then(async () => {
    const profile = await resolveProfile()
    if (profile?.org_id) ensureRealtime(profile.org_id)
    if (navigator.onLine) {
      await pushOutbox()
      await pullRemote()
    } else {
      await refreshStatus({ state: 'offline' })
    }
  }).catch((err) => console.error(err))
}

/** Test/teardown helper */
export function stopSyncEngine() {
  if (_pushTimer) clearTimeout(_pushTimer)
  if (_pushIntervalId) clearInterval(_pushIntervalId)
  if (_pullIntervalId) clearInterval(_pullIntervalId)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  teardownRealtime()
  _started = false
  _pushIntervalId = null
  _pullIntervalId = null
}
