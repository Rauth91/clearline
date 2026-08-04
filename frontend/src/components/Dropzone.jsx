import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DUR, prefersReducedMotion, springOpts } from '../lib/motion.js'
import '../styles/feel.css'

function uid() {
  return `dz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isImageFile(file) {
  return file?.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file?.name || '')
}

function fmtPct(p) {
  return `${Math.round(Math.max(0, Math.min(1, p || 0)) * 100)}%`
}

/**
 * Glass dropzone with FLIP fly-in from drop point, paste support, and
 * image ghost + live clip-path progress (--p).
 */
export default function Dropzone({
  title,
  subtitle,
  accept = '*/*',
  maxFiles = 6,
  maxBytes,
  onUpload,
  onComplete,
  disabled = false,
  className = '',
}) {
  const reactId = useId()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const dropPointRef = useRef(null)
  const urlsRef = useRef(new Map())
  const focusedRef = useRef(false)

  const [rows, setRows] = useState([])
  const [over, setOver] = useState(false)
  const [live, setLive] = useState('')

  const remaining = Math.max(0, maxFiles - rows.length)
  const canAccept = !disabled && remaining > 0 && typeof onUpload === 'function'
  const doneCount = rows.filter((r) => r.status === 'done').length
  const clearable = rows.some((r) => r.status === 'error' || (r.status !== 'done' && r.progress < 1))

  const revokeUrl = useCallback((id) => {
    const url = urlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
      urlsRef.current.clear()
    }
  }, [])

  const flyIn = useCallback((el, fromClient) => {
    if (!el || prefersReducedMotion() || !fromClient) return
    const rect = el.getBoundingClientRect()
    const dx = fromClient.x - (rect.left + rect.width / 2)
    const dy = fromClient.y - (rect.top + rect.height / 2)
    try {
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.35 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        springOpts(DUR.spring),
      )
    } catch {
      /* WAAPI unavailable */
    }
  }, [])

  const patchRow = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  const processFiles = useCallback(
    async (fileList, dropPoint) => {
      if (!canAccept || !fileList?.length) return

      const incoming = Array.from(fileList).slice(0, remaining)
      if (!incoming.length) return

      dropPointRef.current = dropPoint || null
      const batch = []

      for (const file of incoming) {
        if (maxBytes != null && file.size > maxBytes) {
          const id = uid()
          batch.push({
            id,
            file,
            status: 'error',
            error: `File exceeds ${(maxBytes / (1024 * 1024)).toFixed(1)} MB`,
            progress: 0,
            preview: null,
          })
          continue
        }

        const id = uid()
        let preview = null
        if (isImageFile(file)) {
          preview = URL.createObjectURL(file)
          urlsRef.current.set(id, preview)
        }
        batch.push({
          id,
          file,
          status: 'uploading',
          progress: 0,
          preview,
          value: undefined,
          error: undefined,
        })
      }

      setRows((prev) => [...prev, ...batch])
      setLive(`Uploading ${batch.length} file${batch.length === 1 ? '' : 's'}`)

      // FLIP after paint
      requestAnimationFrame(() => {
        const point = dropPointRef.current
        if (!listRef.current || !point) return
        for (const item of batch) {
          const el = listRef.current.querySelector(`[data-dz-id="${item.id}"]`)
          flyIn(el, point)
        }
      })

      const results = []
      await Promise.all(
        batch.map(async (item) => {
          if (item.status === 'error') {
            results.push(item)
            return
          }
          try {
            const value = await onUpload(item.file, {
              onProgress: (p) => {
                const next = prefersReducedMotion()
                  ? (p >= 1 ? 1 : Math.max(p, 0))
                  : Math.max(0, Math.min(1, Number(p) || 0))
                patchRow(item.id, { progress: next, status: 'uploading' })
              },
            })
            const done = {
              ...item,
              status: 'done',
              progress: 1,
              value,
              error: undefined,
            }
            patchRow(item.id, { status: 'done', progress: 1, value, error: undefined })
            results.push(done)
          } catch (err) {
            const message = err?.message || String(err) || 'Upload failed'
            const failed = { ...item, status: 'error', error: message, progress: item.progress || 0 }
            patchRow(item.id, { status: 'error', error: message })
            results.push(failed)
          }
        }),
      )

      setLive(
        `${results.filter((r) => r.status === 'done').length} of ${results.length} uploaded`,
      )
      onComplete?.(results)
    },
    [canAccept, remaining, maxBytes, onUpload, onComplete, flyIn, patchRow],
  )

  const onDragOver = (e) => {
    if (!canAccept) return
    e.preventDefault()
    e.stopPropagation()
    setOver(true)
  }

  const onDragLeave = (e) => {
    if (!rootRef.current?.contains(e.relatedTarget)) setOver(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    if (!canAccept) return
    processFiles(e.dataTransfer?.files, { x: e.clientX, y: e.clientY })
  }

  const onBrowse = (e) => {
    const files = e.target.files
    e.target.value = ''
    if (!files?.length) return
    const rect = inputRef.current?.getBoundingClientRect?.()
    const point = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null
    processFiles(files, point)
  }

  useEffect(() => {
    const onPaste = (e) => {
      if (!focusedRef.current || !canAccept) return
      const items = e.clipboardData?.files
      if (!items?.length) return
      e.preventDefault()
      const root = rootRef.current?.getBoundingClientRect()
      const point = root
        ? { x: root.left + root.width / 2, y: root.top + root.height / 2 }
        : null
      processFiles(items, point)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canAccept, processFiles])

  const clearIncomplete = () => {
    setRows((prev) => {
      const keep = []
      for (const r of prev) {
        if (r.status === 'done') {
          keep.push(r)
        } else {
          revokeUrl(r.id)
        }
      }
      return keep
    })
    setLive('Cleared incomplete uploads')
  }

  const showDrop = remaining > 0

  return (
    <div
      ref={rootRef}
      className={`dz ${className}`.trim()}
      role="region"
      aria-labelledby={title ? `${reactId}-title` : undefined}
      onFocus={() => { focusedRef.current = true }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget)) focusedRef.current = false
      }}
      tabIndex={-1}
    >
      {(title || subtitle) && (
        <div className="dz-head">
          {title && (
            <h3 className="dz-title" id={`${reactId}-title`}>
              {title}
            </h3>
          )}
          {subtitle && <p className="dz-sub">{subtitle}</p>}
        </div>
      )}

      <span className="dz-live" aria-live="polite">{live}</span>

      {showDrop && (
        <div
          className={`dz-area ${over ? 'is-over' : ''} ${!canAccept ? 'is-disabled' : ''}`}
          aria-disabled={!canAccept}
          tabIndex={canAccept ? 0 : -1}
          role="button"
          aria-label="Drop files here or browse. You can paste too."
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => canAccept && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!canAccept) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          <span className="dz-area-label">
            Drop files here or <strong>browse</strong>
            {' · '}
            you can paste too
          </span>
          <input
            ref={inputRef}
            className="dz-input"
            type="file"
            accept={accept}
            multiple={remaining > 1}
            disabled={!canAccept}
            onChange={onBrowse}
            tabIndex={-1}
            aria-hidden
          />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="dz-list" ref={listRef}>
          {rows.map((row) => {
            const img = row.preview && isImageFile(row.file)
            const ext = (row.file?.name || '').split('.').pop()?.slice(0, 4) || 'file'
            return (
              <li
                key={row.id}
                data-dz-id={row.id}
                className={`dz-row ${row.status === 'error' ? 'is-error' : ''} ${row.status === 'done' ? 'is-done' : ''}`}
                style={{ '--p': row.progress ?? 0 }}
              >
                <div className="dz-thumb" aria-hidden>
                  {img ? (
                    <>
                      <img className="dz-thumb-ghost" src={row.preview} alt="" />
                      <img className="dz-thumb-live" src={row.preview} alt="" />
                    </>
                  ) : (
                    <span className="dz-thumb-icon">{ext}</span>
                  )}
                </div>
                <div className="dz-meta">
                  <div className="dz-name" title={row.file?.name}>
                    {row.file?.name || 'Untitled'}
                  </div>
                  <div className="dz-bar" aria-hidden>
                    <i />
                  </div>
                </div>
                <div className="dz-status">
                  {row.status === 'error'
                    ? (row.error || 'Error')
                    : row.status === 'done'
                      ? 'Done'
                      : fmtPct(row.progress)}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="dz-foot">
          <span>
            {doneCount} of {maxFiles} uploaded
          </span>
          <button
            type="button"
            className="dz-clear"
            disabled={!clearable || disabled}
            onClick={clearIncomplete}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
