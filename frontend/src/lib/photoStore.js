/**
 * IndexedDB photo blobs — clearline photos store (bundle per job).
 */

import {
  idbClear,
  idbDelete,
  idbGet,
  idbPut,
  migrateLegacyPhotoDb,
} from './db.js'

let legacyMigratePromise = null

async function ensurePhotosReady() {
  if (!legacyMigratePromise) {
    legacyMigratePromise = migrateLegacyPhotoDb().catch((err) => {
      console.error(err)
      legacyMigratePromise = null
    })
  }
  await legacyMigratePromise
}

export async function putJobPhotos(jobId, photos) {
  if (!jobId) return
  await ensurePhotosReady()
  await idbPut('photos', {
    id: jobId,
    jobId,
    photos: Array.isArray(photos) ? photos : [],
    isBundle: true,
    updatedAt: new Date().toISOString(),
  })
  return true
}

export async function getJobPhotos(jobId) {
  if (!jobId) return []
  await ensurePhotosReady()
  const row = await idbGet('photos', jobId)
  return Array.isArray(row?.photos) ? row.photos : []
}

export async function deleteJobPhotos(jobId) {
  if (!jobId) return
  await ensurePhotosReady()
  await idbDelete('photos', jobId)
  return true
}

export async function clearAllJobPhotos() {
  await ensurePhotosReady()
  await idbClear('photos')
  return true
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
