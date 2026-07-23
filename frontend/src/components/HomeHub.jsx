/**
 * HomeHub — ClearLine dashboard home
 */

import { useMemo } from 'react'
import { listJobs } from '../lib/jobModel.js'
import { listAccounts } from '../lib/accountModel.js'

const TOOLS = [
  { id: 'calldiag',   label: 'Call Diagnostic',       desc: 'Parse NetSapiens call logs into SIP ladder diagrams and plain-English summaries.' },
  { id: 'yealink',   label: 'Yealink Code Generator', desc: 'Search and generate phone config codes with live variable substitution.' },
  { id: 'symptom',   label: 'Symptom Wizard',         desc: 'Step-by-step troubleshooting for calls not ringing, dropping, or audio issues.' },
  { id: 'ports',     label: 'Port Checklist',         desc: 'Required SIP and RTP ports by platform — NetSapiens, Meta, Zultys, Algo.' },
  { id: 'algo',      label: 'Algo Config Builder',    desc: 'Generate SIP registration and multicast config for Algo paging units.' },
  { id: 'quickcard', label: 'Quick Card Generator',   desc: 'Build and print a phone reference card for end users at go-live.' },
  { id: 'codec',     label: 'Codec & QoS Reference',  desc: 'Codec bandwidth specs, DSCP values, QoS tips, and SIP response codes.' },
]

export default function HomeHub({ onOpenJob, onOpenAccount, onOpenTool, refreshKey }) {
  const jobs = useMemo(() => {
    try { return listJobs().slice(0, 4) } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const accounts = useMemo(() => {
    try { return listAccounts().slice(0, 4) } catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <div className="home-root">

      {/* ── Top panels: Jobs + Accounts ──────────────────────────────────── */}
      <div className="home-panels">

        <div className="home-panel">
          <div className="home-panel-head">
            <div className="home-panel-title">Jobs</div>
            <div className="home-panel-desc">Field installs — site survey, system design, go-live</div>
          </div>
          <div className="home-panel-actions">
            <button
              type="button"
              className="home-cta-btn"
              onClick={() => onOpenJob(null, 'new')}
            >
              New Job
            </button>
            <button
              type="button"
              className="home-secondary-btn"
              onClick={() => onOpenJob(null, 'list')}
            >
              All Jobs
            </button>
          </div>
          {jobs.length > 0 && (
            <div className="home-recents">
              <div className="home-recents-label">Recent</div>
              {jobs.map(j => (
                <button
                  key={j.id}
                  type="button"
                  className="home-recent-row"
                  onClick={() => onOpenJob(j.id)}
                >
                  <span className="home-recent-name">{j.customer || 'Unnamed job'}</span>
                  {j.site && <span className="home-recent-site">{j.site}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="home-panel">
          <div className="home-panel-head">
            <div className="home-panel-title">Accounts</div>
            <div className="home-panel-desc">Call flow charts and account-level documentation</div>
          </div>
          <div className="home-panel-actions">
            <button
              type="button"
              className="home-cta-btn"
              onClick={() => onOpenAccount(null, 'new')}
            >
              New Account
            </button>
            <button
              type="button"
              className="home-secondary-btn"
              onClick={() => onOpenAccount(null, 'list')}
            >
              All Accounts
            </button>
          </div>
          {accounts.length > 0 && (
            <div className="home-recents">
              <div className="home-recents-label">Recent</div>
              {accounts.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className="home-recent-row"
                  onClick={() => onOpenAccount(a.id)}
                >
                  <span className="home-recent-name">{a.name || 'Unnamed account'}</span>
                  {a.site && <span className="home-recent-site">{a.site}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Tools grid ────────────────────────────────────────────────────── */}
      <div className="home-tools-section">
        <div className="home-tools-heading">
          <span className="home-tools-title">Tools</span>
          <span className="home-tools-desc">Diagnostics, references, and config generators</span>
        </div>
        <div className="home-tools-grid">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              type="button"
              className="home-tool-card"
              onClick={() => onOpenTool(tool.id)}
            >
              <div className="home-tool-name">{tool.label}</div>
              <div className="home-tool-desc">{tool.desc}</div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
