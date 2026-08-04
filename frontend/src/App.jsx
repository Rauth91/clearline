/**
 * ClearLine — Field product shell (hash-routed)
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import BrandMark from './components/BrandMark.jsx'
import HomeHub from './components/HomeHub.jsx'
import AccountsHub from './components/AccountsHub.jsx'
import SyncChip from './components/SyncChip.jsx'
import HeaderMenu from './components/HeaderMenu.jsx'
import AdminSettings from './components/AdminSettings.jsx'
import JobPresence from './components/JobPresence.jsx'
import JobActivity from './components/JobActivity.jsx'
import JobCockpit from './components/JobCockpit.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import PwaUpdateBanner from './components/PwaUpdateBanner.jsx'
import FluidDock from './components/FluidDock.jsx'
import NavChipStrip from './components/NavChipStrip.jsx'
import DownloadButton from './components/DownloadButton.jsx'
import Screen from './components/Screen.jsx'
import { OnboardingScreen, SignInScreen } from './components/AuthScreens.jsx'
import {
  acknowledgeStorageVersionKeepData,
  completeStorageVersionUpgrade,
  ensureRepoReady,
  exportAllJobs,
  buildJobFileBlobAsync,
  getActiveJobId,
  getJob,
  getStorageVersionStatus,
  ensureStorageVersion,
  listJobs,
  setActiveJobId,
  jobWorkspacePath,
  subscribeSaveStatus,
} from './lib/jobModel.js'
import {
  getAccount,
  setActiveAccountId,
} from './lib/accountModel.js'
import {
  authEnabled,
  listOrgMembers,
  onAuthStateChange,
  resolveAuthState,
} from './lib/authModel.js'
import { getFirstConflictedJobId, startSyncEngine } from './lib/sync.js'
import { applyDocumentTitle, navigate, resolveLegacyRedirect, useRoute } from './lib/router.js'

const SiteSurvey = lazy(() => import('./components/SiteSurvey.jsx'))
const SystemDesign = lazy(() => import('./components/SystemDesign.jsx'))
const GoLive = lazy(() => import('./components/GoLive.jsx'))
const AccountDetail = lazy(() => import('./components/AccountDetail.jsx'))
const CommandPalette = lazy(() => import('./components/CommandPalette.jsx'))

const CallAnalysis = lazy(() => import('./components/CallAnalysis.jsx'))
const Readiness = lazy(() => import('./components/Readiness.jsx'))
const DeviceConfig = lazy(() => import('./components/DeviceConfig.jsx'))
const QuickCard = lazy(() => import('./components/QuickCard.jsx'))
const MigrationWorkspace = lazy(() => import('./components/MigrationWorkspace.jsx'))

/** Warm lazy chunks for a dock tab (and its neighbors) on pointerdown. */
function warmDockTab(tabId) {
  switch (tabId) {
    case 'accounts':
      import('./components/AccountDetail.jsx')
      break
    case 'job':
      import('./components/SiteSurvey.jsx')
      import('./components/SystemDesign.jsx')
      import('./components/GoLive.jsx')
      import('./components/MigrationWorkspace.jsx')
      break
    case 'tools':
      import('./components/CallAnalysis.jsx')
      import('./components/Readiness.jsx')
      import('./components/DeviceConfig.jsx')
      import('./components/QuickCard.jsx')
      break
    default:
      break
  }
}

const WORKSPACES = [
  { id: 'siteSurvey', label: 'Site Survey', description: 'Field handoff and readiness', route: 'survey' },
  { id: 'systemDesign', label: 'System Design', description: 'Plan voice architecture', route: 'design' },
  { id: 'goLive', label: 'Go-Live', description: 'Cutover, install, handoff', route: 'golive' },
]

const TOOLS = [
  { id: 'callanalysis', label: 'Call Analysis', group: 'troubleshoot' },
  { id: 'readiness', label: 'Readiness', group: 'troubleshoot' },
  { id: 'deviceconfig', label: 'Device Config', group: 'configure' },
  { id: 'quickcard', label: 'End-User Guide', group: 'configure' },
]

