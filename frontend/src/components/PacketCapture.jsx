/**
 * Packet Capture — Wireshark-style VoIP pcap analyzer (classic libpcap).
 */

import { useEffect, useMemo, useState } from 'react'
import { AnalysisView, CallPicker } from './callAnalysisUi.jsx'
import { PCAP_MAX_BYTES } from '../lib/pcap.js'
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

export default function PacketCapture() {
  const [fileMeta, setFileMeta] = useState(null)
  const [calls, setCalls] = useState(null)
  const [meta, setMeta] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [err, setErr] = useState(null)
  const [picking, setPicking] = useState(false)

  const selected = useMemo(
    () => (calls || []).find(c => c.callId === selectedId) || null,
    [calls, selectedId],
  )

  useEffect(() => () => {
    // noop cleanup placeholder
  }, [])

  async function ingestFile(file, onProgress) {
    if (!file) return null
    setErr(null)
    setCalls(null)
    setSelectedId(null)
    setPicking(false)
    setMeta(null)
    setFileMeta({ name: file.name, size: file.size })

    if (file.size > PCAP_MAX_BYTES) {
      const message = `File is ${formatBytes(file.size)} — over the 100 MB limit. In Wireshark filter with \`udp && (sip || rtp)\`, then File → Export Specified Packets and retry.`
      setErr(message)
      throw new Error(message)
    }

    onProgress?.(0.05)
    const buffer = await file.arrayBuffer()
    const result = await runInWorker(buffer, (pct) => {
      // Worker reports 0–100; Dropzone expects 0–1
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
    setCalls(result.calls)
    if (result.calls.length === 1) {
      setSelectedId(result.calls[0].callId)
      setPicking(false)
    } else {
      setSelectedId(null)
      setPicking(true)
    }
    return { callCount: result.calls.length, name: file.name }
  }

  function clear() {
    setFileMeta(null)
    setCalls(null)
    setMeta(null)
    setSelectedId(null)
    setErr(null)
    setPicking(false)
  }

  const showInput = !calls || (picking && !selected)

  return (
    <section className="cd-root pc-root">
      <div className="cd-header">
        <h2 className="cd-title">Packet Capture</h2>
        <p className="cd-subtitle">
          Drop a classic Wireshark <strong>.pcap</strong> (not pcapng) of a call. SIP ladder + RTP loss/jitter without leaving ClearLine.
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
                title="Packet capture"
                subtitle={`Classic .pcap / .cap · max ${formatBytes(PCAP_MAX_BYTES)}`}
                accept=".pcap,.pcapng,.cap,application/vnd.tcpdump.pcap,application/octet-stream"
                maxFiles={1}
                maxBytes={PCAP_MAX_BYTES}
                onUpload={async (file, { onProgress }) => ingestFile(file, onProgress)}
              />

              {fileMeta && (
                <p className="pc-file-meta" aria-live="polite">
                  <strong>{fileMeta.name}</strong>
                  {' · '}
                  {formatBytes(fileMeta.size)}
                </p>
              )}

              {err && <div className="cd-error-msg">{err}</div>}

              <div className="btn-row">
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
          note={[
            selected.pcapNote,
            meta?.skippedTcpIpv6
              ? `${meta.skippedTcpIpv6} packets skipped (TCP/IPv6).`
              : null,
          ].filter(Boolean).join(' ') || null}
          beforeLadder={<AudioStreamsTable streams={selected.audioStreams} />}
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
