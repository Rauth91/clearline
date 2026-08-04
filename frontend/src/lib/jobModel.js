/**
 * Job library helpers + re-exports of the local-first repo data API.
 */

import { createEmptySurvey, makeId } from './surveyModel.js'
import {
  checkStoragePressure,
  emitSaveStatus,
  getLocalStorageBytes,
  subscribeSaveStatus,
} from './saveStatus.js'
import {
  clearAllJobData,
  jobCompletion,
  loadJobDesign,
  loadJobSurvey,
} from './repo.js'

export {
  emitSaveStatus,
  subscribeSaveStatus,
  getLocalStorageBytes,
  checkStoragePressure,
}

export {
  ensureRepoReady,
  isRepoReady,
  onRepoWrite,
  listJobs,
  listAllJobs,
  listJobsForAccount,
  getActiveJobId,
  setActiveJobId,
  getJob,
  getJobRecord,
  createJob,
  openJob,
  duplicateJob,
  archiveJob,
  deleteJob,
  clearAllJobData,
  touchJobMeta,
  syncJobMetaFromSurvey,
  loadJobSurvey,
  loadJobSurveyAsync,
  saveJobSurvey,
  loadJobDesign,
  saveJobDesign,
  loadJobGoLive,
  saveJobGoLive,
  loadJobMigration,
  saveJobMigration,
  getPort,
  savePort,
  emptyPort,
  migrateJobsToAccounts,
  jobCompletion,
  exportJobFile,
  exportJobFileAsync,
  buildJobFileBlobAsync,
  exportAllJobs,
  importJobFile,
  importJobFromFile,
  migrateLegacyDrafts,
  listJobConflicts,
  resolveConflict,
  upsertRemoteJob,
  upsertRemoteAccount,
  pendingOutboxFor,
} from './repo.js'

export {
  surveyCompleteness,
  designCompleteness,
  goLiveCompleteness,
  jobNextActions,
  focChipStatus,
  describeDay,
  pickTopBlocker,
  pickHomeUrgent,
  greetingForHour,
} from './jobHealth.js'

export { computeVerdict } from './networkReadiness.js'

/**
 * Derives the current phase of a job from its data.
 * 'survey' → 'design' → 'install' → 'complete'
 */
export function computeJobStatus(jobId) {
  try {
    const c = jobCompletion(jobId)
    if (c.golive) return 'complete'
    if (c.design) return 'install'
    if (c.survey) return 'design'
    return 'survey'
  } catch {
    return 'survey'
  }
}

/** Canonical hash path for opening a job (migration vs install). */
export function jobWorkspacePath(job) {
  if (!job?.id) return '/accounts'
  return job.jobType === 'migration' ? `/job/${job.id}/migration` : `/job/${job.id}`
}

const STORAGE_VERSION_KEY = 'voip-ops-storage-version'
const STORAGE_UPGRADE_PENDING_KEY = 'voip-ops-storage-upgrade-pending'
/** Bump when a wipe/migration is intentionally required. Never auto-wipe without a prompt. */
const STORAGE_VERSION = '3'

const INDEX_KEY = 'voip-ops-jobs-index'
const LEGACY_SURVEY = 'voip-ops-survey-draft'
const LEGACY_DESIGN = 'voip-ops-system-design'

export function jobKey(jobId, kind) {
  return `voip-ops-job-${jobId}-${kind}`
}

function hasAnyJobData() {
  try {
    const jobs = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]')
    if (Array.isArray(jobs) && jobs.length > 0) return true
  } catch { /* ignore */ }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('voip-ops-job-') || key === LEGACY_SURVEY || key === LEGACY_DESIGN)) {
        return true
      }
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Fingerprint of Survey fields that Design / Provision depend on.
 */
