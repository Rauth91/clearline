import { useEffect, useState } from 'react'
import { getFirstConflictedJobId, subscribeSyncStatus } from '../lib/sync.js'

const LABELS = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  conflicts: 'Conflicts',
}

function SyncIcon({ state }) {
  if (state === 'syncing') {
    return (
      <svg className="sync-chip-icon is-spin" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.5a6.5 6.5 0 0 1 6.3 4.8h-1.55A5 5 0 1 0 8 13a5 5 0 0 0 4.6-3h1.62A6.5 6.5 0 1 1 8 1.5Zm4.75 4.25-.75 2.5-2.5-.75 3.25-1.75Z"
        />
      </svg>
    )
  }
  if (state === 'offline') {
    return (
      <svg className="sync-chip-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2.2 2.2 13.8 13.8l-.9.9L11.3 13A6.5 6.5 0 0 1 2.4 9.1l1.4-.4A5 5 0 0 0 10 11.7l-1.2-1.2A3.5 3.5 0 0 1 4.4 8.2l1.4-.5A2 2 0 0 0 7.4 9l-5.9-5.9.7-.9Zm5.1 1.4A6.5 6.5 0 0 1 13.6 9l-1.4.3A5 5 0 0 0 8 4.5c-.3 0-.6 0-.9.1l-1.1-1.1c.4-.1.9-.2 1.3-.2Zm0 4c.3-.1.5-.1.8-.1a2 2 0 0 1 1.8 1.1L8.7 7.6 7.3 6.2Z"
        />
      </svg>
    )
  }
  if (state === 'conflicts') {
    return (
      <svg className="sync-chip-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.2 14.8 14H1.2L8 1.2Zm0 3.3L3.6 12.5h8.8L8 4.5ZM7.25 7v3h1.5V7h-1.5Zm0 4v1.5h1.5V11h-1.5Z"
        />
      </svg>
    )
  }
  return (
    <svg className="sync-chip-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.4 11.4 3.2 8.2l1.1-1.1 2.1 2.1 5.3-5.3 1.1 1.1-6.4 6.4Z"
      />
    </svg>
  )
}

export default function SyncChip({ onOpenConflict }) {
  const [status, setStatus] = useState({ state: 'synced', pendingCount: 0, conflictCount: 0 })

  useEffect(() => subscribeSyncStatus(setStatus), [])

  const clickable = status.state === 'conflicts'
  const label = LABELS[status.state] || status.state
  const detail = status.state === 'conflicts' && status.conflictCount > 0
    ? ` · ${status.conflictCount}`
    : status.state === 'syncing' && status.pendingCount > 0
      ? ` · ${status.pendingCount}`
      : ''

  function handleClick() {
    if (!clickable) return
    const id = getFirstConflictedJobId()
    if (id) onOpenConflict?.(id)
  }

  return (
    <button
      type="button"
      className={`sync-chip sync-chip-${status.state}${clickable ? ' is-clickable' : ''}`}
      onClick={handleClick}
      disabled={!clickable}
      title={clickable ? 'Open first conflicted job' : label}
      aria-label={`Sync status: ${label}${detail}`}
    >
      <SyncIcon state={status.state} />
      <span>{label}{detail}</span>
    </button>
  )
}
