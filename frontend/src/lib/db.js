/**
 * ClearLine IndexedDB — jobs, accounts, photos, outbox, meta.
 * Absorbs the former clearline-photos database.
 */

const DB_NAME = 'clearline'
const DB_VERSION = 1
const LEGACY_PHOTOS_DB = 'clearline-photos'

/** @type {IDBDatabase | null} */
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' })
        photos.createIndex('jobId', 'jobId', { unique: false })
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
        outbox.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbPromise
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'))
  })
}

export async function getDb() {
  return openDb()
}

/** @param {string} store @param {IDBTransactionMode} mode */
async function store(storeName, mode = 'readonly') {
  const db = await openDb()
  const tx = db.transaction(storeName, mode)
  return { db, tx, store: tx.objectStore(storeName) }
}

export async function idbGet(storeName, key) {
  const { store: s, tx } = await store(storeName)
  const value = await new Promise((resolve, reject) => {
    const req = s.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  return value ?? null
}

export async function idbPut(storeName, value) {
  const { store: s, tx } = await store(storeName, 'readwrite')
  await new Promise((resolve, reject) => {
    const req = s.put(value)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
}

export async function idbDelete(storeName, key) {
  const { store: s, tx } = await store(storeName, 'readwrite')
  await new Promise((resolve, reject) => {
    const req = s.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
}

export async function idbGetAll(storeName) {
  const { store: s, tx } = await store(storeName)
  const rows = await new Promise((resolve, reject) => {
    const req = s.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  return rows
}

export async function idbClear(storeName) {
  const { store: s, tx } = await store(storeName, 'readwrite')
  await new Promise((resolve, reject) => {
    const req = s.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
}

export async function getMeta(key) {
  const row = await idbGet('meta', key)
  return row ? row.value : null
}

export async function setMeta(key, value) {
  await idbPut('meta', { key, value })
}

export async function enqueueOutbox(entry) {
  const row = {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    status: entry.status || 'pending',
  }
  const { store: s, tx } = await store('outbox', 'readwrite')
  const id = await new Promise((resolve, reject) => {
    const req = s.add(row)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  return id
}

export async function listOutbox() {
  const rows = await idbGetAll('outbox')
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

export async function updateOutbox(id, patch) {
  const row = await idbGet('outbox', id)
  if (!row) return
  await idbPut('outbox', { ...row, ...patch, id })
}

export async function deleteOutbox(id) {
  await idbDelete('outbox', id)
}

export async function getPhotosForJob(jobId) {
  const db = await openDb()
  const tx = db.transaction('photos', 'readonly')
  const idx = tx.objectStore('photos').index('jobId')
  const rows = await new Promise((resolve, reject) => {
    const req = idx.getAll(jobId)
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  return rows
}

/**
 * One-time: copy blobs from legacy clearline-photos DB if present.
 */
export async function migrateLegacyPhotoDb() {
  const done = await getMeta('legacyPhotosMigrated')
  if (done) return

  await new Promise((resolve) => {
    const req = indexedDB.open(LEGACY_PHOTOS_DB)
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const legacy = req.result
      if (!legacy.objectStoreNames.contains('photos') && !legacy.objectStoreNames.contains('job-photos')) {
        legacy.close()
        resolve()
        return
      }
      const storeName = legacy.objectStoreNames.contains('job-photos') ? 'job-photos' : 'photos'
      const tx = legacy.transaction(storeName, 'readonly')
      const s = tx.objectStore(storeName)
      const getAll = s.getAll()
      getAll.onsuccess = async () => {
        const rows = getAll.result || []
        for (const row of rows) {
          // Legacy photoStore bundle: { jobId, photos: [...] }
          if (row.jobId && Array.isArray(row.photos)) {
            const existing = await idbGet('photos', row.jobId)
            if (!existing) {
              await idbPut('photos', {
                id: row.jobId,
                jobId: row.jobId,
                photos: row.photos,
                isBundle: true,
                updatedAt: row.updatedAt || new Date().toISOString(),
              })
            }
            continue
          }
          // Legacy shape varies; normalize to { id, jobId, blob, ... }
          const id = row.id || row.key || crypto.randomUUID()
          const jobId = row.jobId || row.job_id
          if (!jobId) continue
          const existing = await idbGet('photos', id)
          if (!existing) {
            await idbPut('photos', {
              id,
              jobId,
              blob: row.blob || row.data || null,
              caption: row.caption || '',
              category: row.category || '',
              storage_path: row.storage_path || null,
              created_at: row.created_at || new Date().toISOString(),
            })
          }
        }
        legacy.close()
        resolve()
      }
      getAll.onerror = () => {
        legacy.close()
        resolve()
      }
    }
  })

  await setMeta('legacyPhotosMigrated', true)
}
