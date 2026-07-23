/**
 * Auth helpers — magic-link sign-in, profile/org onboarding, session cache.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient.js'
import { getMeta, setMeta } from './db.js'

/**
 * @typedef {{ id: string, email?: string }} AuthUser
 * @typedef {{ id: string, org_id: string, display_name: string, role: 'tech'|'admin' }} Profile
 */

export function authEnabled() {
  return isSupabaseConfigured
}

export async function getSession() {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session || null
}

export async function getCachedProfile() {
  return (await getMeta('profile')) || null
}

export async function cacheSessionLocal(session, profile) {
  await setMeta('session', session ? {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: session.user ? { id: session.user.id, email: session.user.email } : null,
  } : null)
  await setMeta('profile', profile || null)
}

export async function signInWithMagicLink(email) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export async function signOut() {
  const sb = getSupabase()
  if (sb) await sb.auth.signOut()
  await cacheSessionLocal(null, null)
}

/** @returns {Promise<Profile|null>} */
export async function fetchProfile() {
  const sb = getSupabase()
  if (!sb) return null
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data, error } = await sb
    .from('profiles')
    .select('id, org_id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createOrg(name, displayName) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const { data, error } = await sb.rpc('create_org', {
    name: name.trim(),
    display_name: displayName.trim(),
  })
  if (error) throw error
  const profile = await fetchProfile()
  const session = await getSession()
  await cacheSessionLocal(session, profile)
  return { orgId: data, profile }
}

export async function acceptInvite(displayName) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const { data, error } = await sb.rpc('accept_invite', {
    display_name: displayName.trim(),
  })
  if (error) throw error
  const profile = await fetchProfile()
  const session = await getSession()
  await cacheSessionLocal(session, profile)
  return { orgId: data, profile }
}

/** @returns {Promise<{ session: any, profile: Profile|null, needsOnboarding: boolean }>} */
export async function resolveAuthState() {
  if (!authEnabled()) {
    return { session: null, profile: null, needsOnboarding: false, offlineOnly: true }
  }

  let session = await getSession()
  if (!session) {
    const cached = await getMeta('session')
    const profile = await getMeta('profile')
    if (cached?.user && profile && !navigator.onLine) {
      return { session: cached, profile, needsOnboarding: false, offlineOnly: true }
    }
    return { session: null, profile: null, needsOnboarding: false, offlineOnly: false }
  }

  let profile = null
  try {
    profile = await fetchProfile()
  } catch {
    profile = await getMeta('profile')
  }
  await cacheSessionLocal(session, profile)
  return {
    session,
    profile,
    needsOnboarding: !profile,
    offlineOnly: false,
  }
}

export async function listOrgMembers() {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('profiles')
    .select('id, display_name, role')
    .order('display_name')
  if (error) throw error
  await setMeta('orgMembers', data || [])
  return data || []
}

export async function getCachedOrgMembers() {
  return (await getMeta('orgMembers')) || []
}

export async function inviteMember(email, role = 'tech') {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const profile = await fetchProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Admin only')
  const { data, error } = await sb.from('invites').insert({
    org_id: profile.org_id,
    email: email.trim().toLowerCase(),
    role,
    created_by: profile.id,
  }).select().single()
  if (error) throw error
  return data
}

export async function updateOrgName(name) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const profile = await fetchProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Admin only')
  const { error } = await sb.from('orgs').update({ name: name.trim() }).eq('id', profile.org_id)
  if (error) throw error
}

export async function getOrg() {
  const sb = getSupabase()
  if (!sb) return null
  const profile = await fetchProfile()
  if (!profile) return null
  const { data, error } = await sb.from('orgs').select('id, name').eq('id', profile.org_id).maybeSingle()
  if (error) throw error
  if (data) await setMeta('org', data)
  return data
}

export function onAuthStateChange(callback) {
  const sb = getSupabase()
  if (!sb) return () => {}
  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
  return () => subscription.unsubscribe()
}
