/**
 * IndexedDB photo blobs — keeps large data URLs out of localStorage.
 */

const DB_NAME = 'clearline-photos'
const DB_VERSION = 1
const STORE = 'job-photos'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'jobId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

export async function putJobPhotos(jobId, photos) {
  if (!jobId) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({
      jobId,
      photos: Array.isArray(photos) ? photos : [],
      updatedAt: new Date().toISOString(),
    })
    tx.oncomplete = () => {
      db.close()
      resolve(true)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Photo save failed'))
    }
  })
}

export async function getJobPhotos(jobId) {
  if (!jobId) return []
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(jobId)
    req.onsuccess = () => {
      db.close()
      const row = req.result
      resolve(Array.isArray(row?.photos) ? row.photos : [])
    }
    req.onerror = () => {
      db.close()
      reject(req.error || new Error('Photo load failed'))
    }
  })
}

export async function deleteJobPhotos(jobId) {
  if (!jobId) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(jobId)
    tx.oncomplete = () => {
      db.close()
      resolve(true)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Photo delete failed'))
    }
  })
}

export async function clearAllJobPhotos() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => {
      db.close()
      resolve(true)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Photo clear failed'))
    }
  })
}

export function stripPhotoDataUrls(photos) {
  return (photos || []).map(p => ({
    id: p.id,
    name: p.name || '',
    caption: p.caption || '',
    category: p.category || 'Other',
  }))
}

export function photosHaveDataUrls(photos) {
  return (photos || []).some(p => Boolean(p?.dataUrl))
}
