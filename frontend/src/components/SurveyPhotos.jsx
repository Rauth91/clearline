import { makeId } from '../lib/surveyModel.js'
import { checkStoragePressure, emitSaveStatus } from '../lib/jobModel.js'

const MAX_EDGE = 1280
const MAX_PHOTOS = 12
const PHOTO_CATEGORIES = ['MDF', 'IDF', 'Rack', 'WAN handoff', 'Firewall', 'Switch', 'AP', 'Phone desk', 'Other']

export default function SurveyPhotos({ photos, onChange }) {
  async function handleFiles(files) {
    const pressure = checkStoragePressure()
    if (pressure) {
      emitSaveStatus({
        type: 'warn',
        message: `${pressure.message} Adding more photos may fail to save.`,
      })
    }
    const next = [...photos]
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith('image/') || next.length >= MAX_PHOTOS) continue
      const dataUrl = await resizeImage(file)
      next.push({
        id: makeId(),
        name: file.name,
        caption: '',
        category: 'Other',
        dataUrl,
      })
    }
    onChange(next)
  }

  function updatePhoto(id, patch) {
    onChange(photos.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function removePhoto(id) {
    onChange(photos.filter(p => p.id !== id))
  }

  return (
    <div className="survey-photo-wrap">
      <label className="photo-drop">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={e => handleFiles(e.target.files)}
        />
        <span>Upload site photos</span>
        <small>Recommended: MDF, rack, WAN handoff, firewall, switch, AP, phone desk. Max {MAX_PHOTOS}.</small>
      </label>

      <div className="photo-grid">
        {photos.map(photo => (
          <figure key={photo.id} className="photo-card">
            <img src={photo.dataUrl} alt={photo.caption || photo.name} />
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
            <button type="button" onClick={() => removePhoto(photo.id)}>
              Remove
            </button>
          </figure>
        ))}
      </div>
    </div>
  )
}

function resizeImage(file) {
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
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.onerror = reject
    img.src = url
  })
}