const SECTION_LABELS = {
  cockpit: 'Cockpit',
  survey: 'Site Survey',
  design: 'System Design',
  golive: 'Go-Live',
  migration: 'Migration',
}

const TOOL_LABELS = {
  callanalysis: 'Call Analysis',
  readiness: 'Readiness',
  deviceconfig: 'Device Config',
  quickcard: 'End-User Guide',
}

export default function App() {
  const route = useRoute()
  const [repoReady, setRepoReady] = useState(false)
  const [authReady, setAuthReady] = useState(!authEnabled())
  const [authGate, setAuthGate] = useState(() => (authEnabled() ? 'loading' : 'app'))
  const [profile, setProfile] = useState(null)
  const [hubTick, setHubTick] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteSource, setPaletteSource] = useState(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('voip-ops-theme')
    if (saved === 'light' || saved === 'dark') return saved
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
    return 'dark'
  })
  const [saveBanner, setSaveBanner] = useState(null)
  const [storageUpgrade, setStorageUpgrade] = useState(null)
  const [jobHint, setJobHint] = useState(null)

  const jobId = route.params.jobId || null
  const accountId = route.params.accountId || null
  const job = repoReady && jobId ? getJob(jobId) : null
  const account = repoReady && accountId ? getAccount(accountId) : null

  async function refreshAuth() {
    if (!authEnabled()) {
      setAuthGate('app')
      setProfile(null)
      setAuthReady(true)
      return
    }
    try {
      const state = await resolveAuthState()
      if (state.offlineOnly && state.profile) {
        setProfile(state.profile)
        setAuthGate('app')
      } else if (!state.session) {
        setProfile(null)
        setAuthGate('signin')
      } else if (state.needsOnboarding || !state.profile) {
        setProfile(null)
        setAuthGate('onboarding')
      } else {
        setProfile(state.profile)
        setAuthGate('app')
        listOrgMembers().catch(() => {})
      }
    } catch (err) {
      console.error(err)
      setAuthGate('signin')
      setProfile(null)
    } finally {
      setAuthReady(true)
    }
  }

  useEffect(() => {
    let cancelled = false
    ensureStorageVersion()
    ensureRepoReady()
      .then(() => {
        if (cancelled) return
        setStorageUpgrade(getStorageVersionStatus())
        setRepoReady(true)
        startSyncEngine()
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setSaveBanner({
            type: 'error',
            message: 'Could not open local device storage. Reload and try again.',
          })
          setRepoReady(true)
          startSyncEngine()
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!repoReady) return undefined
    let cancelled = false
    refreshAuth()
    const unsub = onAuthStateChange(() => {
      if (!cancelled) refreshAuth()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [repoReady])

  // Keep last-opened job when browsing Tools; clear it only when opening an account.
  useEffect(() => {
    if (!repoReady) return
    if (jobId) {
      setActiveJobId(jobId)
      setActiveAccountId(null)
    } else if (accountId) {
      setActiveAccountId(accountId)
    }
  }, [repoReady, jobId, accountId])

  // Retired bookmarks → canonical routes (never 404).
  useEffect(() => {
    const next = resolveLegacyRedirect(route)
    if (!next) return
    // Wait for repo on job runbook rewrite so jobId is meaningful.
    if (next.path.includes('/golive') && !repoReady) return
    navigate(next.path, { replace: true, query: next.query })
  }, [repoReady, route.path, route.name, route.params.toolId, route.params.jobId, route.query.tab, route.query.focus, route.query.q])

  // Migration jobs skip the cockpit — land directly on the migration workspace
  useEffect(() => {
    if (!repoReady) return
    if (route.name === 'cockpit' && job?.jobType === 'migration') {
      navigate(jobWorkspacePath(job), { replace: true })
    }
  }, [repoReady, route.name, job?.jobType, jobId])

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

  useEffect(() => {
    const section = SECTION_LABELS[route.name]
    const tool = route.name === 'tool'
      ? TOOL_LABELS[route.params.toolId]
      : TOOL_LABELS[route.name]
    applyDocumentTitle({
      customer: job?.customer || account?.name || '',
      section: section || '',
      tool: tool || '',
    })
  }, [route.name, route.params.toolId, job?.customer, account?.name])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteSource(null)
        setPaletteQuery('')
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (route.name !== 'ref-palette') return
    setPaletteSource(route.params.refSource || null)
    setPaletteQuery(route.query.q || '')
    setPaletteOpen(true)
  }, [route.name, route.params.refSource, route.query.q])

  function closePalette() {
    setPaletteOpen(false)
    setPaletteSource(null)
    setPaletteQuery('')
    if (route.name === 'ref-palette') {
      navigate('/', { replace: true })
    }
  }

  function openPalette({ source = null, query = '' } = {}) {
    setPaletteSource(source)
    setPaletteQuery(query)
    setPaletteOpen(true)
  }

  function goHome() {
    setActiveJobId(null)
    setActiveAccountId(null)
    navigate('#/')
    setHubTick(t => t + 1)
  }

  function handleOpenConflict(id) {
    const conflictId = id || getFirstConflictedJobId()
    if (!conflictId) return
    const conflictJob = getJob(conflictId)
    navigate(jobWorkspacePath(conflictJob || { id: conflictId }))
  }

  async function exportAllJobsRun({ onProgress }) {
    const jobs = listJobs()
    if (jobs.length === 0) {
      exportAllJobs()
      onProgress(1)
      return new Blob([JSON.stringify({ exported: [] })], { type: 'application/json' })
    }
    const exported = []
    for (let i = 0; i < jobs.length; i++) {
      onProgress(i / jobs.length)
      const { blob, filename } = await buildJobFileBlobAsync(jobs[i].id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      exported.push(filename)
      await new Promise(r => setTimeout(r, 350))
    }
    onProgress(1)
    return new Blob(
      [JSON.stringify({ exported, at: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    )
  }

  function handleUpgradeClear() {
    if (!confirm('Clear all jobs from this browser and finish the storage update?\n\nExport job files first if you still need them.')) return
    completeStorageVersionUpgrade()
    setStorageUpgrade({ ok: true })
    navigate('/')
    setHubTick(t => t + 1)
  }

  function handleUpgradeKeep() {
    acknowledgeStorageVersionKeepData()
    setStorageUpgrade({ ok: true })
  }

  const inJobSection = ['cockpit', 'survey', 'design', 'golive', 'migration'].includes(route.name)
  const inTools = route.name === 'tool'
  const persistedJobId = repoReady ? getActiveJobId() : null
  const persistedJob = persistedJobId ? getJob(persistedJobId) : null
  const dockJob = job || persistedJob

  const dockActive = (() => {
    if (route.name === 'home') return 'home'
    if (route.name === 'settings') return 'settings'
    if (inTools) return 'tools'
    if (inJobSection) return 'job'
    if (route.name === 'accounts' || route.name === 'account') return 'accounts'
    return 'home'
  })()

  function goJobTab() {
    const id = jobId || getActiveJobId()
    if (id) {
      const j = getJob(id)
      setJobHint(null)
      navigate(jobWorkspacePath(j || { id }))
      return
    }
    setJobHint('Open an account and start a job — then Job brings you back.')
    navigate('/accounts')
  }

  function onDockSelect(id) {
    if (id === 'home') {
      goHome()
      return
    }
    if (id === 'accounts') {
      navigate('/accounts')
      return
    }
    if (id === 'job') {
      goJobTab()
      return
    }
    if (id === 'tools') {
      navigate('/tools/callanalysis')
      return
    }
    if (id === 'settings') {
      navigate('/settings')
    }
  }

  useEffect(() => {
    if (!jobHint) return undefined
    const t = setTimeout(() => setJobHint(null), 5000)
    return () => clearTimeout(t)
  }, [jobHint])

  if (!repoReady || !authReady || authGate === 'loading') {
    return (
      <div className="app-root">
        <div className="app-atmosphere" aria-hidden="true" />
        <main className="app-body">
          <div className="workspace-loading">Loading…</div>
        </main>
      </div>
    )
  }

  if (authGate === 'signin') {
    return (
      <div className="app-root">
        <div className="app-atmosphere" aria-hidden="true" />
        <SignInScreen onVerified={() => { refreshAuth() }} />
      </div>
    )
  }

  if (authGate === 'onboarding') {
    return (
      <div className="app-root">
        <div className="app-atmosphere" aria-hidden="true" />
        <OnboardingScreen
          onComplete={(p) => {
            setProfile(p)
            setAuthGate('app')
            listOrgMembers().catch(() => {})
          }}
        />
      </div>
    )
  }

  // Topbar breadcrumb context
  const topbarCrumb = (() => {
    if (inJobSection && job) {
      const section = SECTION_LABELS[route.name] || ''
      return <><span>{job.customer || 'Job'}</span>{section ? <><span className="topbar-crumb-sep">/</span><strong>{section}</strong></> : null}</>
    }
    if (route.name === 'account' && account) return <><span>Accounts</span><span className="topbar-crumb-sep">/</span><strong>{account.name}</strong></>
    if (route.name === 'accounts') return <strong>Accounts</strong>
    if (route.name === 'settings') return <strong>Settings</strong>
    if (route.name === 'tool') return <><span>Tools</span><span className="topbar-crumb-sep">/</span><strong>{TOOL_LABELS[route.params.toolId] || 'Tool'}</strong></>
    if (inTools) return <strong>Tools</strong>
    return <strong>Home</strong>
  })()

  const jobStripItems = (() => {
    if (!inJobSection || !jobId) return null
    if (job?.jobType === 'migration') {
      return [{
        id: 'migration',
        label: 'Migration Workspace',
        active: route.name === 'migration',
        onClick: () => navigate(`/job/${jobId}/migration`),
      }]
    }
    return [
      {
        id: 'cockpit',
        label: 'Overview',
        active: route.name === 'cockpit',
        onClick: () => navigate(`/job/${jobId}`),
      },
      ...WORKSPACES.map(ws => ({
        id: ws.id,
        label: ws.label,
        active: route.name === ws.route,
        onClick: () => navigate(`/job/${jobId}/${ws.route}`),
      })),
    ]
  })()

  const toolStripItems = inTools
    ? TOOLS.map(tool => ({
      id: tool.id,
      label: tool.label,
      active: route.params.toolId === tool.id,
      onClick: () => navigate(`/tools/${tool.id}`),
      title: tool.group,
    }))
    : null

  return (
    <div className="app-root">
      <div className="app-atmosphere" aria-hidden="true" />
      <div className="app-shell app-shell--dock">

        <div className="app-content">
          <header className="app-topbar">
            <button type="button" className="topbar-brand" onClick={goHome} aria-label="Go to home">
              <BrandMark />
              <span className="topbar-brand-name">ClearLine</span>
            </button>
            <div className="topbar-breadcrumb">{topbarCrumb}</div>
            <div className="topbar-actions">
              {inJobSection && jobId && (
                <>
                  <JobPresence jobId={jobId} workspace={route.name} />
                  <JobActivity jobId={jobId} />
                </>
              )}
              <button
                type="button"
                className="topbar-search-btn"
                onClick={() => openPalette()}
                aria-label="Search"
              >
                Search
                <kbd className="topbar-search-kbd">⌘K</kbd>
              </button>
              {authEnabled() && <SyncChip onOpenConflict={handleOpenConflict} />}
              <HeaderMenu
                theme={theme}
                onToggleTheme={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
                profile={profile}
                onOpenSettings={() => navigate('/settings')}
                onSignedOut={() => {
                  setProfile(null)
                  setAuthGate(authEnabled() ? 'signin' : 'app')
                  goHome()
                }}
              />
            </div>
          </header>

          {jobStripItems && (
            <NavChipStrip
              label={job?.customer || 'Job'}
              badge={{
                text: job?.jobType === 'migration' ? 'Migration' : 'New Install',
                tone: job?.jobType === 'migration' ? 'migration' : 'install',
              }}
              items={jobStripItems}
            />
          )}

          {toolStripItems && (
            <NavChipStrip
              label="Tools"
              items={toolStripItems}
              trailing={dockJob ? (
                <button
                  type="button"
                  className="nav-chip nav-chip-return"
                  onClick={() => navigate(jobWorkspacePath(dockJob))}
                  title="Return to active job"
                >
                  ← {dockJob.customer || 'Job'}
                </button>
              ) : null}
            />
          )}

          {jobHint && (
            <div className="app-save-banner is-warn" role="status">
              <span>{jobHint}</span>
              <button type="button" className="btn btn-secondary" onClick={() => setJobHint(null)}>Dismiss</button>
            </div>
          )}

          {saveBanner && (
            <div className={`app-save-banner${saveBanner.type === 'error' ? ' is-error' : ' is-warn'}`} role="status">
              <span>{saveBanner.message}</span>
              <button type="button" className="btn btn-secondary" onClick={() => setSaveBanner(null)}>Dismiss</button>
            </div>
          )}

          <PwaUpdateBanner />

          <main className="app-body">
            <div className="app-stage">
              <ErrorBoundary>
                <Screen
                  screenKey={`${route.path}-${hubTick}`}
                  fallback={<div className="workspace-loading">Loading…</div>}
                >
              {route.name === 'home' && (
                <HomeHub
                  refreshKey={hubTick}
                  profileId={profile?.id}
                  profile={profile}
                  onOpenSearch={() => openPalette()}
                />
              )}
              {route.name === 'accounts' && (
                <AccountsHub
                  refreshKey={hubTick}
                  onOpenAccount={(id) => {
                    if (!id) {
                      navigate('/accounts')
                      setHubTick(t => t + 1)
                      return
                    }
                    navigate(`/account/${id}`)
                  }}
                />
              )}
              {route.name === 'account' && accountId && (
                <AccountDetail accountId={accountId} />
              )}
              {route.name === 'settings' && (
                <AdminSettings onBack={goHome} />
              )}
              {route.name === 'cockpit' && jobId && <JobCockpit jobId={jobId} />}
              {route.name === 'survey' && jobId && <SiteSurvey jobId={jobId} />}
              {route.name === 'design' && jobId && <SystemDesign jobId={jobId} />}
              {route.name === 'golive' && jobId && (
                <GoLive jobId={jobId} doneBy={profile?.display_name || ''} />
              )}
              {route.name === 'migration' && jobId && <MigrationWorkspace jobId={jobId} />}
              {route.name === 'tool' && route.params.toolId === 'callanalysis' && <CallAnalysis />}
              {route.name === 'tool' && route.params.toolId === 'readiness' && <Readiness />}
              {route.name === 'tool' && route.params.toolId === 'deviceconfig' && <DeviceConfig />}
              {route.name === 'tool' && route.params.toolId === 'quickcard' && <QuickCard />}
                </Screen>
              </ErrorBoundary>
            </div>
          </main>
        </div>

        <FluidDock activeId={dockActive} onSelect={onDockSelect} onWarm={warmDockTab} />

      </div>

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onClose={closePalette}
            sourceFilter={paletteSource}
            initialQuery={paletteQuery}
          />
        </Suspense>
      )}

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
                  ClearLine&apos;s storage format changed. Export your job files first so nothing is lost.
                  You can keep existing jobs on this device, or clear them after exporting.
                </p>
              </div>
            </div>
            <div className="section-modal-body">
              <div className="btn-row storage-upgrade-actions">
                <DownloadButton
                  className="btn-primary"
                  label="Export all jobs"
                  filename={`clearline-jobs-export-${new Date().toISOString().slice(0, 10)}.json`}
                  run={exportAllJobsRun}
                  onError={(err) => console.error(err)}
                />
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
