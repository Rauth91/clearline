import { useEffect, useRef, useState } from 'react'
import { makeId } from '../lib/surveyModel.js'
import { checkStoragePressure, emitSaveStatus } from '../lib/jobModel.js'
import {
  dataUrlToBlob,
  getJobPhotos,
  photoMetaOnly,
  putJobPhotos,
  stripPhotoDataUrls,
} from '../lib/photoStore.js'
import Dropzone from './Dropzone.jsx'
import { useCrumpleDelete } from './CrumpleDelete.jsx'

const MAX_EDGE = 1280
const MAX_PHOTOS = 12
const PHOTO_CATEGORIES = ['MDF', 'IDF', 'Rack', 'WAN handoff', 'Firewall', 'Switch', 'AP', 'Phone desk', 'Other']

/**
 * Photos UI — survey state holds metadata only; blobs live in IndexedDB.
 * Display uses object URLs created once per photo id (revoked on unmount/removal).
 */
export default function SurveyPhotos({ jobId, photos, onChange }) {
  const [objectUrls, setObjectUrls] = useState({})
  const urlsRef = useRef({})
  const cardRefs = useRef(new Map())
  const { crumple, bin } = useCrumpleDelete()
  const pressureChecked = useRef(false)

  const photoIdsKey = (photos || []).map(p => p.id).join('|')

  useEffect(() => {
    let cancelled = false
    const created = []

    async function loadUrls() {
      const next = {}
      const stored = jobId ? await getJobPhotos(jobId) : []
      if (cancelled) return
      const byId = new Map(stored.map(p => [p.id, p]))
      const metas = photos || []

      for (const meta of metas) {
        const full = byId.get(meta.id)
        let blob = full?.blob || null
        if (!blob && full?.dataUrl) {
          try {
            blob = dataUrlToBlob(full.dataUrl)
          } catch {
            blob = null
          }
        }
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        created.push(url)
        next[meta.id] = url
      }

      if (cancelled) {
        created.forEach(u => URL.revokeObjectURL(u))
        return
      }

      Object.values(urlsRef.current).forEach(u => URL.revokeObjectURL(u))
      urlsRef.current = next
      setObjectUrls(next)
    }

    loadUrls().catch((err) => console.error(err))

    return () => {
      cancelled = true
      created.forEach(u => URL.revokeObjectURL(u))
      Object.values(urlsRef.current).forEach(u => URL.revokeObjectURL(u))
      urlsRef.current = {}
    }
  // photos read via photoIdsKey — recreate URLs only when membership changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, photoIdsKey])

  function updatePhoto(id, patch) {
    onChange((photos || []).map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function removePhoto(id) {
    if (urlsRef.current[id]) {
      URL.revokeObjectURL(urlsRef.current[id])
      delete urlsRef.current[id]
      setObjectUrls(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
    if (jobId) {
      const existing = await getJobPhotos(jobId)
      await putJobPhotos(jobId, existing.filter(p => p.id !== id))
    }
    onChange((photos || []).filter(p => p.id !== id))
  }

  return (
    <div className="survey-photo-wrap">
      {bin}
      <Dropzone
        key={photoIdsKey}
        title="Site photos"
        subtitle={`Up to ${MAX_PHOTOS} photos · MDF, IDF, rack, handoff`}
        accept="image/*"
        maxFiles={Math.max(0, MAX_PHOTOS - (photos?.length || 0))}
        onUpload={async (file, { onProgress }) => {
          if (!pressureChecked.current) {
            pressureChecked.current = true
            const pressure = checkStoragePressure()
            if (pressure) {
              emitSaveStatus({
                type: 'warn',
                message: `${pressure.message} Adding more photos may fail to save.`,
              })
            }
          }
          onProgress(0.15)
          const blob = await resizeImageToBlob(file)
          onProgress(0.7)
          const id = makeId()
          const meta = photoMetaOnly({ id, name: file.name, caption: '', category: 'Other' })
          if (jobId) {
            const existing = await getJobPhotos(jobId)
            await putJobPhotos(jobId, [...existing.filter(p => p.id !== id), { ...meta, blob }])
          }
          onProgress(1)
          return meta
        }}
        onComplete={rows => {
          const added = rows.filter(r => r.status === 'done').map(r => r.value)
          if (added.length) onChange(stripPhotoDataUrls([...(photos || []), ...added]))
        }}
      />

      <div className="photo-grid">
        {(photos || []).map(photo => (
          <figure
            key={photo.id}
            className="photo-card"
            ref={el => {
              if (el) cardRefs.current.set(photo.id, el)
              else cardRefs.current.delete(photo.id)
            }}
          >
            {objectUrls[photo.id] ? (
              <img src={objectUrls[photo.id]} alt={photo.caption || photo.name} />
            ) : (
              <div className="photo-card-placeholder" aria-hidden="true" />
            )}
            <select
              value={photo.category || 'Other'}
              onChange={e => updatePhoto(photo.id, { category: e.target.value })}
            >
              {PHOTO_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <input
              value={photo.caption}
              onChange={e => updatePhoto(photo.id, { caption: e.target.value })}
              placeholder="Caption"
            />
            <button
              type="button"
              onClick={() => crumple(cardRefs.current.get(photo.id), () => removePhoto(photo.id))}
            >
              Remove
            </button>
          </figure>
        ))}
      </div>
    </div>
  )
}

function resizeImageToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Could not encode photo'))
        },
        'image/jpeg',
        0.78,
      )
    }
    img.onerror = reject
    img.src = url
  })
}
