/**
 * CallDiagnostic — NetSapiens SIP capture → call story, findings, ladder.
 */

import { useMemo, useState } from 'react'
import { parseCapture } from '../lib/sipLadder.js'
import {
  AnalysisView,
  CallPicker,
} from './callAnalysisUi.jsx'
import Dropzone from './Dropzone.jsx'

export default function CallDiagnostic() {
  const [input, setInput] = useState('')
  const [calls, setCalls] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [err, setErr] = useState(null)
  const [picking, setPicking] = useState(false)

  const selected = useMemo(
    () => (calls || []).find(c => c.callId === selectedId) || null,
    [calls, selectedId],
  )

  function run(text) {
    const raw = text ?? input
    const result = parseCapture(raw)
    if (result.error) {
      setErr(`Line ${result.error.line}: ${result.error.reason}`)
      setCalls(null)
      setSelectedId(null)
      return
    }
    if (!result.calls.length) {
      setErr('No SIP calls found in this export.')
      setCalls(null)
      setSelectedId(null)
      return
    }
    setErr(null)
    setCalls(result.calls)
    if (result.calls.length === 1) {
      setSelectedId(result.calls[0].callId)
      setPicking(false)
    } else {
      setSelectedId(null)
      setPicking(true)
    }
  }

  function clear() {
    setInput('')
    setCalls(null)
    setSelectedId(null)
    setErr(null)
    setPicking(false)
  }

  const showInput = !calls || (picking && !selected)

  return (
    <section className="cd-root">
      <div className="cd-header">
        <h2 className="cd-title">Call Diagnostic</h2>
        <p className="cd-subtitle">
          NetSapiens Call History → Export → upload or paste the CSV. Timing, routing story, and a real SIP ladder.
        </p>
        <p className="cd-timing-note">
          Timing shown here is <strong>SIP signaling only</strong> — it reflects when messages were exchanged, not media quality. Jitter, packet loss, and MOS live in the RTP stream; use Packet Capture to analyze those.
        </p>
      </div>

      {showInput && (
        <div className="cd-input-area">
          {calls && picking ? (
            <CallPicker
              calls={calls}
              onSelect={call => {
                setSelectedId(call.callId)
                setPicking(false)
              }}
            />
          ) : (
            <>
              <Dropzone
                title="Call history CSV"
                subtitle="NetSapiens Call History export · or paste below"
                accept=".csv,.txt,text/csv,text/plain"
                maxFiles={1}
                onUpload={async (file, { onProgress }) => {
                  onProgress(0.2)
                  const text = await file.text()
                  onProgress(0.7)
                  setInput(text)
                  run(text)
                  onProgress(1)
                  return { bytes: text.length }
                }}
              />
              <p className="cd-or">or paste the CSV below</p>
              <textarea
                className="cd-textarea"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Paste CSV (Time Stamp, Index, Type, Text, Host, UnixTsm)…"
                spellCheck={false}
              />
              {err && <div className="cd-error-msg">{err}</div>}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => run(input)}
                  disabled={!input.trim()}
                >
                  Analyze call
                </button>
                <button type="button" className="btn btn-secondary" onClick={clear}>
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {selected && !picking && (
        <AnalysisView
          call={selected}
          multi={(calls || []).length > 1}
          onBack={clear}
          onPickOther={() => {
            setSelectedId(null)
            setPicking(true)
          }}
        />
      )}
    </section>
  )
}
