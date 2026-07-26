/**
 * IndexedDB photo blobs — clearline photos store (bundle per job).
 * React survey state keeps metadata only; blobs stay in IDB.
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

/** Metadata only — never put dataUrl/blob into React survey state. */
export function photoMetaOnly(p) {
  if (!p) return null
  const meta = {
    id: p.id,
    name: p.name || '',
    caption: p.caption || '',
    category: p.category || 'Other',
  }
  if (p.storage_path) meta.storage_path = p.storage_path
  return meta
}

export function stripPhotoDataUrls(photos) {
  return (photos || []).map(p => photoMetaOnly(p)).filter(Boolean)
}

export function photosHaveDataUrls(photos) {
  return (photos || []).some(p => Boolean(p?.dataUrl))
}

export function photosHavePayload(photos) {
  return (photos || []).some(p => Boolean(p?.dataUrl || p?.blob))
}

export function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',')
  const header = parts[0] || ''
  const b64 = parts[1] || ''
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(new Error('No blob'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Ensure each photo has a dataUrl for .clearline / PDF / HTML export.
 */
export async function hydratePhotosWithDataUrls(photos) {
  const list = photos || []
  return Promise.all(list.map(async (p) => {
    const meta = photoMetaOnly(p)
    if (!meta) return null
    if (p.dataUrl) return { ...meta, dataUrl: p.dataUrl }
    if (p.blob) {
      try {
        const dataUrl = await blobToDataUrl(p.blob)
        return { ...meta, dataUrl }
      } catch {
        return meta
      }
    }
    return meta
  })).then(rows => rows.filter(Boolean))
}

/**
 * Merge IDB photo payloads with survey metadata, then hydrate base64 for export.
 */
export async function hydrateSurveyPhotosForExport(jobId, survey) {
  const stored = jobId ? await getJobPhotos(jobId) : []
  const byId = new Map(stored.map(p => [p.id, p]))
  const metas = (survey?.photos?.length
    ? survey.photos
    : stored.map(photoMetaOnly)
  ).filter(Boolean)

  const merged = metas.map((m) => {
    const full = byId.get(m.id)
    if (!full) return m
    return {
      ...full,
      ...photoMetaOnly(m),
      blob: full.blob,
      dataUrl: full.dataUrl,
    }
  })

  const photos = await hydratePhotosWithDataUrls(merged)
  return { ...(survey || {}), photos }
}
