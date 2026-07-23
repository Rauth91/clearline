/**
 * HomeHub — ClearLine dashboard home
 * Quick-launch for Jobs, Accounts, and Tools sections
 */

import { useMemo } from 'react'
import { listJobs } from '../lib/jobModel.js'
import { listAccounts } from '../lib/accountModel.js'

const TOOLS = [
  { id: 'calldiag',    label: 'Call Diagnostic',      desc: 'Parse NetSapiens call logs into plain-English summaries and SIP ladder diagrams.' },
  { id: 'yealink',    label: 'Yealink Code Generator', desc: 'Search and generate Yealink phone config codes with live variable fields.' },
  { id: 'symptom',    label: 'Symptom Wizard',        desc: 'Guided troubleshooting for calls not ringing, dropping, audio issues, and more.' },
  { id: 'ports',      label: 'Port Checklist',        desc: 'Required SIP/RTP ports by platform — NetSapiens, Meta, Zultys, Yealink, Algo.' },
  { id: 'algo',       label: 'Algo Config Builder',   desc: 'Generate SIP and multicast config for Algo paging units and matching Yealink keys.' },
  { id: 'quickcard',  label: 'Quick Card Generator',  desc: 'Build and print a phone reference card for end users at go-live.' },
  { id: 'codec',      label: 'Codec & QoS Reference', desc: 'Codec bandwidth specs, DSCP values, QoS best practices, and SIP response codes.' },
]

export default function HomeHub({ onOpenJob, onOpenAccount, onOpenTool, refreshKey }) {
  const jobs = useMemo(() => {
    try { return listJobs().slice(0, 5) } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const accounts = useMemo(() => {
    try { return listAccounts().slice(0, 5) } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <div className="home-root">

      {/* ── Recents ─────────────────────────────────────────────────────── */}
      {(jobs.length > 0 || accounts.length > 0) && (
        <section className="home-section">
          <div className="home-section-header">
            <div className="home-section-title">Recent</div>
          </div>
          <div className="home-recents">
            {jobs.map(j => (
              <button
                key={j.id}
                type="button"
                className="home-recent-card"
                onClick={() => onOpenJob(j.id)}
              >
                <div className="home-recent-eyebrow">Job</div>
                <div className="home-recent-name">{j.customer || 'Unnamed job'}</div>
                {j.site && <div className="home-recent-sub">{j.site}</div>}
              </button>
            ))}
            {accounts.map(a => (
              <button
                key={a.id}
                type="button"
                className="home-recent-card"
                onClick={() => onOpenAccount(a.id)}
              >
                <div className="home-recent-eyebrow">Account</div>
                <div className="home-recent-name">{a.name || 'Unnamed account'}</div>
                {a.site && <div className="home-recent-sub">{a.site}</div>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Jobs ────────────────────────────────────────────────────────── */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title">Jobs</div>
          <div className="home-section-desc">Field installs — site survey, system design, go-live</div>
        </div>
        <div className="home-action-cards">
          <button
            type="button"
            className="home-action-card home-action-primary"
            onClick={() => onOpenJob(null, 'new')}
          >
            <div className="home-action-label">New Job</div>
            <div className="home-action-sub">Start a site survey for a new customer</div>
          </button>
          <button
            type="button"
            className="home-action-card"
            onClick={() => onOpenJob(null, 'list')}
          >
            <div className="home-action-label">All Jobs</div>
            <div className="home-action-sub">{jobs.length > 0 ? `${jobs.length} recent` : 'View and manage jobs'}</div>
          </button>
        </div>
      </section>

      {/* ── Accounts ────────────────────────────────────────────────────── */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title">Accounts</div>
          <div className="home-section-desc">Call flow charts and account-level documentation</div>
        </div>
        <div className="home-action-cards">
          <button
            type="button"
            className="home-action-card home-action-primary"
            onClick={() => onOpenAccount(null, 'new')}
          >
            <div className="home-action-label">New Account</div>
            <div className="home-action-sub">Create a call flow chart for an account</div>
          </button>
          <button
            type="button"
            className="home-action-card"
            onClick={() => onOpenAccount(null, 'list')}
          >
            <div className="home-action-label">All Accounts</div>
            <div className="home-action-sub">{accounts.length > 0 ? `${accounts.length} recent` : 'View and manage accounts'}</div>
          </button>
        </div>
      </section>

      {/* ── Tools ───────────────────────────────────────────────────────── */}
      <section className="home-section">
        <div className="home-section-header">
          <div className="home-section-title">Tools</div>
          <div className="home-section-desc">Diagnostics, references, and config generators</div>
        </div>
        <div className="home-tools-grid">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              type="button"
              className="home-tool-card"
              onClick={() => onOpenTool(tool.id)}
            >
              <div className="home-tool-label">{tool.label}</div>
              <div className="home-tool-desc">{tool.desc}</div>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
