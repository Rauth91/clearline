/**
 * ClearLine — Field product shell (hash-routed)
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import BrandMark from './components/BrandMark.jsx'
import HomeHub from './components/HomeHub.jsx'
import JobsHub from './components/JobsHub.jsx'
import AccountsHub from './components/AccountsHub.jsx'
import SyncChip from './components/SyncChip.jsx'
import HeaderMenu from './components/HeaderMenu.jsx'
import AdminSettings from './components/AdminSettings.jsx'
import JobPresence from './components/JobPresence.jsx'
import JobActivity from './components/JobActivity.jsx'
import JobCockpit from './components/JobCockpit.jsx'
import { OnboardingScreen, SignInScreen } from './components/AuthScreens.jsx'
import {
  acknowledgeStorageVersionKeepData,
  completeStorageVersionUpgrade,
  ensureRepoReady,
  exportAllJobs,
  exportJobFileAsync,
  getActiveJobId,
  getJob,
  getStorageVersionStatus,
  ensureStorageVersion,
  listJobs,
  setActiveJobId,
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
import { applyDocumentTitle, navigate, useRoute } from './lib/router.js'

const SiteSurvey = lazy(() => import('./components/SiteSurvey.jsx'))
const SystemDesign = lazy(() => import('./components/SystemDesign.jsx'))
const GoLive = lazy(() => import('./components/GoLive.jsx'))
const AccountDetail = lazy(() => import('./components/AccountDetail.jsx'))
const ToolsReference = lazy(() => import('./components/ToolsReference.jsx'))
const ToolsTroubleshoot = lazy(() => import('./components/ToolsTroubleshoot.jsx'))
const ToolsConfig = lazy(() => import('./components/ToolsConfig.jsx'))
const Runbook = lazy(() => import('./components/Runbook.jsx'))
const CommandPalette = lazy(() => import('./components/CommandPalette.jsx'))

// All seven tools — must remain directly reachable (do not drop)
const YealinkCodes = lazy(() => import('./components/YealinkCodes.jsx'))
const CallDiagnostic = lazy(() => import('./components/CallDiagnostic.jsx'))
const SymptomWizard = lazy(() => import('./components/SymptomWizard.jsx'))
const PortChecklist = lazy(() => import('./components/PortChecklist.jsx'))
const AlgoConfig = lazy(() => import('./components/AlgoConfig.jsx'))
const QuickCard = lazy(() => import('./components/QuickCard.jsx'))
const CodecRef = lazy(() => import('./components/CodecRef.jsx'))

const WORKSPACES = [
  { id: 'siteSurvey', label: 'Site Survey', description: 'Field handoff and readiness', route: 'survey' },
  { id: 'systemDesign', label: 'System Design', description: 'Plan voice architecture', route: 'design' },
  { id: 'goLive', label: 'Go-Live', description: 'Cutover, install, handoff', route: 'golive' },
]

const TOOLS = [
  { id: 'calldiag', label: 'Call Diagnostic' },
  { id: 'yealink', label: 'Yealink Codes' },
  { id: 'symptom', label: 'Symptom Wizard' },
  { id: 'ports', label: 'Port Checklist' },
  { id: 'algo', label: 'Algo Config' },
  { id: 'quickcard', label: 'Quick Card' },
  { id: 'codec', label: 'Codec & QoS' },
]

const TOOL_GROUPS = [
  { id: 'reference', label: 'Reference hub' },
  { id: 'troubleshoot', label: 'Troubleshoot hub' },
  { id: 'config', label: 'Config hub' },
]

const SECTION_LABELS = {
  cockpit: 'Cockpit',
  survey: 'Site Survey',
  design: 'System Design',
  golive: 'Go-Live',
  runbook: 'Runbook',
}

const TOOL_LABELS = {
  'tools-reference': 'Reference',
  'tools-troubleshoot': 'Troubleshoot',
  'tools-config': 'Config',
  calldiag: 'Call Diagnostic',
  yealink: 'Yealink Codes',
  symptom: 'Symptom Wizard',
  ports: 'Port Checklist',
  algo: 'Algo Config',
  quickcard: 'Quick Card',
  codec: 'Codec & QoS',
}

export default function App() {
  const route = useRoute()
  const [repoReady, setRepoReady] = useState(false)
  const [authReady, setAuthReady] = useState(!authEnabled())
  const [authGate, setAuthGate] = useState(() => (authEnabled() ? 'loading' : 'app'))
  const [profile, setProfile] = useState(null)
  const [hubTick, setHubTick] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
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
        const activeJob = getActiveJobId()
        const hash = window.location.hash || '#/'
        if (activeJob && (hash === '' || hash === '#' || hash === '#/')) {
          navigate(`/job/${activeJob}`, { replace: true })
        }
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

  // Sync active job id with route
  useEffect(() => {
    if (!repoReady) return
    if (jobId) {
      setActiveJobId(jobId)
      setActiveAccountId(null)
    } else if (accountId) {
      setActiveAccountId(accountId)
      setActiveJobId(null)
    }
  }, [repoReady, jobId, accountId])

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
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function goHome() {
    setActiveJobId(null)
    setActiveAccountId(null)
    navigate('#/')
    setHubTick(t => t + 1)
  }

  function handleOpenConflict(id) {
    const conflictId = id || getFirstConflictedJobId()
    if (!conflictId) return
    navigate(`/job/${conflictId}/survey`)
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
    navigate('/')
    setHubTick(t => t + 1)
  }

  function handleUpgradeKeep() {
    acknowledgeStorageVersionKeepData()
    setStorageUpgrade({ ok: true })
  }

  const brandTag = (() => {
    if (job?.customer) return `${job.customer}${job.site ? ` · ${job.site}` : ''}`
    if (account?.name) return `${account.name}${account.site ? ` · ${account.site}` : ''}`
    if (route.name === 'tool' && route.params.toolId) {
      return TOOL_LABELS[route.params.toolId] || 'Tools'
    }
    if (TOOL_LABELS[route.name]) return TOOL_LABELS[route.name]
    if (route.name === 'settings') return 'Admin settings'
    if (route.name === 'jobs') return 'Jobs'
    if (route.name === 'accounts') return 'Accounts'
    return 'Survey. Design. Go live.'
  })()

  const inJobSection = ['cockpit', 'survey', 'design', 'golive', 'runbook'].includes(route.name)
  const inTools = route.name === 'tool' || String(route.name).startsWith('tools')

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
        <SignInScreen />
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
        <nav className="primary-nav" aria-label="Primary">
          <button
            type="button"
            className={`primary-nav-item${route.name === 'home' ? ' is-active' : ''}`}
            aria-current={route.name === 'home' ? 'page' : undefined}
            onClick={goHome}
          >
            Home
          </button>
          <button
            type="button"
            className={`primary-nav-item${route.name === 'jobs' || inJobSection ? ' is-active' : ''}`}
            aria-current={route.name === 'jobs' || inJobSection ? 'page' : undefined}
            onClick={() => navigate('/jobs')}
          >
            Jobs
          </button>
          <button
            type="button"
            className={`primary-nav-item${route.name === 'accounts' || route.name === 'account' ? ' is-active' : ''}`}
            aria-current={route.name === 'accounts' || route.name === 'account' ? 'page' : undefined}
            onClick={() => navigate('/accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            className={`primary-nav-item${inTools ? ' is-active' : ''}`}
            aria-current={inTools ? 'page' : undefined}
            onClick={() => navigate('/tools/calldiag')}
          >
            Tools
          </button>
        </nav>
        <div className="header-actions">
          {inJobSection && (
            <button
              type="button"
              className="btn btn-secondary jobs-switch"
              onClick={() => navigate('/jobs')}
            >
              Jobs
            </button>
          )}
          {route.name === 'account' && (
            <button
              type="button"
              className="btn btn-secondary jobs-switch"
              onClick={() => navigate('/accounts')}
            >
              Accounts
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary header-search-btn"
            aria-label="Open command palette"
            onClick={() => setPaletteOpen(true)}
          >
            Search
          </button>
          {authEnabled() && (
            <SyncChip onOpenConflict={handleOpenConflict} />
          )}
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

      {inJobSection && jobId && route.name !== 'runbook' && (
        <div className="app-nav-wrap">
          <nav className="workspace-tabs workspace-tabs-4" aria-label="Job sections">
            <button
              type="button"
              onClick={() => navigate(`/job/${jobId}`)}
              className={`workspace-tab${route.name === 'cockpit' ? ' workspace-tab-active' : ''}`}
              aria-selected={route.name === 'cockpit'}
            >
              <span>Cockpit</span>
            </button>
            {WORKSPACES.map(ws => (
              <button
                key={ws.id}
                type="button"
                onClick={() => navigate(`/job/${jobId}/${ws.route}`)}
                className={`workspace-tab${route.name === ws.route ? ' workspace-tab-active' : ''}`}
                aria-selected={route.name === ws.route}
              >
                <span>{ws.label}</span>
                <small>{ws.description}</small>
              </button>
            ))}
          </nav>
          <JobPresence jobId={jobId} workspace={route.name} />
          <JobActivity jobId={jobId} />
        </div>
      )}

      {inTools && (
        <div className="app-nav-wrap">
          <nav className="workspace-tabs tools-tabs-7" aria-label="Tools">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                type="button"
                onClick={() => navigate(`/tools/${tool.id}`)}
                className={`workspace-tab${route.name === 'tool' && route.params.toolId === tool.id ? ' workspace-tab-active' : ''}`}
                aria-selected={route.name === 'tool' && route.params.toolId === tool.id}
              >
                <span>{tool.label}</span>
              </button>
            ))}
          </nav>
          <nav className="tools-hub-links" aria-label="Tool hubs">
            {TOOL_GROUPS.map(g => (
              <button
                key={g.id}
                type="button"
                className={`tools-hub-link${route.params.toolGroup === g.id ? ' is-active' : ''}`}
                onClick={() => navigate(`/tools/${g.id}`)}
              >
                {g.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <main className="app-body" key={`${route.path}-${hubTick}`}>
        <div className="app-stage">
          <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
            {route.name === 'home' && (
              <HomeHub refreshKey={hubTick} profileId={profile?.id} />
            )}
            {route.name === 'jobs' && (
              <JobsHub
                refreshKey={hubTick}
                filter={route.query.filter}
                profileId={profile?.id}
                autoOpenNew={route.query.new === '1'}
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
              <>
                <AccountDetail accountId={accountId} />
              </>
            )}
            {route.name === 'settings' && (
              <AdminSettings onBack={goHome} />
            )}
            {route.name === 'cockpit' && jobId && <JobCockpit jobId={jobId} />}
            {route.name === 'survey' && jobId && <SiteSurvey jobId={jobId} />}
            {route.name === 'design' && jobId && <SystemDesign jobId={jobId} />}
            {route.name === 'golive' && jobId && <GoLive jobId={jobId} />}
            {route.name === 'runbook' && jobId && (
              <Runbook jobId={jobId} doneBy={profile?.display_name || ''} />
            )}
            {route.name === 'tool' && route.params.toolId === 'calldiag' && <CallDiagnostic />}
            {route.name === 'tool' && route.params.toolId === 'yealink' && <YealinkCodes />}
            {route.name === 'tool' && route.params.toolId === 'symptom' && <SymptomWizard />}
            {route.name === 'tool' && route.params.toolId === 'ports' && <PortChecklist />}
            {route.name === 'tool' && route.params.toolId === 'algo' && <AlgoConfig />}
            {route.name === 'tool' && route.params.toolId === 'quickcard' && <QuickCard />}
            {route.name === 'tool' && route.params.toolId === 'codec' && <CodecRef />}
            {route.name === 'tools-reference' && <ToolsReference />}
            {route.name === 'tools-troubleshoot' && <ToolsTroubleshoot />}
            {route.name === 'tools-config' && <ToolsConfig tab={route.params.toolTab} />}
          </Suspense>
        </div>
      </main>

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
