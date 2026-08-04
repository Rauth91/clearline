/**
 * Call Analysis — why did this call fail.
 * One dropzone for NetSapiens CSV or classic .pcap / .pcapng → shared SIP ladder.
 */

import { useMemo, useState } from 'react'
import { PCAP_MAX_BYTES } from '../lib/pcap.js'
import { parseCapture } from '../lib/sipLadder.js'
import { AnalysisView, CallPicker } from './callAnalysisUi.jsx'
import Dropzone from './Dropzone.jsx'

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function AudioStreamsTable({ streams }) {
  if (!streams?.length) {
    return (
      <div className="cd-streams">
        <div className="cd-section-label">Audio streams</div>
        <p className="cd-streams-empty">No RTP streams detected in this capture.</p>
      </div>
    )
  }
  return (
    <div className="cd-streams">
      <div className="cd-section-label">Audio streams</div>
      <div className="cd-streams-table-wrap">
        <table className="cd-streams-table" aria-label="RTP audio streams">
          <thead>
            <tr>
              <th>Stream</th>
              <th>Direction</th>
              <th>Codec</th>
              <th>Packets</th>
              <th>Loss</th>
              <th>Jitter</th>
            </tr>
          </thead>
          <tbody>
            {streams.map(s => (
              <tr key={s.key}>
                <td className="cd-mono">SSRC {s.ssrc.toString(16)}</td>
                <td>{s.direction}</td>
                <td>{s.codec}</td>
                <td>{s.packetCount}</td>
                <td className={s.lossPct > 1 ? 'is-err' : ''}>{s.lossPct.toFixed(1)}%</td>
                <td className={s.jitterMs > 30 ? 'is-warn' : ''}>{s.jitterMs.toFixed(1)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function runInWorker(buffer, onProgress) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = new Worker(new URL('../lib/pcapWorker.js', import.meta.url), { type: 'module' })
    } catch (err) {
      reject(err)
      return
    }
    worker.onmessage = (ev) => {
      const msg = ev.data || {}
      if (msg.type === 'progress') {
        onProgress?.(msg.pct)
        return
      }
      worker.terminate()
      if (msg.type === 'error') {
        reject(Object.assign(new Error(msg.message), { code: msg.code }))
        return
      }
      if (msg.type === 'done') resolve(msg.result)
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }
    worker.postMessage({ type: 'parse', buffer }, [buffer])
  })
}

const PCAP_MAGICS_BE = new Set([0xa1b2c3d4, 0xa1b23c4d, 0x0a0d0d0a])
const PCAP_MAGICS_LE = new Set([0xd4c3b2a1, 0x4d3cb2a1])

async function looksLikePcap(file) {
  const name = String(file?.name || '').toLowerCase()
  if (/\.(pcap|pcapng|cap)$/.test(name)) return true
  if (/\.(csv|txt|tsv)$/.test(name)) return false
  if (file.type && /csv|text\//.test(file.type)) return false
  try {
    const slice = await file.slice(0, 4).arrayBuffer()
    if (slice.byteLength < 4) return false
    const view = new DataView(slice)
    const be = view.getUint32(0, false)
    const le = view.getUint32(0, true)
    return PCAP_MAGICS_BE.has(be) || PCAP_MAGICS_LE.has(le)
  } catch {
    return false
  }
}

export default function CallAnalysis() {
  const [input, setInput] = useState('')
  const [fileMeta, setFileMeta] = useState(null)
  const [source, setSource] = useState(null) // 'csv' | 'pcap'
  const [calls, setCalls] = useState(null)
  const [meta, setMeta] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [err, setErr] = useState(null)
  const [picking, setPicking] = useState(false)

  const selected = useMemo(
    () => (calls || []).find(c => c.callId === selectedId) || null,
    [calls, selectedId],
  )

  function applyCalls(nextCalls, nextSource) {
    setSource(nextSource)
    setCalls(nextCalls)
    if (nextCalls.length === 1) {
      setSelectedId(nextCalls[0].callId)
      setPicking(false)
    } else {
      setSelectedId(null)
      setPicking(true)
    }
  }

  function runCsv(text) {
    const raw = text ?? input
    const result = parseCapture(raw)
    if (result.error) {
      setErr(`Line ${result.error.line}: ${result.error.reason}`)
      setCalls(null)
      setSelectedId(null)
      setSource(null)
      return
    }
    if (!result.calls.length) {
      setErr('No SIP calls found in this export.')
      setCalls(null)
      setSelectedId(null)
      setSource(null)
      return
    }
    setErr(null)
    setMeta(null)
    setFileMeta(null)
    applyCalls(result.calls, 'csv')
  }

  async function ingestPcap(file, onProgress) {
    setErr(null)
    setCalls(null)
    setSelectedId(null)
    setPicking(false)
    setMeta(null)
    setInput('')
    setFileMeta({ name: file.name, size: file.size })

    if (file.size > PCAP_MAX_BYTES) {
      const message = `File is ${formatBytes(file.size)} — over the 100 MB limit. In Wireshark filter with \`udp && (sip || rtp)\`, then File → Export Specified Packets and retry.`
      setErr(message)
      throw new Error(message)
    }

    onProgress?.(0.05)
    const buffer = await file.arrayBuffer()
    const result = await runInWorker(buffer, (pct) => {
      onProgress?.(Math.min(0.99, (Number(pct) || 0) / 100))
    })
    onProgress?.(1)

    setMeta({
      skippedTcpIpv6: result.skippedTcpIpv6 || 0,
      sipPacketCount: result.sipPacketCount || 0,
    })
    if (!result.calls?.length) {
      const message = 'No SIP or RTP VoIP traffic found in this capture.'
      setErr(message)
      throw new Error(message)
    }
    setErr(null)
    applyCalls(result.calls, 'pcap')
    return { callCount: result.calls.length, name: file.name }
  }

  async function ingestUpload(file, onProgress) {
    const pcap = await looksLikePcap(file)
    if (pcap) return ingestPcap(file, onProgress)

    onProgress?.(0.2)
    const text = await file.text()
    onProgress?.(0.7)
    setInput(text)
    setFileMeta({ name: file.name, size: file.size })
    runCsv(text)
    onProgress?.(1)
    return { bytes: text.length, name: file.name }
  }

  function clear() {
    setInput('')
    setFileMeta(null)
    setSource(null)
    setCalls(null)
    setMeta(null)
    setSelectedId(null)
    setErr(null)
    setPicking(false)
  }

  const showInput = !calls || (picking && !selected)

  return (
    <section className="cd-root ca-root">
      <div className="cd-header">
        <h2 className="cd-title">Call Analysis</h2>
        <p className="cd-subtitle">
          Drop a NetSapiens Call History CSV or a classic Wireshark <strong>.pcap</strong>.
          Same ladder, same findings — CSV for signaling story, pcap when you need RTP loss and jitter.
        </p>
        <p className="cd-timing-note">
          CSV timing is <strong>SIP signaling only</strong>. Jitter, packet loss, and MOS need a packet capture.
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
                title="Call capture"
                subtitle={`CSV or .pcap / .cap · max ${formatBytes(PCAP_MAX_BYTES)} for pcap`}
                accept=".csv,.txt,.pcap,.pcapng,.cap,text/csv,text/plain,application/vnd.tcpdump.pcap,application/octet-stream"
                maxFiles={1}
                maxBytes={PCAP_MAX_BYTES}
                onUpload={async (file, { onProgress }) => ingestUpload(file, onProgress)}
              />

              {fileMeta && (
                <p className="pc-file-meta" aria-live="polite">
                  <strong>{fileMeta.name}</strong>
                  {' · '}
                  {formatBytes(fileMeta.size)}
                </p>
              )}

              <p className="cd-or">or paste a NetSapiens CSV below</p>
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
                  onClick={() => runCsv(input)}
                  disabled={!input.trim()}
                >
                  Analyze CSV
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
          note={source === 'pcap'
            ? [
              selected.pcapNote,
              meta?.skippedTcpIpv6
                ? `${meta.skippedTcpIpv6} packets skipped (TCP/IPv6).`
                : null,
            ].filter(Boolean).join(' ') || null
            : null}
          beforeLadder={source === 'pcap'
            ? <AudioStreamsTable streams={selected.audioStreams} />
            : null}
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
