/**
 * Tools → Troubleshoot: SymptomWizard + lazy Call Diagnostic on escalate.
 */

import { lazy, Suspense, useState } from 'react'
import SymptomWizard from './SymptomWizard.jsx'

const CallDiagnostic = lazy(() => import('./CallDiagnostic.jsx'))

function mentionsCallDiagnostic(text) {
  return /call\s*diagnostic/i.test(String(text || ''))
}

export default function ToolsTroubleshoot() {
  const [showDiag, setShowDiag] = useState(false)

  return (
    <div className="tools-page tools-troubleshoot">
      <header className="tools-page-header">
        <div className="survey-kicker">Tools</div>
        <h1>Troubleshoot</h1>
        <p>Walk the symptom tree, or open Call Diagnostic / Packet Capture from Home when you have a capture.</p>
      </header>

      <div className="tools-page-body">
        <SymptomWizard
          renderEscalateAction={(escalate) => (
            mentionsCallDiagnostic(escalate) ? (
              <button
                type="button"
                className="btn btn-primary sw-diag-btn"
                onClick={() => setShowDiag(true)}
              >
                Open Call Diagnostic
              </button>
            ) : null
          )}
        />

        {showDiag && (
          <div className="tools-diag-inline" id="call-diagnostic">
            <div className="tools-diag-inline-head">
              <h2>Call Diagnostic</h2>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDiag(false)}
              >
                Hide
              </button>
            </div>
            <Suspense fallback={<div className="workspace-loading">Loading Call Diagnostic…</div>}>
              <CallDiagnostic />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
