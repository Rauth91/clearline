/**
 * AlgoConfig — Algo paging unit config builder
 * Generates ready-to-paste config for Algo devices + matching Yealink paging key
 */

import { useState } from 'react'

const ALGO_MODELS = [
  { id: '8180', label: '8180 — SIP Audio Alerter', hasRelay: false, hasMic: false },
  { id: '8186', label: '8186 — SIP Ceiling Speaker', hasRelay: false, hasMic: false },
  { id: '8188', label: '8188 — SIP Outdoor Speaker', hasRelay: false, hasMic: false },
  { id: '8190', label: '8190 — SIP Intercom / Door Station', hasRelay: true, hasMic: true },
  { id: '8028', label: '8028 — SIP Door Phone', hasRelay: true, hasMic: true },
  { id: '8373', label: '8373 — SIP Strobe/Horn', hasRelay: false, hasMic: false },
  { id: '8301', label: '8301 — Paging Adapter (analog)', hasRelay: false, hasMic: false },
]

const CODECS = ['G.711 PCMU (recommended)', 'G.711 PCMA', 'G.722']

const DEFAULT_MULTICAST = '224.1.1.1'
const DEFAULT_MCAST_PORT = '10000'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button type="button" className="ac-copy-btn" onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function AlgoConfig() {
  const [model, setModel] = useState('')
  const [ext, setExt] = useState('')
  const [password, setPassword] = useState('')
  const [sipProxy, setSipProxy] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [codec, setCodec] = useState(CODECS[0])
  const [multicastIp, setMulticastIp] = useState(DEFAULT_MULTICAST)
  const [multicastPort, setMulticastPort] = useState(DEFAULT_MCAST_PORT)
  const [useMulticast, setUseMulticast] = useState(true)
  const [ykKeyNum, setYkKeyNum] = useState('1')
  const [generated, setGenerated] = useState(false)

  const selectedModel = ALGO_MODELS.find(m => m.id === model)
  const codecShort = codec.startsWith('G.711 PCMU') ? 'PCMU' : codec.startsWith('G.711 PCMA') ? 'PCMA' : 'G722'

  function generate() {
    if (!model || !ext || !sipProxy) return
    setGenerated(true)
  }

  function reset() {
    setGenerated(false)
  }

  // Config blocks
  const algoSipConfig = `[SIP]
SIP_UserID = ${ext}
SIP_AuthID = ${ext}
SIP_AuthPassword = ${password || '<password>'}
SIP_DisplayName = ${displayName || ext}
SIP_ProxyServer = ${sipProxy}
SIP_RegistrarServer = ${sipProxy}
SIP_Transport = UDP
SIP_Port = 5060
SIP_Codec = ${codecShort}
SIP_DTMF = RFC2833`

  const algoMulticastConfig = `[Multicast]
Multicast_Enable = 1
Multicast_Listen_Address = ${multicastIp}
Multicast_Listen_Port = ${multicastPort}
Multicast_Priority = 1`

  const yealinkPageKey = `programablekey.${ykKeyNum}.type = 24
programablekey.${ykKeyNum}.value = ${multicastIp}:${multicastPort}
programablekey.${ykKeyNum}.label = Page All`

  const yealinkListenConfig = `multicastpaging.receive_priority.1 = 1
multicastpaging.listen_address.1.ip_address = ${multicastIp}:${multicastPort}
multicastpaging.listen_address.1.label = Paging`

  return (
    <div className="ac-root">
      <div className="ac-header">
        <div className="ac-title">Algo Paging Config Builder</div>
        <div className="ac-subtitle">Generate SIP registration and multicast settings for Algo devices and matching Yealink config</div>
      </div>

      {!generated ? (
        <div className="ac-form">
          <div className="ac-section-label">Device</div>
          <div className="ac-field">
            <label className="ac-label">Algo Model</label>
            <select className="ac-select" value={model} onChange={e => setModel(e.target.value)}>
              <option value="">Select model…</option>
              {ALGO_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="ac-section-label" style={{ marginTop: 24 }}>SIP Registration</div>
          <div className="ac-field-row">
            <div className="ac-field">
              <label className="ac-label">Extension / Username</label>
              <input
                className="ac-input"
                type="text"
                placeholder="e.g. 4001"
                value={ext}
                onChange={e => setExt(e.target.value)}
              />
            </div>
            <div className="ac-field">
              <label className="ac-label">SIP Password</label>
              <input
                className="ac-input"
                type="text"
                placeholder="SIP auth password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="ac-field-row">
            <div className="ac-field">
              <label className="ac-label">SIP Proxy / Server</label>
              <input
                className="ac-input"
                type="text"
                placeholder="e.g. sip.yourdomain.com"
                value={sipProxy}
                onChange={e => setSipProxy(e.target.value)}
              />
            </div>
            <div className="ac-field">
              <label className="ac-label">Display Name</label>
              <input
                className="ac-input"
                type="text"
                placeholder="e.g. Office Paging"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
          </div>
          <div className="ac-field">
            <label className="ac-label">Codec</label>
            <select className="ac-select" value={codec} onChange={e => setCodec(e.target.value)}>
              {CODECS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="ac-section-label" style={{ marginTop: 24 }}>Multicast Paging</div>
          <div className="ac-toggle-row">
            <label className="ac-toggle-label">
              <input
                type="checkbox"
                checked={useMulticast}
                onChange={e => setUseMulticast(e.target.checked)}
                className="ac-checkbox"
              />
              Enable multicast receive on Algo
            </label>
          </div>
          {useMulticast && (
            <div className="ac-field-row">
              <div className="ac-field">
                <label className="ac-label">Multicast Group IP</label>
                <input
                  className="ac-input"
                  type="text"
                  value={multicastIp}
                  onChange={e => setMulticastIp(e.target.value)}
                />
              </div>
              <div className="ac-field">
                <label className="ac-label">Multicast Port</label>
                <input
                  className="ac-input"
                  type="text"
                  value={multicastPort}
                  onChange={e => setMulticastPort(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="ac-section-label" style={{ marginTop: 24 }}>Yealink Paging Key</div>
          <div className="ac-field" style={{ maxWidth: 160 }}>
            <label className="ac-label">Programmable Key Number</label>
            <input
              className="ac-input"
              type="number"
              min="1"
              max="20"
              value={ykKeyNum}
              onChange={e => setYkKeyNum(e.target.value)}
            />
          </div>

          <div className="ac-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={generate}
              disabled={!model || !ext || !sipProxy}
            >
              Generate Config
            </button>
          </div>
        </div>
      ) : (
        <div className="ac-results">
          <div className="ac-result-intro">
            Config for <strong>{selectedModel?.label}</strong> · Extension <strong>{ext}</strong> · Proxy <strong>{sipProxy}</strong>
          </div>

          <div className="ac-block">
            <div className="ac-block-header">
              <span className="ac-block-title">Algo — SIP Registration (Web UI)</span>
              <CopyButton text={algoSipConfig} />
            </div>
            <div className="ac-block-note">Paste into Algo web UI → SIP Settings, or apply via config file.</div>
            <pre className="ac-code">{algoSipConfig}</pre>
          </div>

          {useMulticast && (
            <div className="ac-block">
              <div className="ac-block-header">
                <span className="ac-block-title">Algo — Multicast Listen</span>
                <CopyButton text={algoMulticastConfig} />
              </div>
              <div className="ac-block-note">Algo web UI → Multicast. Group IP and port must match Yealink paging key below.</div>
              <pre className="ac-code">{algoMulticastConfig}</pre>
            </div>
          )}

          {useMulticast && (
            <div className="ac-block">
              <div className="ac-block-header">
                <span className="ac-block-title">Yealink — Paging Key Config (Key {ykKeyNum})</span>
                <CopyButton text={yealinkPageKey} />
              </div>
              <div className="ac-block-note">Add to Yealink .cfg or enter in web UI → DSS Keys → Key {ykKeyNum}. Type = Multicast Paging (24).</div>
              <pre className="ac-code">{yealinkPageKey}</pre>
            </div>
          )}

          {useMulticast && (
            <div className="ac-block">
              <div className="ac-block-header">
                <span className="ac-block-title">Yealink — Multicast Listen Config</span>
                <CopyButton text={yealinkListenConfig} />
              </div>
              <div className="ac-block-note">Add to Yealink .cfg so phones receive pages sent to this multicast group.</div>
              <pre className="ac-code">{yealinkListenConfig}</pre>
            </div>
          )}

          <div className="ac-block ac-notes-block">
            <div className="ac-block-title">Deployment Notes</div>
            <ul className="ac-notes">
              <li>Multicast group must be the same on all Algo units and Yealink phones at this site.</li>
              <li>Verify IGMP snooping on managed switches allows multicast group <strong>{multicastIp}</strong> through all phone/Algo VLANs.</li>
              <li>Test with a direct SIP call to extension <strong>{ext}</strong> first, then verify multicast page activates the Algo.</li>
              {selectedModel?.hasRelay && <li>This model has a relay output — configure the relay action in Algo web UI under Relay/Output settings.</li>}
              {selectedModel?.hasMic && <li>This model has a microphone — test two-way audio after SIP registration.</li>}
            </ul>
          </div>

          <div className="ac-actions">
            <button type="button" className="btn btn-secondary" onClick={reset}>Edit Config</button>
          </div>
        </div>
      )}
    </div>
  )
}
