/**
 * Account library — living call-flow docs per customer (support reference).
 * Local-first like jobs; Halo-ready fields for later KB sync.
 * Supports multiple named call routes (AA / DID sets) per account.
 */

import {
  callFlowSummary,
  createEmptyRoute,
  mergeCallFlowPayload,
  normalizeAccountRoutes,
  routeHasContent,
} from './callFlowShape.js'
import { checkStoragePressure, emitSaveStatus } from './jobModel.js'
import { makeId } from './surveyModel.js'

const INDEX_KEY = 'voip-ops-accounts-index'
const ACTIVE_KEY = 'voip-ops-active-account'

export { callFlowSummary }

function accountKey(accountId) {
  return `voip-ops-account-${accountId}`
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    emitSaveStatus({
      type: 'error',
      message: 'Could not save account — browser storage is full. Export accounts or delete old jobs/accounts.',
      error: err,
    })
    return false
  }
}

let lastPressureCheckAt = 0
function warnIfStoragePressure() {
  const now = Date.now()
  if (now - lastPressureCheckAt < 15000) return
  lastPressureCheckAt = now
  const pressure = checkStoragePressure()
  if (pressure) {
    emitSaveStatus({
      ...pressure,
      message: `Browser storage is getting full (~${Math.round(pressure.usedBytes / (1024 * 1024))} MB). Export accounts/jobs and delete finished records.`,
    })
  }
}

function createEmptyAccount(patch = {}) {
  const now = new Date().toISOString()
  const routes = normalizeAccountRoutes(patch)
  // Keep legacy `flow` as mirror of first route for older exports / tooling
  const flow = mergeCallFlowPayload(routes[0] || createEmptyRoute())
  return {
    id: patch.id || makeId(),
    name: patch.name || '',
    site: patch.site || '',
    mainDid: patch.mainDid || '',
    accountNumber: patch.accountNumber || '',
    haloClientId: patch.haloClientId || '',
    haloKbArticleId: patch.haloKbArticleId || '',
    exceptions: patch.exceptions || '',
    updatedBy: patch.updatedBy || '',
    createdAt: patch.createdAt || now,
    updatedAt: patch.updatedAt || now,
    routes,
    flow,
  }
}

function toIndexMeta(account) {
  return {
    id: account.id,
    name: account.name || '',
    site: account.site || '',
    mainDid: account.mainDid || '',
    accountNumber: account.accountNumber || '',
    haloClientId: account.haloClientId || '',
    routeCount: Array.isArray(account.routes) ? account.routes.length : 1,
    updatedAt: account.updatedAt || '',
    createdAt: account.createdAt || '',
  }
}

function upsertIndex(meta) {
  const jobs = listAllAccountsMeta()
  const idx = jobs.findIndex(a => a.id === meta.id)
  const next = { ...meta, updatedAt: new Date().toISOString() }
  if (idx >= 0) jobs[idx] = { ...jobs[idx], ...next }
  else jobs.unshift(next)
  writeJson(INDEX_KEY, jobs)
  return next
}

function listAllAccountsMeta() {
  const list = readJson(INDEX_KEY, [])
  return Array.isArray(list) ? list : []
}

function syncPrimaryDid(account) {
  const routes = account.routes || []
  for (const route of routes) {
    const first = (route.mainNumbers || []).find(n => String(n.number || '').trim())
    if (first?.number) {
      account.mainDid = String(first.number).trim()
      return account
    }
  }
  return account
}

