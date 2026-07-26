/**
 * NetSapiens API client — routes through the /api/ns-proxy Cloudflare Function
 * to avoid CORS issues with direct browser→NS calls.
 *
 * Credentials are kept in sessionStorage only (cleared on tab close).
 * Call nsApi.setCredentials() before any fetch calls.
 */

const PROXY = '/api/ns-proxy'
const CRED_KEY = 'ns_creds'

// ─── Credentials ─────────────────────────────────────────────────────────────

/** Store credentials for this browser session. */
export function setNsCredentials({ host, domain, username, password }) {
  sessionStorage.setItem(CRED_KEY, JSON.stringify({ host, domain, username, password }))
}

/** Retrieve stored credentials, or null. */
export function getNsCredentials() {
  try {
    const raw = sessionStorage.getItem(CRED_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Clear stored credentials. */
export function clearNsCredentials() {
  sessionStorage.removeItem(CRED_KEY)
}

// ─── Low-level proxy call ─────────────────────────────────────────────────────

async function nsProxyFetch(endpoint, creds) {
  const { host, domain, username, password } = creds
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, domain, username, password, endpoint }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `Proxy error ${res.status}`)
  }
  return data
}

// ─── NS entity fetchers ───────────────────────────────────────────────────────

/** Fetch all subscribers (extensions) for the domain. */
export async function fetchSubscribers(creds) {
  const data = await nsProxyFetch('subscribers', creds)
  return normalizeList(data)
}

/** Fetch all auto attendants. */
export async function fetchAttendants(creds) {
  const data = await nsProxyFetch('attendants', creds)
  return normalizeList(data)
}

/** Fetch all hunt groups. */
export async function fetchHuntGroups(creds) {
  const data = await nsProxyFetch('huntgroups', creds)
  return normalizeList(data)
}

/** Fetch all time frames. */
export async function fetchTimeframes(creds) {
  const data = await nsProxyFetch('timeframes', creds)
  return normalizeList(data)
}

/** Fetch all route/DID assignments. */
export async function fetchRoutes(creds) {
  const data = await nsProxyFetch('routes', creds)
  return normalizeList(data)
}

/** Pull all NS data in parallel — returns { subscribers, attendants, huntGroups, timeframes, routes }. */
export async function fetchAllNsData(creds) {
  const [subscribers, attendants, huntGroups, timeframes, routes] = await Promise.all([
    fetchSubscribers(creds),
    fetchAttendants(creds),
    fetchHuntGroups(creds),
    fetchTimeframes(creds),
    fetchRoutes(creds),
  ])
  return { subscribers, attendants, huntGroups, timeframes, routes }
}

// ─── NS → callFlowShape mapper ────────────────────────────────────────────────

/**
 * Maps raw NS API data to the callFlowShape format that AccountCallFlow uses.
 *
 * Returns an array of route objects compatible with normalizeAccountRoutes().
 * Each attendant with assigned DIDs becomes its own route.
 */
