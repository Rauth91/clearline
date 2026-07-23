/**
 * ClearLine — Field product shell
 * Jobs hub | Accounts hub + Site Survey | System Design | Go-Live
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import BrandMark from './components/BrandMark.jsx'
import JobsHub from './components/JobsHub.jsx'
import AccountsHub from './components/AccountsHub.jsx'
import {
  acknowledgeStorageVersionKeepData,
  completeStorageVersionUpgrade,
  exportAllJobs,
  exportJobFileAsync,
  getActiveJobId,
  getJob,
  getStorageVersionStatus,
  ensureStorageVersion,
  listJobs,
  migrateLegacyDrafts,
  setActiveJobId,
  subscribeSaveStatus,
} from './lib/jobModel.js'
import {
  getAccount,
  getActiveAccountId,
  setActiveAccountId,
} from './lib/accountModel.js'

const SiteSurvey = lazy(() => import('./components/SiteSurvey.jsx'))
const SystemDesign = lazy(() => import('./components/SystemDesign.jsx'))
const GoLive = lazy(() => import('./components/GoLive.jsx'))
const AccountCallFlow = lazy(() => import('./components/AccountCallFlow.jsx'))

const WORKSPACES = [
  { id: 'siteSurvey', label: 'Site Survey', description: 'Field handoff and readiness' },
  { id: 'systemDesign', label: 'System Design', description: 'Plan voice architecture' },
  { id: 'goLive', label: 'Go-Live', description: 'Cutover, install, handoff' },
]

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState('siteSurvey')
  const [hubMode, setHubMode] = useState('jobs') // jobs | accounts
  const [jobId, setJobId] = useState(() => {
    ensureStorageVersion()
    migrateLegacyDrafts()
    return getActiveJobId()
  })
  const [accountId, setAccountId] = useState(() => {
    // Prefer job if one is active; otherwise restore account
    if (getActiveJobId()) return null
    return getActiveAccountId()
  })
  const [hubTick, setHubTick] = useState(0)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('voip-ops-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })
  const [saveBanner, setSaveBanner] = useState(null)
  const [storageUpgrade, setStorageUpgrade] = useState(() => getStorageVersionStatus())

  const job = jobId ? getJob(jobId) : null
  const account = accountId ? getAccount(accountId) : null
  const showHub = !jobId && !accountId

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('voip-ops-theme', theme)
  }, [theme])

  useEffect(() => {
    return subscribeSaveStatus((detail) => {
      if (!detail || detail.type === 'ok') return
      setSaveBanner(detail)
    })
  }, [])

  useEffect(() => {
    if (!saveBanner || saveBanner.type !== 'warn') return undefined
    const t = setTimeout(() => setSaveBanner(null), 8000)
    return () => clearTimeout(t)
  }, [saveBanner])

  function handleOpenJob(id, workspace = 'siteSurvey') {
    if (!id) {
      setActiveJobId(null)
      setJobId(null)
      setHubTick(t => t + 1)
      return
    }
    setActiveAccountId(null)
    setAccountId(null)
    setActiveJobId(id)
    setJobId(id)
    setActiveWorkspace(workspace)
    setHubMode('jobs')
  }

  function handleOpenAccount(id) {
    if (!id) {
      setActiveAccountId(null)
      setAccountId(null)
      setHubTick(t => t + 1)
      return
    }
    setActiveJobId(null)
    setJobId(null)
    setActiveAccountId(id)
    setAccountId(id)
    setHubMode('accounts')
  }

  function goToHub(mode = hubMode) {
    setActiveJobId(null)
    setJobId(null)
    setActiveAccountId(null)
    setAccountId(null)
    setHubMode(mode)
    setHubTick(t => t + 1)
  }

  async function handleExportAllForUpgrade() {
    const jobs = listJobs()
    for (const j of jobs) {
      try {
        await exportJobFileAsync(j.id)
        await new Promise(r => setTimeout(r, 350))
      } catch (err) {
        console.error(err)
      }
    }
    if (jobs.length === 0) exportAllJobs()
  }

  function handleUpgradeClear() {
    if (!confirm('Clear all jobs from this browser and finish the storage update?\n\nExport job files first if you still need them.')) return
    completeStorageVersionUpgrade()
    setStorageUpgrade({ ok: true })
    setJobId(null)
    setHubTick(t => t + 1)
  }

  function handleUpgradeKeep() {
    acknowledgeStorageVersionKeepData()
    setStorageUpgrade({ ok: true })
  }

  const brandTag = (() => {
    if (job?.customer) {
      return `${job.customer}${job.site ? ` · ${job.site}` : ''}`
    }
    if (account?.name) {
      return `${account.name}${account.site ? ` · ${account.site}` : ''}`
    }
    return 'Survey. Design. Go live.'
  })()

  return (
    <div className="app-root">
      <div className="app-atmosphere" aria-hidden="true" />
      <header className="app-header">
        <div className="brand">
          <BrandMark />
          <div className="brand-copy">
            <div className="brand-name">ClearLine</div>
            <div className="brand-tag">{brandTag}</div>
          </div>
        </div>
        <div className="header-actions">
          {(jobId || accountId) && (
            <button
              type="button"
              className="btn btn-secondary jobs-switch"
              onClick={() => goToHub(jobId ? 'jobs' : 'accounts')}
            >
              {jobId ? 'Jobs' : 'Accounts'}
            </button>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-pressed={theme === 'dark'}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="theme-toggle-track" aria-hidden="true">
              <span className="theme-toggle-thumb" />
            </span>
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </header>

      {saveBanner && (
        <div
          className={`app-save-banner${saveBanner.type === 'error' ? ' is-error' : ' is-warn'}`}
          role="status"
        >
          <span>{saveBanner.message}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setSaveBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showHub && (
        <div className="app-nav-wrap">
          <nav className="hub-mode-tabs" aria-label="Library">
            <button
              type="button"
              className={`hub-mode-tab${hubMode === 'jobs' ? ' is-active' : ''}`}
              onClick={() => setHubMode('jobs')}
            >
              Jobs
              <small>Field installs</small>
            </button>
            <button
              type="button"
              className={`hub-mode-tab${hubMode === 'accounts' ? ' is-active' : ''}`}
              onClick={() => setHubMode('accounts')}
            >
              Accounts
              <small>Call flow charts</small>
            </button>
          </nav>
        </div>
      )}

      {!showHub && jobId && (
        <div className="app-nav-wrap">
          <nav className="workspace-tabs workspace-tabs-3" aria-label="Primary workspaces">
            {WORKSPACES.map(workspace => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => setActiveWorkspace(workspace.id)}
                className={`workspace-tab${activeWorkspace === workspace.id ? ' workspace-tab-active' : ''}`}
              >
                <span>{workspace.label}</span>
                <small>{workspace.description}</small>
              </button>
            ))}
          </nav>
        </div>
      )}

      <main
        className="app-body"
        key={showHub ? `hub-${hubMode}-${hubTick}` : (jobId ? `${jobId}-${activeWorkspace}` : `account-${accountId}`)}
      >
        <div className="app-stage">
          {showHub && hubMode === 'jobs' && (
            <JobsHub
              refreshKey={hubTick}
              onOpenJob={handleOpenJob}
            />
          )}
          {showHub && hubMode === 'accounts' && (
            <AccountsHub
              refreshKey={hubTick}
              onOpenAccount={handleOpenAccount}
            />
          )}
          <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
            {!showHub && jobId && activeWorkspace === 'siteSurvey' && <SiteSurvey jobId={jobId} />}
            {!showHub && jobId && activeWorkspace === 'systemDesign' && <SystemDesign jobId={jobId} />}
            {!showHub && jobId && activeWorkspace === 'goLive' && <GoLive jobId={jobId} />}
            {!showHub && accountId && (
              <AccountCallFlow
                accountId={accountId}
                onBack={() => goToHub('accounts')}
              />
            )}
          </Suspense>
        </div>
      </main>

      {storageUpgrade?.needsUpgrade && createPortal(
        <div className="section-modal-backdrop storage-upgrade-backdrop" role="presentation">
          <div
            className="section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-upgrade-title"
          >
            <div className="section-modal-head">
              <div>
                <div className="survey-kicker">Storage update</div>
                <h2 id="storage-upgrade-title">Export before continuing</h2>
                <p>
                  ClearLine’s storage format changed. Export your job files first so nothing is lost.
                  You can keep existing jobs on this device, or clear them after exporting.
                </p>
              </div>
            </div>
            <div className="section-modal-body">
              <div className="btn-row storage-upgrade-actions">
                <button type="button" className="btn btn-primary" onClick={handleExportAllForUpgrade}>
                  Export all jobs
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleUpgradeKeep}>
                  Keep data & continue
                </button>
                <button type="button" className="btn btn-danger" onClick={handleUpgradeClear}>
                  Clear & finish update
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
