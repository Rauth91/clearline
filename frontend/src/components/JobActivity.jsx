import { useEffect, useState } from 'react'
import { getCachedOrgMembers } from '../lib/authModel.js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const TYPE_LABELS = {
  'section.save': 'Saved section',
  'stage.change': 'Changed stage',
  'assignment.change': 'Changed assignee',
  'job.create': 'Created job',
}

function formatWhen(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return new Date(iso).toLocaleString()
}

function describeEvent(ev, nameById) {
  const actor = nameById.get(ev.actor) || 'Someone'
  const type = TYPE_LABELS[ev.type] || ev.type
  const detail = ev.detail || {}
  if (ev.type === 'section.save' && detail.section) {
    return `${actor} saved ${detail.section}`
  }
  if (ev.type === 'stage.change') {
    return `${actor} set stage to ${detail.stage || '—'}`
  }
  if (ev.type === 'assignment.change') {
    const to = detail.assigned_to
      ? (nameById.get(detail.assigned_to) || 'teammate')
      : 'Unassigned'
    return `${actor} assigned to ${to}`
  }
  return `${actor}: ${type}`
}

export default function JobActivity({ jobId }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [names, setNames] = useState(() => new Map())

  useEffect(() => {
    if (!jobId || !open) return undefined
    let cancelled = false

    async function load() {
      const members = await getCachedOrgMembers()
      const map = new Map((members || []).map(m => [m.id, m.display_name]))
      if (!cancelled) setNames(map)

      if (!isSupabaseConfigured || !navigator.onLine) {
        if (!cancelled) setEvents([])
        return
      }
      const sb = getSupabase()
      if (!sb) {
        if (!cancelled) setEvents([])
        return
      }
      const { data, error } = await sb
        .from('job_events')
        .select('id, actor, type, detail, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) {
        console.error(error)
        if (!cancelled) setEvents([])
        return
      }
      if (!cancelled) setEvents(data || [])
    }

    load().catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [jobId, open])

  return (
    <div className="job-activity">
      <button
        type="button"
        className="job-activity-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span>Activity</span>
        <span className="job-activity-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="job-activity-body">
          {events.length === 0 ? (
            <p className="job-activity-empty">
              {isSupabaseConfigured && navigator.onLine
                ? 'No activity yet.'
                : 'Activity available when online.'}
            </p>
          ) : (
            <ul className="job-activity-list">
              {events.map(ev => (
                <li key={ev.id}>
                  <span className="job-activity-text">{describeEvent(ev, names)}</span>
                  <time className="job-activity-time">{formatWhen(ev.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
