/**
 * Firmware reference cards — local-first IDB cache + starter seed.
 */

import {
  enqueueOutbox,
  idbDelete,
  idbGetAll,
  idbPut,
} from './db.js'
import { emitSaveStatus } from './saveStatus.js'
import { makeId } from './surveyModel.js'
import { emitDataChanged } from './dataEvents.js'
import { notifySyncNeeded } from './repo.js'

const YEALINK_PRODUCTS = 'https://www.yealink.com/en/product-list/ip-phone'
const YEALINK_FIRMWARE = 'https://support.yealink.com/en/portal/firmware'

/** Client-side defaults when the org has no firmware_refs yet. */
export const FIRMWARE_STARTER_SET = [
  { model: 'T53', family: 'T5x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T53W', family: 'T5x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T54W', family: 'T5x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T57W', family: 'T5x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T58W', family: 'T5x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T46U', family: 'T4x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'T48U', family: 'T4x', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'CP965', family: 'CP', eol: false, support_url: YEALINK_PRODUCTS },
  { model: 'AX83H', family: 'AX', eol: false, support_url: YEALINK_PRODUCTS },
  {
    model: 'T52S',
    family: 'T5x',
    eol: true,
    notes: 'End of life — no further firmware/security updates from Yealink.',
    support_url: YEALINK_FIRMWARE,
  },
  {
    model: 'T54S',
    family: 'T5x',
    eol: true,
    notes: 'End of life — no further firmware/security updates from Yealink.',
    support_url: YEALINK_FIRMWARE,
  },
  {
    model: 'T56A',
    family: 'T5x',
    eol: true,
    notes: 'End of life — no further firmware/security updates from Yealink.',
    support_url: YEALINK_FIRMWARE,
  },
  {
    model: 'T58A',
    family: 'T5x',
    eol: true,
    notes: 'End of life — no further firmware/security updates from Yealink.',
    support_url: YEALINK_FIRMWARE,
  },
  {
    model: 'T58V',
    family: 'T5x',
    eol: true,
    notes: 'End of life — no further firmware/security updates from Yealink.',
    support_url: YEALINK_FIRMWARE,
  },
]

function nowIso() {
  return new Date().toISOString()
}

function normalizeRef(row) {
  return {
    id: row.id || makeId(),
    org_id: row.org_id ?? null,
    model: String(row.model || '').trim(),
    family: row.family || '',
    certified_version: row.certified_version || '',
    platform: row.platform || '',
    notes: row.notes || '',
    eol: Boolean(row.eol),
    support_url: row.support_url || YEALINK_PRODUCTS,
    updated_at: row.updated_at || row.updatedAt || nowIso(),
    updated_by: row.updated_by ?? null,
  }
}

function modelKey(model) {
  return String(model || '').trim().toUpperCase()
}

/** @type {Map<string, object>|null} */
let _cache = null

async function loadCache() {
  if (_cache) return _cache
  const rows = await idbGetAll('firmware')
  _cache = new Map()
  for (const row of rows || []) {
    const n = normalizeRef(row)
    if (n.model) _cache.set(n.id, n)
  }
  return _cache
}

function notifyFirmwareChanged(ids) {
  emitDataChanged({ kind: 'firmware', ids: ids || [] })
}

export async function listFirmwareRefs() {
  const cache = await loadCache()
  return [...cache.values()].sort((a, b) => {
    if (Boolean(a.eol) !== Boolean(b.eol)) return a.eol ? 1 : -1
    return String(a.model).localeCompare(String(b.model))
  })
}

export async function getFirmwareRef(id) {
  const cache = await loadCache()
  return cache.get(id) || null
}

/**
 * Upsert by id (or by model if matching local row). Queues firmware.upsert for sync.
 */
export async function upsertFirmwareRef(patch, { enqueue = true } = {}) {
  const cache = await loadCache()
  let existing = patch.id ? cache.get(patch.id) : null
  if (!existing && patch.model) {
    existing = [...cache.values()].find(r => modelKey(r.model) === modelKey(patch.model)) || null
  }

  const next = normalizeRef({
    ...(existing || {}),
    ...patch,
    id: existing?.id || patch.id || makeId(),
    updated_at: nowIso(),
  })
  if (!next.model) throw new Error('Model is required')

  cache.set(next.id, next)
  await idbPut('firmware', next)

  if (enqueue) {
    try {
      await enqueueOutbox({
        type: 'firmware.upsert',
        entityId: next.id,
        payload: { id: next.id, model: next.model },
        createdAt: nowIso(),
        status: 'pending',
      })
      emitSaveStatus({ type: 'ok', message: 'Firmware card saved.' })
      notifySyncNeeded()
    } catch (err) {
      console.error(err)
      emitSaveStatus({ type: 'warn', message: 'Saved on device; sync queue failed.' })
    }
  }

  notifyFirmwareChanged([next.id])
  return next
}

/** Write remote row into local cache without enqueueing outbox. */
export async function writeFirmwareLocal(row) {
  const cache = await loadCache()
  const next = normalizeRef(row)
  if (!next.id || !next.model) return null

  // Prefer remote id; drop duplicate local row with same model if ids differ
  for (const [id, local] of [...cache.entries()]) {
    if (id !== next.id && modelKey(local.model) === modelKey(next.model)) {
      cache.delete(id)
      try {
        await idbDelete('firmware', id)
      } catch (err) {
        console.error(err)
      }
    }
  }
  cache.set(next.id, next)
  await idbPut('firmware', next)
  return next
}

export async function seedFirmwareStarter() {
  const existing = await listFirmwareRefs()
  if (existing.length > 0) {
    return { added: 0, total: existing.length }
  }
  let added = 0
  for (const row of FIRMWARE_STARTER_SET) {
    await upsertFirmwareRef({
      ...row,
      certified_version: '',
      platform: '',
    })
    added += 1
  }
  return { added, total: added }
}

/** Used by sync pull — merge server rows (last-write-wins by updated_at). */
export async function upsertRemoteFirmware(row) {
  if (!row?.id) return false
  const cache = await loadCache()
  const local = cache.get(row.id)
    || [...cache.values()].find(r => modelKey(r.model) === modelKey(row.model))
  if (local) {
    const remoteTs = Date.parse(row.updated_at || '') || 0
    const localTs = Date.parse(local.updated_at || '') || 0
    // Skip if local is newer and has pending outbox — caller should check pending
    if (localTs > remoteTs) return false
  }
  await writeFirmwareLocal(row)
  return true
}

export function clearFirmwareCache() {
  _cache = null
}
