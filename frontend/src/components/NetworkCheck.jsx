/**
 * Network Check — Visualware results interpreter + STUN connection identity.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  NetworkManualEntry,
  NetworkScoreStrip,
  NetworkVerdictCard,
  buildNetworkSummaryText,
} from './NetworkShared.jsx'
import { computeVerdict, NETWORK_RUN_COUNT } from '../lib/networkReadiness.js'
import {
  VISUALWARE_VOIP_TEST_URL,
  buildVerdictActions,
  formatNatSummary,
  isBrowserOffline,
  probeNat,
} from '../lib/networkProbes.js'
import {
  getActiveJobId,
  getJob,
  loadJobSurvey,
  saveJobSurvey,
} from '../lib/jobModel.js'

const EMPTY_MANUAL = {
  downMbps: '',
  upMbps: '',
  jitter: '',
  loss: '',
  mos: '',
  sipAlg: '',
  seats: '1',
}

export default function NetworkCheck() {
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [natState, setNatState] = useState({ status: 'idle' })
  const [saveNote, setSaveNote] = useState(null)
  const [copyNote, setCopyNote] = useState(null)
  const [ipFlash, setIpFlash] = useState('')
  const [activeJob, setActiveJob] = useState(null)

  useEffect(() => {
    try {
      const id = getActiveJobId()
      const job = id ? getJob(id) : null
      setActiveJob(job || null)
      if (job) {
        const survey = loadJobSurvey(job.id)
        const seats = survey?.phoneCount || ''
        if (seats) setManual(m => ({ ...m, seats: String(seats) }))
      }
    } catch {
      setActiveJob(null)
    }
  }, [])

  const seats = Math.max(1, Number(manual.seats) || 1)

  const verdict = useMemo(() => computeVerdict({
    upMbps: manual.upMbps,
    downMbps: manual.downMbps,
    loss: manual.loss,
    jitter: manual.jitter,
    mos: manual.mos,
    sipAlg: manual.sipAlg,
  }, seats), [manual, seats])

  const actions = useMemo(
    () => buildVerdictActions(verdict, manual),
    [verdict, manual],
  )

  async function runNatProbe() {
    setNatState({ status: 'running' })
    if (isBrowserOffline()) {
      setNatState({ status: 'offline', nat: { offline: true } })
      return
    }
    try {
      const nat = await probeNat()
      setNatState({ status: 'done', nat })
    } catch (err) {
      setNatState({ status: 'error', error: err?.message || String(err) })
    }
  }

  async function copyPublicIp() {
    const ip = natState.nat?.publicIp
    if (!ip) return
    try {
      await navigator.clipboard.writeText(ip)
      setIpFlash('Copied')
      setTimeout(() => setIpFlash(''), 1500)
    } catch {
      setIpFlash('Failed')
      setTimeout(() => setIpFlash(''), 1500)
    }
  }

  async function saveIntoSurvey() {
    const id = getActiveJobId()
    if (!id) {
      setSaveNote({ type: 'error', text: 'No active job — open a job first.' })
      return
    }
    try {
      const survey = loadJobSurvey(id)
      const visualwareRuns = [...(survey.visualwareRuns || [])]
      while (visualwareRuns.length < NETWORK_RUN_COUNT) visualwareRuns.push({})
      let slot = visualwareRuns.findIndex(r => !String(r?.jitterOut || r?.rawPaste || r?.overall || '').trim())
      if (slot < 0) slot = 0
      const stamp = new Date().toISOString()
      const summary = buildNetworkSummaryText({
        verdict,
        manual,
        natText: formatNatSummary(natState.nat),
        actions,
      })
      visualwareRuns[slot] = {
        ...visualwareRuns[slot],
        downMbps: manual.downMbps,
        upMbps: manual.upMbps,
        jitterOut: manual.jitter,
        jitterIn: manual.jitter,
        lossOut: manual.loss,
        lossIn: manual.loss,
        mosOut: manual.mos,
        mosIn: manual.mos,
        sipAlg: manual.sipAlg,
        overall: verdict.status === 'pass' ? 'Pass' : verdict.status === 'fail' ? 'Fail' : 'Watch',
        rawPaste: [`Network Check save ${stamp}`, summary].join('\n'),
      }

      const speedtests = [...(survey.speedtests || [])]
      while (speedtests.length < NETWORK_RUN_COUNT) speedtests.push({})
      let stSlot = speedtests.findIndex(r => !String(r?.downloadMbps || r?.uploadMbps || '').trim())
      if (stSlot < 0) stSlot = 0
      speedtests[stSlot] = {
        ...speedtests[stSlot],
        downloadMbps: manual.downMbps || speedtests[stSlot].downloadMbps,
        uploadMbps: manual.upMbps || speedtests[stSlot].uploadMbps,
        notes: [speedtests[stSlot].notes, `Network Check ${stamp}`].filter(Boolean).join(' · '),
        testedAt: speedtests[stSlot].testedAt || stamp.slice(0, 16),
      }

      await saveJobSurvey(id, {
        ...survey,
        visualwareRuns,
        speedtests,
        phoneCount: String(seats),
      })
      setSaveNote({ type: 'ok', text: `Saved into job survey as run ${slot + 1}.` })
      setActiveJob(getJob(id))
    } catch (err) {
      console.error(err)
      setSaveNote({ type: 'error', text: 'Could not save into the active job survey.' })
    }
  }

  async function copySummary() {
    const text = buildNetworkSummaryText({
      verdict,
      manual,
      natText: formatNatSummary(natState.nat),
      actions,
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopyNote({ type: 'ok', text: 'Summary copied.' })
    } catch {
      setCopyNote({ type: 'error', text: 'Could not copy — select and copy manually.' })
    }
  }

  const natBusy = natState.status === 'running'
  const nat = natState.nat

  return (
    <section className="cd-root nc-root">
      <div className="cd-header">
        <h2 className="cd-title">Network Check</h2>
        <p className="cd-subtitle">
          Interpret Visualware VoIP test results — enter the numbers, get a verdict and next actions.
        </p>
      </div>

      <section className="nc-section nc-primary" aria-label="Run the real tests">
        <div className="nc-section-head">
          <h3>Run the real tests</h3>
        </div>
        <ol className="nc-steps">
          <li>
            Run the Visualware VoIP test
            {' '}
            <a
              className="btn btn-primary nc-inline-open"
              href={VISUALWARE_VOIP_TEST_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Visualware
            </a>
          </li>
          <li>Enter the results below</li>
          <li>Get the verdict</li>
        </ol>
        <NetworkManualEntry values={manual} onChange={setManual} />
      </section>

      <section className="nc-section" aria-label="Verdict">
        <div className="nc-section-head">
          <h3>Verdict</h3>
        </div>
        <NetworkScoreStrip
          jitter={manual.jitter}
          loss={manual.loss}
          mos={manual.mos}
          callsLabel={verdict.callsSupported != null
            ? `${verdict.callsSupported}/${verdict.callsNeeded}`
            : '-'}
        />
        <NetworkVerdictCard verdict={verdict} manual={manual} />
        <div className="btn-row" style={{ marginTop: 12 }}>
          {activeJob ? (
            <button type="button" className="btn btn-primary" onClick={saveIntoSurvey}>
              Save into active job&apos;s survey
            </button>
          ) : (
            <span className="nc-no-job">No active job — open a job to save results into its survey.</span>
          )}
          <button type="button" className="btn btn-secondary" onClick={copySummary}>
            Copy summary
          </button>
        </div>
        {saveNote && (
          <div className={saveNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
            {saveNote.text}
          </div>
        )}
        {copyNote && (
          <div className={copyNote.type === 'ok' ? 'parse-note parse-ok' : 'parse-note parse-error'}>
            {copyNote.text}
          </div>
        )}
      </section>

      <section className="nc-section" aria-label="Connection identity">
        <div className="nc-section-head">
          <h3>Connection identity</h3>
          <p>STUN-based public IP and NAT behavior — useful for firewall allowlists, not a voice-path quality test.</p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={runNatProbe}
            disabled={natBusy}
          >
            {natBusy ? 'Checking…' : 'Check public IP / NAT'}
          </button>
        </div>

        {natState.status === 'offline' && (
          <div className="parse-note parse-error">Offline — connection identity unavailable.</div>
        )}
        {natState.status === 'error' && (
          <div className="parse-note parse-error">{natState.error}</div>
        )}
        {natState.status === 'done' && nat && (
          <div className="nc-probe-results">
            {nat.error ? (
              <div className="nc-probe-card"><p>{nat.error}</p></div>
            ) : (
              <>
                <div className="nc-probe-card">
                  <strong>Public IP</strong>
                  <p className="nc-ip-row">
                    <span className="cd-mono">{nat.publicIp || '—'}</span>
                    {nat.publicIp ? (
                      <button type="button" className="btn btn-secondary" onClick={copyPublicIp}>
                        {ipFlash || 'Copy IP'}
                      </button>
                    ) : null}
                  </p>
                  <p className="nc-probe-hint">
                    VoIP implication: carrier / SBC allowlists and geo checks often key off this address.
                  </p>
                </div>
                <div className="nc-probe-card">
                  <strong>NAT behavior</strong>
                  <p>
                    {nat.hasSrflx
                      ? 'srflx candidates present — STUN can see a public mapping.'
                      : 'No srflx — STUN may be blocked or the path is unusually restricted.'}
                  </p>
                  <p className="nc-probe-hint">
                    VoIP implication: missing srflx often means firewall or symmetric filtering will need an SBC or RTP relay.
                  </p>
                </div>
                <div className="nc-probe-card">
                  <strong>Symmetric NAT</strong>
                  {nat.symmetricSuspect ? (
                    <>
                      <p className="nc-probe-warn">Suspected — STUN bindings disagree across servers.</p>
                      <p className="nc-probe-hint">
                        VoIP implication: hosted seats behind symmetric NAT usually need an SBC or provider media relay for reliable two-way audio.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Not suspected from this STUN sample.</p>
                      <p className="nc-probe-hint">
                        VoIP implication: typical full-cone / port-restricted NAT is fine for outbound hosted RTP.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </section>
  )
}
