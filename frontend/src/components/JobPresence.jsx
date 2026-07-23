import { useEffect, useState } from 'react'
import { getCachedProfile } from '../lib/authModel.js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const WORKSPACE_LABELS = {
  siteSurvey: 'Site Survey',
  systemDesign: 'System Design',
  goLive: 'Go-Live',
}

/**
 * Soft presence indicator for a job workspace. Never locks editing.
 */
export default function JobPresence({ jobId, workspace }) {
  const [viewers, setViewers] = useState([])

  useEffect(() => {
    if (!jobId || !isSupabaseConfigured || !navigator.onLine) {
      setViewers([])
      return undefined
    }

    let cancelled = false
    let channel = null

    async function start() {
      const sb = getSupabase()
      if (!sb) return
      const profile = await getCachedProfile()
      if (!profile?.id || cancelled) return

      channel = sb.channel(`presence:job:${jobId}`, {
        config: { presence: { key: profile.id } },
      })

      const syncViewers = () => {
        if (cancelled) return
        const state = channel.presenceState()
        const others = []
        for (const [key, metas] of Object.entries(state)) {
          if (key === profile.id) continue
          const meta = metas?.[0]
          if (!meta) continue
          others.push({
            id: key,
            name: meta.display_name || 'Someone',
            workspace: meta.workspace || null,
          })
        }
        setViewers(others)
      }

      channel
        .on('presence', { event: 'sync' }, syncViewers)
        .on('presence', { event: 'join' }, syncViewers)
        .on('presence', { event: 'leave' }, syncViewers)
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED' || cancelled) return
          await channel.track({
            user_id: profile.id,
            display_name: profile.display_name || 'Teammate',
            workspace: workspace || null,
          })
        })
    }

    start().catch((err) => console.error(err))

    return () => {
      cancelled = true
      setViewers([])
      if (channel) {
        const sb = getSupabase()
        if (sb) sb.removeChannel(channel)
      }
    }
  }, [jobId, workspace])

  if (!viewers.length) return null

  const text = viewers.map((v) => {
    const ws = WORKSPACE_LABELS[v.workspace] || v.workspace
    return ws ? `${v.name} is viewing ${ws}` : `${v.name} is viewing this job`
  }).join(' · ')

  return (
    <div className="job-presence" role="status">
      <span className="job-presence-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}