export function listAccounts() {
  return listAllAccountsMeta()
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function getAccount(accountId) {
  if (!accountId) return null
  const raw = readJson(accountKey(accountId), null)
  if (!raw) {
    const meta = listAllAccountsMeta().find(a => a.id === accountId)
    if (!meta) return null
    return createEmptyAccount(meta)
  }
  return createEmptyAccount(raw)
}

export function getActiveAccountId() {
  const id = localStorage.getItem(ACTIVE_KEY)
  if (id && listAllAccountsMeta().some(a => a.id === id)) return id
  return null
}

export function setActiveAccountId(accountId) {
  if (accountId) localStorage.setItem(ACTIVE_KEY, accountId)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function createAccount(patch = {}) {
  const account = createEmptyAccount(patch)
  if (patch.mainDid) {
    const route = account.routes[0] || createEmptyRoute({ name: 'Main route' })
    if (!route.mainNumbers.length) {
      route.mainNumbers = [{ id: makeId(), number: patch.mainDid, label: 'Main' }]
    }
    account.routes = [route, ...account.routes.slice(1)]
    account.flow = mergeCallFlowPayload(route)
    account.mainDid = patch.mainDid
  }
  writeJson(accountKey(account.id), account)
  upsertIndex(toIndexMeta(account))
  setActiveAccountId(account.id)
  warnIfStoragePressure()
  return account
}

export function saveAccount(account) {
  if (!account?.id) throw new Error('Account id required')
  const prev = getAccount(account.id) || createEmptyAccount({ id: account.id })
  const routes = normalizeAccountRoutes({
    ...account,
    routes: account.routes?.length ? account.routes : prev.routes,
    flow: account.flow || prev.flow,
  })
  let next = createEmptyAccount({
    ...prev,
    ...account,
    routes,
    flow: mergeCallFlowPayload(routes[0]),
    updatedAt: new Date().toISOString(),
  })
  next = syncPrimaryDid(next)

  const ok = writeJson(accountKey(next.id), next)
  if (ok) {
    upsertIndex(toIndexMeta(next))
    warnIfStoragePressure()
  }
  return next
}

export function deleteAccount(accountId) {
  if (!accountId) return
  localStorage.removeItem(accountKey(accountId))
  writeJson(INDEX_KEY, listAllAccountsMeta().filter(a => a.id !== accountId))
  if (getActiveAccountId() === accountId) setActiveAccountId(null)
}

export function clearAllAccountData() {
  listAllAccountsMeta().forEach(a => {
    localStorage.removeItem(accountKey(a.id))
  })
  writeJson(INDEX_KEY, [])
  setActiveAccountId(null)
}

function downloadPayload(payload, filenameBase) {
  const name = (filenameBase || 'account')
    .replace(/\W+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'account'
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-callflow-${new Date().toISOString().slice(0, 10)}.clearline-account`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAccountFile(accountId) {
  const account = getAccount(accountId)
  if (!account) throw new Error('Account not found')
  const payload = {
    format: 'clearline-account',
    version: 2,
    exportedAt: new Date().toISOString(),
    account,
  }
  downloadPayload(payload, account.name || account.site || 'account')
}

export function exportAllAccounts() {
  const accounts = listAccounts().map(m => getAccount(m.id)).filter(Boolean)
  const payload = {
    format: 'clearline-accounts',
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts,
  }
  downloadPayload(payload, 'clearline-accounts')
  return accounts.length
}

export async function importAccountFromFile(file) {
  const text = await file.text()
  const data = JSON.parse(text)

  if (data.format === 'clearline-accounts' && Array.isArray(data.accounts)) {
    const imported = []
    for (const raw of data.accounts) {
      imported.push(importOneAccount(raw))
    }
    return imported[imported.length - 1] || null
  }

  if (data.format === 'clearline-account' && data.account) {
    return importOneAccount(data.account)
  }

  if (data.name || data.flow || data.routes) {
    return importOneAccount(data)
  }

  throw new Error('Unrecognized account file')
}

function importOneAccount(raw) {
  const account = createEmptyAccount({
    ...raw,
    id: makeId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  writeJson(accountKey(account.id), account)
  upsertIndex(toIndexMeta(account))
  setActiveAccountId(account.id)
  warnIfStoragePressure()
  return account
}

export function searchAccounts(query) {
  const q = String(query || '').trim().toLowerCase()
  const all = listAccounts()
  if (!q) return all
  return all.filter(a => {
    const full = getAccount(a.id)
    const routeHay = (full?.routes || [])
      .flatMap(r => [
        r.name,
        ...(r.mainNumbers || []).map(n => `${n.number || ''} ${n.label || ''}`),
      ])
      .join(' ')
    const hay = [a.name, a.site, a.mainDid, a.accountNumber, a.haloClientId, routeHay]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function accountHasFlowContent(accountId) {
  const account = getAccount(accountId)
  if (!account) return false
  return (account.routes || []).some(routeHasContent)
}

export function accountRouteCount(accountId) {
  const account = getAccount(accountId)
  return account?.routes?.length || 0
}