export function surveySyncFingerprint(survey) {
  if (!survey) return ''
  const payload = {
    company: survey.customer?.company || '',
    site: survey.customer?.siteName || '',
    tech: survey.techName || '',
    phoneCount: survey.phoneCount || '',
    numbers: (survey.mainNumbers || []).map(n => ({
      label: n.label || '',
      number: n.number || '',
      notes: n.notes || '',
    })),
    users: (survey.users || []).map(u => ({
      name: u.name || '',
      username: u.username || '',
      email: u.email || '',
      extension: u.extension || '',
      phone: u.phone || '',
      location: u.location || '',
      role: u.role || '',
    })),
  }
  return JSON.stringify(payload)
}

export function isDesignOutOfDate(jobId) {
  const design = loadJobDesign(jobId)
  if (!design) return false
  const fp = design.surveyImport?.fingerprint
  if (!fp) return false
  const survey = loadJobSurvey(jobId) || createEmptySurvey()
  return surveySyncFingerprint(survey) !== fp
}

export function applySurveyToDesign(design, survey) {
  const customer = survey?.customer || {}
  const mainNumbers = (survey?.mainNumbers || [])
    .filter(n => n.number || n.label)
    .map(n => ({
      id: n.id || makeId(),
      label: n.label || 'Main line',
      number: n.number || '',
      notes: n.notes || '',
    }))
  const users = (survey?.users || [])
    .filter(u => u.name || u.extension || u.phone)
    .map(u => ({
      id: u.id || makeId(),
      name: u.name || '',
      username: u.username || '',
      email: u.email || '',
      extension: u.extension || '',
      did: u.phone || '',
      location: u.location || '',
      role: u.role || 'User',
      voicemail: 'Yes',
    }))

  const prev = design || {}
  return {
    ...prev,
    project: {
      ...(prev.project || {}),
      customer: customer.company || prev.project?.customer || '',
      site: customer.siteName || prev.project?.site || '',
      designer: survey?.techName || prev.project?.designer || '',
      summary: prev.project?.summary || customer.notes || '',
    },
    numbering: {
      ...(prev.numbering || {}),
      mainNumbers: mainNumbers.map(n => `${n.label}: ${n.number}`).filter(Boolean).join('\n')
        || prev.numbering?.mainNumbers
        || '',
      didPlan: users.filter(u => u.did).map(u => `${u.name || u.extension}: ${u.did}`).join('\n')
        || prev.numbering?.didPlan
        || '',
    },
    devices: {
      ...(prev.devices || {}),
      phones: survey?.phoneCount ? `${survey.phoneCount} phones planned` : (prev.devices?.phones || ''),
    },
    mainNumbers: mainNumbers.length ? mainNumbers : (prev.mainNumbers || []),
    users: users.length ? users : (prev.users || []),
    surveyImport: {
      fingerprint: surveySyncFingerprint(survey),
      importedAt: new Date().toISOString(),
    },
  }
}

/**
 * Storage schema check — never silently wipe when jobs exist.
 * Returns status for the App upgrade prompt.
 */
export function getStorageVersionStatus() {
  try {
    const current = localStorage.getItem(STORAGE_VERSION_KEY)
    if (current === STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
      return { ok: true, version: STORAGE_VERSION }
    }
    if (!hasAnyJobData()) {
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
      localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
      return { ok: true, version: STORAGE_VERSION }
    }
    localStorage.setItem(STORAGE_UPGRADE_PENDING_KEY, '1')
    return {
      ok: false,
      needsUpgrade: true,
      from: current || 'unknown',
      to: STORAGE_VERSION,
    }
  } catch {
    return { ok: true, version: STORAGE_VERSION }
  }
}

/** Called on load — marks pending upgrade; does not wipe. */
export function ensureStorageVersion() {
  getStorageVersionStatus()
}

/** After user exports (or accepts data loss), clear and stamp the new version. */
export function completeStorageVersionUpgrade() {
  clearAllJobData()
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
    localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
  } catch {
    // ignore
  }
}

/** Keep existing data and just stamp the new version (no wipe). */
export function acknowledgeStorageVersionKeepData() {
  try {
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
    localStorage.removeItem(STORAGE_UPGRADE_PENDING_KEY)
  } catch {
    // ignore
  }
}