export function mapNsDataToRoutes(nsData) {
  const { subscribers = [], attendants = [], huntGroups = [], timeframes = [], routes = [] } = nsData

  // Build DID → attendant lookup from routes
  const didsByAttendant = {}
  const unmappedDids = []
  for (const route of routes) {
    const did = route.orig_to_user || route.dest_to_user || route.translate_did || ''
    const dest = route.dest_to_user || ''
    // Check if destination looks like an auto-attendant
    const matchAa = attendants.find(aa => aa.auto_attendant === dest || aa.orig_to_user === dest)
    if (matchAa) {
      const aaKey = matchAa.auto_attendant || matchAa.orig_to_user
      if (!didsByAttendant[aaKey]) didsByAttendant[aaKey] = []
      if (did) didsByAttendant[aaKey].push({ number: did, label: route.description || '' })
    } else if (did) {
      unmappedDids.push({ number: did, label: route.description || '', dest })
    }
  }

  const mappedRoutes = []

  // One route per auto attendant
  for (const aa of attendants) {
    const aaKey = aa.auto_attendant || aa.orig_to_user || aa.name
    const dids = didsByAttendant[aaKey] || []

    // Map DTMF options from NS AA keys
    const menuOptions = {}
    for (let i = 0; i <= 9; i++) {
      const optKey = `key_${i}_destination` // NS uses key_N_destination
      const altKey = `dtmf_${i}`
      const val = aa[optKey] || aa[altKey] || ''
      if (val) {
        // Try to resolve extension → subscriber name
        const sub = subscribers.find(s => s.user === val || s.orig_to_user === val)
        menuOptions[`option${i}`] = sub
          ? `${sub.first_name || ''} ${sub.last_name || ''} (${val})`.trim()
          : val
      }
    }

    // Map time frame → hours
    const tf = timeframes.find(t => t.time_frame === aa.time_frame || t.name === aa.time_frame)
    const hours = tf ? parseTimeframe(tf) : {}

    // Map hunt groups referenced in options to ring group notes
    const referencedHgs = huntGroups.filter(hg =>
      Object.values(menuOptions).some(v => String(v).includes(hg.hunt_group || hg.name || ''))
    )
    const ringGroupNotes = referencedHgs.map(hg =>
      `${hg.hunt_group || hg.name}: ${(hg.subscribers || []).map(s => s.user || s).join(', ')}`
    ).join('\n')

    mappedRoutes.push({
      name: aa.description || aa.auto_attendant || aa.name || 'Auto attendant',
      mainNumbers: dids.length ? dids : [],
      hours,
      autoAttendant: {
        enabled: 'Yes',
        greeting: aa.greeting || aa.description || '',
        menuPrompt: aa.menu_prompt || '',
        ...menuOptions,
        timeoutAction: aa.timeout_destination || '',
        invalidAction: aa.invalid_destination || '',
        notes: aa.notes || '',
      },
      nightButton: {
        enabled: '',
        destination: aa.closed_destination || aa.after_hours_destination || '',
        notes: '',
      },
      voicemail: { needed: '', perUser: 'Yes', generalMailbox: '', emailNotification: '', retention: '' },
      callFlow: {
        daytimePath: '',
        afterHoursPath: aa.closed_destination || '',
        ringGroups: ringGroupNotes,
        queues: '',
        failover: '',
        notes: '',
      },
    })
  }

  // If there are unmapped DIDs (no AA), lump them into a "Direct routing" route
  if (unmappedDids.length > 0) {
    mappedRoutes.push({
      name: 'Direct routing (no AA)',
      mainNumbers: unmappedDids,
      hours: {},
      autoAttendant: { enabled: 'No' },
      nightButton: {},
      voicemail: {},
      callFlow: { daytimePath: 'Direct to extension', notes: 'DIDs routed directly, no auto attendant.' },
    })
  }

  // If nothing came back, return a placeholder
  if (!mappedRoutes.length) {
    mappedRoutes.push({
      name: 'Main route',
      mainNumbers: [],
      hours: {},
      autoAttendant: { enabled: '', notes: 'No data returned from NS API for this domain.' },
      nightButton: {},
      voicemail: {},
      callFlow: {},
    })
  }

  return mappedRoutes
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** NS returns lists as { data: [...] } or directly as an array. */
function normalizeList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.data)) return raw.data
  if (raw && typeof raw === 'object') return Object.values(raw)
  return []
}

/**
 * Parse a NS timeframe object into { weekdayOpen, weekdayClose, timezone }.
 * NS timeframe format varies by build — this handles common layouts.
 */
function parseTimeframe(tf) {
  const hours = {}
  // NS stores times in fields like open, close, or time_open, time_close
  const open = tf.open || tf.time_open || tf.weekday_open || ''
  const close = tf.close || tf.time_close || tf.weekday_close || ''
  if (open) hours.weekdayOpen = formatNsTime(open)
  if (close) hours.weekdayClose = formatNsTime(close)
  if (tf.timezone || tf.time_zone) hours.timezone = tf.timezone || tf.time_zone
  return hours
}

/** NS times are sometimes in 24h integers (900 = 9:00am) or HH:MM strings. */
function formatNsTime(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (/^\d{1,4}$/.test(s)) {
    // Integer like 900 or 1700
    const padded = s.padStart(4, '0')
    return `${padded.slice(0, 2)}:${padded.slice(2)}`
  }
  return s
}

/** Summarize what an NS pull found — for display in the sync UI. */
export function summarizeNsFetch(nsData) {
  const { subscribers, attendants, huntGroups, timeframes, routes } = nsData
  return [
    { label: 'DIDs / routes', count: routes.length },
    { label: 'Auto attendants', count: attendants.length },
    { label: 'Hunt groups', count: huntGroups.length },
    { label: 'Subscribers', count: subscribers.length },
    { label: 'Time frames', count: timeframes.length },
  ]
}
