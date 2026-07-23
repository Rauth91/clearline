/**
 * ClearLine — Field product shell
 * Home dashboard | Jobs | Accounts | Tools
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import BrandMark from './components/BrandMark.jsx'
import HomeHub from './components/HomeHub.jsx'
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

const SiteSurvey    = lazy(() => import('./components/SiteSurvey.jsx'))
const SystemDesign  = lazy(() => import('./components/SystemDesign.jsx'))
const GoLive        = lazy(() => import('./components/GoLive.jsx'))
const AccountCallFlow = lazy(() => import('./components/AccountCallFlow.jsx'))

// Tools
const YealinkCodes  = lazy(() => import('./components/YealinkCodes.jsx'))
const CallDiagnostic = lazy(() => import('./components/CallDiagnostic.jsx'))
const SymptomWizard = lazy(() => import('./components/SymptomWizard.jsx'))
const PortChecklist = lazy(() => import('./components/PortChecklist.jsx'))
const AlgoConfig    = lazy(() => import('./components/AlgoConfig.jsx'))
const QuickCard     = lazy(() => import('./components/QuickCard.jsx'))
const CodecRef      = lazy(() => import('./components/CodecRef.jsx'))

const WORKSPACES = [
  { id: 'siteSurvey',   label: 'Site Survey',   description: 'Field handoff and readiness' },
  { id: 'systemDesign', label: 'System Design',  description: 'Plan voice architecture' },
  { id: 'goLive',       label: 'Go-Live',        description: 'Cutover, install, handoff' },
]

const TOOLS = [
  { id: 'calldiag',   label: 'Call Diagnostic' },
  { id: 'yealink',    label: 'Yealink Codes' },
  { id: 'symptom',    label: 'Symptom Wizard' },
  { id: 'ports',      label: 'Port Checklist' },
  { id: 'algo',       label: 'Algo Config' },
  { id: 'quickcard',  label: 'Quick Card' },
  { id: 'codec',      label: 'Codec & QoS' },
]

// view: 'home' | 'jobs' | 'accounts' | 'job' | 'account' | 'tools'
export default function App() {
  const [view, setView] = useState('home')
  const [activeTool, setActiveTool] = useState('calldiag')
  const [activeWorkspace, setActiveWorkspace] = useState('siteSurvey')
  const [jobId, setJobId] = useState(() => {
    ensureStorageVersion()
    migrateLegacyDrafts()
    return getActiveJobId()
  })
  const [accountId, setAccountId] = useState(() => {
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

  // Restore view from active job/account on mount
  useEffect(() => {
    if (jobId) setView('job')
    else if (accountId) setView('account')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const job = jobId ? getJob(jobId) : null
  const account = accountId ? getAccount(accountId) : null

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
      setView('jobs')
      setHubTick(t => t + 1)
      return
    }
    setActiveAccountId(null)
    setAccountId(null)
    setActiveJobId(id)
    setJobId(id)
    setActiveWorkspace(workspace)
    setView('job')
  }

  function handleOpenAccount(id) {
    if (!id) {
      setActiveAccountId(null)
      setAccountId(null)
      setView('accounts')
      setHubTick(t => t + 1)
      return
    }
    setActiveJobId(null)
    setJobId(null)
    setActiveAccountId(id)
    setAccountId(id)
    setView('account')
  }

  function handleOpenTool(toolId) {
    setActiveTool(toolId)
    setView('tools')
  }

  function goHome() {
    setActiveJobId(null)
    setJobId(null)
    setActiveAccountId(null)
    setAccountId(null)
    setView('home')
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
    if (job?.customer) return `${job.customer}${job.site ? ` · ${job.site}` : ''}`
    if (account?.name) return `${account.name}${account.site ? ` · ${account.site}` : ''}`
    if (view === 'tools') return TOOLS.find(t => t.id === activeTool)?.label || 'Tools'
    return 'Survey. Design. Go live.'
  })()

  // Which back label to show
  const backLabel = view === 'job' ? 'Jobs' : view === 'account' ? 'Accounts' : view === 'tools' ? 'Tools' : null

  return (
    <div className="app-root">
      <div className="app-atmosphere" aria-hidden="true" />
      <header className="app-header">
        <div className="brand">
          <button type="button" className="brand-btn" onClick={goHome} aria-label="Go to home">
            <BrandMark />
            <div className="brand-copy">
              <div className="brand-name">ClearLine</div>
              <div className="brand-tag">{brandTag}</div>
            </div>
          </button>
        </div>
        <div className="header-actions">
          {(view === 'job' || view === 'account' || view === 'tools' || view === 'jobs' || view === 'accounts') && (
            <button
              type="button"
              className="btn btn-secondary jobs-switch"
              onClick={goHome}
            >
              Home
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

      {/* Job workspace tabs */}
      {view === 'job' && (
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

      {/* Tools tabs */}
      {view === 'tools' && (
        <div className="app-nav-wrap">
          <nav className="workspace-tabs" aria-label="Tools" style={{ '--tab-count': TOOLS.length }}>
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`workspace-tab${activeTool === tool.id ? ' workspace-tab-active' : ''}`}
              >
                <span>{tool.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <main
        className="app-body"
        key={`${view}-${view === 'job' ? jobId : ''}-${view === 'account' ? accountId : ''}-${view === 'tools' ? activeTool : ''}-${hubTick}`}
      >
        <div className="app-stage">
          <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
            {view === 'home' && (
              <HomeHub
                refreshKey={hubTick}
                onOpenJob={handleOpenJob}
                onOpenAccount={handleOpenAccount}
                onOpenTool={handleOpenTool}
              />
            )}
            {view === 'jobs' && (
              <JobsHub refreshKey={hubTick} onOpenJob={handleOpenJob} />
            )}
            {view === 'accounts' && (
              <AccountsHub refreshKey={hubTick} onOpenAccount={handleOpenAccount} />
            )}
            {view === 'job' && activeWorkspace === 'siteSurvey'   && <SiteSurvey jobId={jobId} />}
            {view === 'job' && activeWorkspace === 'systemDesign'  && <SystemDesign jobId={jobId} />}
            {view === 'job' && activeWorkspace === 'goLive'        && <GoLive jobId={jobId} />}
            {view === 'account' && (
              <AccountCallFlow accountId={accountId} onBack={() => setView('accounts')} />
            )}
            {view === 'tools' && activeTool === 'calldiag'  && <CallDiagnostic />}
            {view === 'tools' && activeTool === 'yealink'   && <YealinkCodes />}
            {view === 'tools' && activeTool === 'symptom'   && <SymptomWizard />}
            {view === 'tools' && activeTool === 'ports'     && <PortChecklist />}
            {view === 'tools' && activeTool === 'algo'      && <AlgoConfig />}
            {view === 'tools' && activeTool === 'quickcard' && <QuickCard />}
            {view === 'tools' && activeTool === 'codec'     && <CodecRef />}
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
                  ClearLine's storage format changed. Export your job files first so nothing is lost.
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
                  Keep data &amp; continue
                </button>
                <button type="button" className="btn btn-danger" onClick={handleUpgradeClear}>
                  Clear &amp; finish update
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
