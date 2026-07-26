/**
 * CarrierTemplates — SIP trunk config reference per carrier.
 * Covers: auth method, codec order, caller ID headers, SBC/IP ranges,
 * T.38 support, registration interval, and a ready-to-reference notes block.
 */

import { useState } from 'react'

// ─── Carrier Data ─────────────────────────────────────────────────────────────

const CARRIERS = [
  {
    id: 'netsapiens',
    label: 'NetSapiens (hosted)',
    category: 'Hosted platform',
    authMethod: 'Registration (SIP REGISTER)',
    authNotes: 'Each subscriber registers to the NS domain. IP-auth available at the domain level for on-site SBCs — contact NS support to enable.',
    registrationInterval: '3600s (default)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.722', 'G.729 (optional, requires license)'],
    codecOrder: 'PCMU preferred. Avoid G.729 unless bandwidth is truly constrained — it destroys DTMF tones and adds codec transcoding delay.',
    callerIdHeaders: ['From', 'P-Asserted-Identity', 'Remote-Party-ID'],
    callerIdNotes: 'NS sends PAI for outbound caller ID. Ensure the SBC/phone trusts PAI. RPID is also sent for legacy compatibility.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [5061] },
    rtpRange: '10000–20000 (default, configurable per domain)',
    t38: 'Supported. Enable T.38 per domain in NS admin → Domain → Fax. Carrier re-INVITEs with m=image on CNG tone detection.',
    sbcIps: 'Varies by NS cluster. Check your NS portal → Admin → SBC for the assigned SBC IPs.',
    cnameIps: [],
    sipProxy: 'Your NS domain FQDN (e.g. customer.yourdomain.net)',
    notes: [
      'SIP ALG must be disabled on any edge router.',
      'UDP session timeout on NAT device must be ≥ 7200s (2 × 3600s reg interval).',
      'NS uses SIP UPDATE for mid-call hold — some older ATAs reject UPDATE. Verify phone firmware.',
      'Multicast paging (Algo) works natively when phones and Algo are on the same VLAN/subnet.',
      'NS does not send OPTIONS keep-alives by default — phones rely on registration refresh.',
    ],
    configSnippet: `; Yealink phone — NS registration
account.1.sip_server.1.address = <your-ns-domain>
account.1.sip_server.1.port = 5060
account.1.sip_server.1.transport_type = 0  ; 0=UDP
account.1.label = <extension>
account.1.display_name = <display name>
account.1.auth_name = <extension>
account.1.user_name = <extension>
account.1.password = <sip-password>
account.1.codec.1.payload_type = PCMU
account.1.codec.2.payload_type = PCMA
account.1.codec.3.payload_type = G722`,
  },
  {
    id: 'twilio',
    label: 'Twilio Elastic SIP Trunking',
    category: 'SIP trunk / PSTN',
    authMethod: 'IP Authentication (recommended) or Credential List (username/password)',
    authNotes: 'Twilio strongly recommends IP auth for security. Add your SBC/router WAN IP to the trunk\'s Allowed Sources. Credential lists are available but IP auth is preferred.',
    registrationInterval: 'N/A (IP auth) or 600s (credential auth)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.722', 'Opus (WebRTC only)', 'G.729 (inbound only, no license needed)'],
    codecOrder: 'PCMU/PCMA for PSTN. Twilio transcodes to G.711 for PSTN legs — do not use G.729 on the SBC→Twilio leg.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'Twilio passes through the From header caller ID if the number is verified. PAI is used for outbound CNAM. Unverified DIDs will be rejected — all calling numbers must be purchased or verified in your Twilio account.',
    sipPorts: { udp: [5060, 5004], tcp: [5060], tls: [5061] },
    rtpRange: '10000–20000 (Twilio media servers)',
    t38: 'Supported (T.38 pass-through). Enable on the SIP trunk settings in Twilio Console. Twilio does not originate T.38 — it re-INVITEs on CNG detection only if T.38 is enabled.',
    sbcIps: [],
    cnameIps: ['pstn.twilio.com', 'sip.twilio.com'],
    sipProxy: 'pstn.twilio.com (or your termination URI from the console)',
    notes: [
      'Twilio uses FQDN-based routing — do not hard-code IPs. Their media IPs can change.',
      'SIP domain format: <trunk-name>.pstn.twilio.com',
      'Twilio requires ACK to be routed back through the same SBC — do not use symmetric response routing without verifying ACK path.',
      'Twilio\'s RTP media comes from AWS us-east-1 or us-west-2 regions depending on your account region.',
      '911 (Kari\'s Law) — Twilio E911 requires address registration per DID in the console.',
      'Outbound: send INVITE to pstn.twilio.com with request URI = +1NPANXXXXXX@pstn.twilio.com.',
    ],
    configSnippet: `; NS trunk config for Twilio (IP auth)
; In NS admin → Trunk → Add SIP Trunk:
Trunk URI:        pstn.twilio.com
Authentication:   IP-based (add NS SBC IP to Twilio Allowed Sources)
Codec preference: PCMU, PCMA
From user:        your Twilio DID (+1NPANXXXXXX)
; Ensure NS sends PAI with verified DID for outbound caller ID.`,
  },
  {
    id: 'bandwidth',
    label: 'Bandwidth (CLEC)',
    category: 'SIP trunk / PSTN',
    authMethod: 'IP Authentication',
    authNotes: 'Bandwidth uses IP-based authentication exclusively for SIP trunks. Your SBC WAN IP(s) must be registered in the Bandwidth portal under the SIP peer. No username/password auth available.',
    registrationInterval: 'N/A (IP auth only)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.729'],
    codecOrder: 'PCMU first. Bandwidth is a Tier 1 CLEC — media quality is high. Avoid G.729 on the trunk leg; use it only for internal WAN segments if needed.',
    callerIdHeaders: ['From', 'P-Asserted-Identity', 'P-Preferred-Identity'],
    callerIdNotes: 'Bandwidth passes PAI/PPI for CNAM and caller ID. The calling DID must be assigned to your SIP peer. STIR/SHAKEN attestation A is applied automatically for owned numbers.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [5061] },
    rtpRange: '1024–65535 (Bandwidth accepts wide range; restrict your SBC to send in your configured range)',
    t38: 'Supported — Bandwidth is a Tier 1 carrier with native T.38. Enable T.38 on your SIP peer in the Bandwidth portal. Bandwidth re-INVITEs with m=image on fax CNG detection.',
    sbcIps: [
      '216.82.224.0/24 (West)',
      '216.82.225.0/24 (East)',
      '216.82.226.0/24 (secondary)',
    ],
    cnameIps: [],
    sipProxy: 'sip.bandwidth.com (or your provisioned SIP domain)',
    notes: [
      'SIP peer must have your SBC\'s WAN IP listed — no REGISTER is sent.',
      'Bandwidth uses a SIP OPTIONS ping for trunk keepalive — ensure OPTIONS is not blocked by your firewall.',
      'All DIDs must be assigned to the SIP peer before calls will route.',
      'E911 address registration is mandatory per DID — managed in the Bandwidth portal.',
      'Bandwidth supports STIR/SHAKEN natively. A-attestation for owned numbers, B/C for ported.',
      'Inbound calls arrive from Bandwidth SBC IPs above — allowlist all /24 ranges.',
    ],
    configSnippet: `; NS trunk config for Bandwidth (IP auth)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:       sip.bandwidth.com
Auth method:      IP (allowlist Bandwidth SBC IPs in NS firewall)
Codec:            PCMU, PCMA
; No REGISTER — Bandwidth sends INVITEs to your SBC IP.
; Add Bandwidth SBC /24 ranges to your firewall as allowed SIP sources.`,
  },
  {
    id: 'lingo',
    label: 'Lingo Networks',
    category: 'SIP trunk / PSTN',
    authMethod: 'Registration or IP Authentication (account dependent)',
    authNotes: 'Lingo supports both SIP registration and IP auth. Older accounts may use registration. Confirm with your Lingo account rep which mode is provisioned — the trunk config differs significantly.',
    registrationInterval: '3600s (registration mode)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.729'],
    codecOrder: 'PCMU preferred. Lingo passes G.711 to PSTN regardless of negotiated codec — transcoding happens on their side.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'PAI is used for outbound caller ID. Ensure the DID in From/PAI is assigned to your account.',
    sipPorts: { udp: [5060], tcp: [], tls: [] },
    rtpRange: '10000–20000 (verify with Lingo provisioning team for your account)',
    t38: 'Supported on Lingo Business accounts. Confirm T.38 is enabled on the trunk. Lingo re-INVITEs for T.38 when CNG is detected by their media gateways.',
    sbcIps: ['Contact Lingo provisioning for current SBC IP ranges'],
    cnameIps: [],
    sipProxy: 'Assigned at provisioning (e.g. sbc1.lingo.com) — check your account portal',
    notes: [
      'Lingo\'s SBC IPs are not publicly listed — obtain them from provisioning at time of account setup.',
      'Lingo uses UDP 5060 exclusively for most deployments — TCP/TLS must be explicitly requested.',
      'Confirm whether your account uses registration or IP auth before configuring the trunk.',
      'Test inbound and outbound before cutover — Lingo requires PSTN validation calls for new trunk setups.',
      'SIP ALG must be disabled at the customer edge.',
    ],
    configSnippet: `; NS trunk config for Lingo (registration mode)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:   <lingo-sbc-fqdn>
Auth:         Username + Password (from Lingo portal)
Codec:        PCMU, PCMA
Register:     Yes — 3600s
; Switch to IP auth if Lingo provisions your account that way.`,
  },
  {
    id: 'brightspeed',
    label: 'Brightspeed (formerly CenturyLink)',
    category: 'SIP trunk / PSTN (ILEC)',
    authMethod: 'IP Authentication',
    authNotes: 'Brightspeed SIP trunking uses IP auth. Your CPE (SBC or router) WAN IP must be registered with Brightspeed. No SIP REGISTER is sent.',
    registrationInterval: 'N/A (IP auth only)',
    codecs: ['G.711 PCMU', 'G.711 PCMA'],
    codecOrder: 'PCMU only on most Brightspeed SIP trunk deployments. PCMA offered as fallback. G.729 is generally not supported on ILEC SIP trunks — do not send it as primary.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'Brightspeed passes the From header DID as caller ID. PAI supported on newer deployments. Calling number must be in your assigned DID block.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [] },
    rtpRange: '16384–32767 (Brightspeed ILEC default; confirm with your provisioning doc)',
    t38: 'Supported on Brightspeed SIP — T.38 is enabled by default on most ILEC trunks. Brightspeed re-INVITEs for T.38 on fax CNG detection. Confirm T.38 capability on your account before relying on it.',
    sbcIps: ['Contact Brightspeed provisioning for your region\'s SBC IPs — varies by CLEC region and state'],
    cnameIps: [],
    sipProxy: 'Assigned by Brightspeed provisioning — typically a regional SBC FQDN or IP',
    notes: [
      'Brightspeed is an ILEC — provisioning timelines are longer than hosted carriers (days to weeks).',
      'SBC IPs are region-specific. Verify against your provisioning letter.',
      'Brightspeed SIP trunks may require a dedicated circuit (MPLS or broadband) — confirm transport type at sale.',
      'E911 routing is via the ILEC network — address assignment is handled at provisioning, not via a portal.',
      'STIR/SHAKEN: Brightspeed provides B-attestation for ported numbers and A-attestation for owned numbers.',
      'Test fax (T.38) before cutover — ILEC networks handle T.38 well but configuration must match exactly.',
    ],
    configSnippet: `; NS trunk config for Brightspeed (IP auth)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:   <brightspeed-sbc-ip-or-fqdn>
Auth:         IP-based (Brightspeed allowlists your WAN IP)
Codec:        PCMU, PCMA
Register:     No
; Firewall: allow inbound SIP/RTP from Brightspeed SBC IPs.
; Confirm RTP range 16384-32767 is open bidirectionally.`,
  },
  {
    id: 'cox',
    label: 'Cox Business SIP Trunking',
    category: 'SIP trunk / PSTN (CLEC/cable)',
    authMethod: 'IP Authentication',
    authNotes: 'Cox SIP trunking uses IP authentication. Your CPE WAN IP must be registered with Cox. Cox provisions a dedicated SIP trunk — no REGISTER flow.',
    registrationInterval: 'N/A (IP auth only)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.729'],
    codecOrder: 'PCMU first. Cox passes G.711 to the PSTN; G.729 may be offered but negotiate PCMU/PCMA on the trunk leg to avoid transcoding delays.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'Cox uses the From header for outbound caller ID. The calling number must be in your assigned DID block. PAI support depends on Cox regional configuration.',
    sipPorts: { udp: [5060, 5080], tcp: [5060], tls: [] },
    rtpRange: '10000–20000 (verify in your Cox provisioning doc)',
    t38: 'Supported on most Cox Business SIP trunks. T.38 must be enabled on the trunk in Cox provisioning. Cox re-INVITEs for T.38 on fax CNG detection.',
    sbcIps: ['Cox SBC IPs are region-specific — obtain from your Cox provisioning document'],
    cnameIps: [],
    sipProxy: 'Region-specific — provided by Cox at provisioning (e.g. sbc.coxbusiness.com variants)',
    notes: [
      'Cox SIP is available in Cox service territories only — verify coverage before selling.',
      'Provisioning requires Cox Business account — residential Cox service does not include SIP trunking.',
      'Cox uses SIP OPTIONS for trunk keep-alive — do not block OPTIONS on your firewall.',
      'E911 is provisioned by Cox at account setup. Address changes require a Cox support ticket.',
      'SIP port 5080 is used on some Cox regions — confirm with provisioning.',
      'SIP ALG must be disabled on the customer edge.',
    ],
    configSnippet: `; NS trunk config for Cox Business (IP auth)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:   <cox-sbc-fqdn-or-ip>
Auth:         IP-based (Cox allowlists your WAN IP)
Codec:        PCMU, PCMA
Register:     No
SIP port:     5060 (confirm 5080 if advised by Cox)
; Firewall: allow inbound INVITE from Cox SBC IPs on 5060/5080.`,
  },
  {
    id: 'comcast',
    label: 'Comcast Business SIP Trunking',
    category: 'SIP trunk / PSTN (CLEC/cable)',
    authMethod: 'IP Authentication',
    authNotes: 'Comcast Business SIP trunking uses IP auth exclusively. Your CPE WAN IP is registered with Comcast. SIP REGISTER is not used.',
    registrationInterval: 'N/A (IP auth only)',
    codecs: ['G.711 PCMU', 'G.711 PCMA'],
    codecOrder: 'PCMU first, PCMA as fallback. Comcast does not support G.729 on SIP trunks. Use G.711 only on the trunk leg.',
    callerIdHeaders: ['From', 'P-Asserted-Identity', 'Remote-Party-ID'],
    callerIdNotes: 'Comcast sends RPID and PAI on inbound. For outbound, the From header DID must be in your assigned block. Comcast validates the calling number against your DID inventory — spoofing blocked numbers will result in rejection.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [5061] },
    rtpRange: '1024–65535 (Comcast accepts wide RTP range; your SBC should restrict outbound to a defined range)',
    t38: 'Supported on Comcast Business SIP trunks. T.38 fax relay is enabled by default. Comcast re-INVITEs for T.38 on CNG detection. G.711 passthrough (Fax over G.711) is not recommended — use T.38 relay.',
    sbcIps: [
      '96.116.40.0/24',
      '96.116.41.0/24',
      '69.252.34.0/24',
      '162.238.0.0/24',
    ],
    cnameIps: [],
    sipProxy: 'voip.comcast.net (or your provisioned SIP domain)',
    notes: [
      'Comcast SIP requires a Comcast Business broadband circuit — SIP trunks are tied to the account\'s WAN IP.',
      'Comcast validates the source IP on every INVITE — ensure your SBC\'s WAN IP matches what Comcast has on file.',
      'SIP TLS is available on Comcast Business — request during provisioning.',
      'E911 is provisioned per DID at account setup. Address updates via Comcast Business portal.',
      'STIR/SHAKEN A-attestation applied for owned Comcast numbers.',
      'Comcast SIP trunks are generally region-locked to Comcast cable territories.',
      'SIP ALG must be disabled on the customer edge.',
    ],
    configSnippet: `; NS trunk config for Comcast Business (IP auth)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:   voip.comcast.net
Auth:         IP-based (Comcast allowlists your WAN IP)
Codec:        PCMU, PCMA (G.729 not supported)
Register:     No
; Firewall: allow inbound SIP from Comcast SBC ranges above.
; Allow RTP bidirectional (Comcast uses wide range — restrict your SBC).`,
  },
  {
    id: 'meta',
    label: 'Meta (formerly Verizon/Windstream/Broadvoice)',
    category: 'SIP trunk / Hosted',
    authMethod: 'Registration or IP Authentication (varies by account)',
    authNotes: 'Meta platforms vary. Registration is most common for hosted seats. IP auth available for on-site SBC configurations. Confirm with your Meta account rep.',
    registrationInterval: '3600s (registration mode)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.722', 'G.729'],
    codecOrder: 'PCMU preferred. G.722 HD audio available for internal calls. G.729 licensed separately — avoid on trunk legs.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'Meta passes PAI for outbound caller ID. Calling DID must be assigned to the account.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [5061] },
    rtpRange: '10000–20000',
    t38: 'Supported on Meta business accounts. Confirm T.38 is enabled at the account level. Re-INVITE on CNG detection.',
    sbcIps: ['Contact Meta for current SBC IP ranges — varies by region and platform version'],
    cnameIps: [],
    sipProxy: 'Assigned at provisioning — confirm with Meta account rep',
    notes: [
      'Meta has absorbed several carriers — confirm which platform version your account runs on (Verizon OneConnect, Broadvoice, Windstream SIP, etc.).',
      'Provisioning contacts and portal URLs differ by legacy platform.',
      'SIP ALG must be disabled.',
      'UDP timeout on NAT device must be ≥ 7200s.',
      'Firewall: allow SIP/RTP from Meta SBC IPs — obtain from provisioning docs.',
    ],
    configSnippet: `; NS trunk config for Meta (registration)
; In NS admin → Trunk → Add SIP Trunk:
Trunk host:   <meta-sbc-fqdn>
Auth:         Username + Password (from Meta portal)
Codec:        PCMU, PCMA
Register:     Yes — 3600s
; Confirm platform version with Meta before configuring.`,
  },
  {
    id: 'zultys',
    label: 'Zultys (on-site PBX)',
    category: 'On-site PBX / SIP trunk',
    authMethod: 'SIP Registration (Zultys MX to upstream carrier) or IP auth at carrier',
    authNotes: 'Zultys MX PBX registers to your upstream SIP trunk carrier (Twilio, Bandwidth, etc.). Phones register to the Zultys MX on the LAN. The Zultys MX handles all NAT traversal.',
    registrationInterval: '3600s (Zultys default to upstream carrier)',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'G.722', 'G.729 (licensed add-on)'],
    codecOrder: 'PCMU/PCMA for PSTN legs. G.722 for Zultys-to-Zultys internal calls. G.729 available but not recommended for general use.',
    callerIdHeaders: ['From', 'P-Asserted-Identity'],
    callerIdNotes: 'Zultys MX sets From and PAI based on the outbound trunk configuration. DID must be assigned to the trunk in Zultys MX Admin.',
    sipPorts: { udp: [5060], tcp: [5060], tls: [5061] },
    rtpRange: '8000–8200 (default Zultys MX RTP range; alternate 10000–20000 configurable in MX Admin → System → RTP)',
    t38: 'Supported. Enable T.38 in Zultys MX Admin → System → Fax. Zultys handles T.38 re-INVITE negotiation with the upstream carrier. ATA devices connected to Zultys should have T.38 enabled matching MX settings.',
    sbcIps: ['On-site — Zultys MX WAN/LAN IP is your SBC. No external SBC IPs apply.'],
    cnameIps: [],
    sipProxy: 'Zultys MX LAN IP or FQDN (phones register to this)',
    notes: [
      'Zultys MX RTP default range is 8000–8200. If you increase concurrent calls above ~100, expand to alternate range in MX Admin.',
      'Phone registration: Zultys MXIE clients use the MX LAN IP. Yealink phones use the MX as their SIP proxy.',
      'Remote workers: Zultys supports remote SIP over TLS + SRTP — configure in MX Admin → System → Remote Access.',
      'Trunk configuration: set up SIP trunk in Zultys MX Admin → Trunks → SIP Trunks, pointing to your upstream carrier.',
      'G.729 requires a per-seat license in Zultys — do not configure without verifying license count.',
      'Zultys supports SRTP for internal calls when remote access is enabled.',
    ],
    configSnippet: `; Yealink phone → Zultys MX registration
account.1.sip_server.1.address = <zultys-mx-ip>
account.1.sip_server.1.port = 5060
account.1.label = <extension>
account.1.auth_name = <extension>
account.1.user_name = <extension>
account.1.password = <sip-password>
account.1.codec.1.payload_type = PCMU
account.1.codec.2.payload_type = PCMA
account.1.codec.3.payload_type = G722
; Zultys MX SIP trunk to upstream carrier configured in MX Admin.`,
  },
  {
    id: 'pangea',
    label: 'Pangea (fax provider)',
    category: 'Fax / ATA',
    authMethod: 'SIP Registration',
    authNotes: 'Pangea fax lines use SIP registration. Each fax line registers as a separate SIP extension. ATA (e.g. Grandstream HT802) registers to Pangea SIP server.',
    registrationInterval: '3600s',
    codecs: ['G.711 PCMU', 'G.711 PCMA', 'T.38'],
    codecOrder: 'T.38 is primary for fax. G.711 PCMU/PCMA as voice fallback (G.711 passthrough fax). Do not negotiate G.729 — it destroys fax tones.',
    callerIdHeaders: ['From'],
    callerIdNotes: 'Pangea uses the registered DID as caller ID for outbound fax. Confirm DID assignment in the Pangea portal.',
    sipPorts: { udp: [5060], tcp: [], tls: [] },
    rtpRange: '10000–20000 (Pangea default)',
    t38: 'Native T.38 fax relay. Pangea is purpose-built for fax — T.38 is the primary mode. ATA must have T.38 enabled with MaxBitRate = 14400. G.711 passthrough (FoIP) available but lower reliability.',
    sbcIps: ['Contact Pangea for SIP server IPs — check your Pangea account portal'],
    cnameIps: [],
    sipProxy: 'Pangea SIP server FQDN (from account portal)',
    notes: [
      'ATA configuration: Grandstream HT802 → Account → SIP Server = Pangea SIP FQDN.',
      'T.38 settings on ATA: Enable T.38 Fax, MaxBitRate = 14400, ECM enabled.',
      'SIP registration: each fax line is a separate ATA port/account.',
      'Pangea fax lines are separate from voice SIP trunks — routing must keep fax DIDs on Pangea, not the main voice carrier.',
      'If fax fails: check T.38 MaxBitRate mismatch (must match Pangea exactly), check SIP port not blocked, verify ATA G.711 fallback is enabled as backup.',
      'Pangea does not support G.729 — do not configure on the ATA SIP account.',
    ],
    configSnippet: `; Grandstream HT802 ATA → Pangea fax
; Account → FXS Port 1:
SIP Server:          <pangea-sip-fqdn>
SIP User ID:         <fax-did>
Auth ID:             <fax-did>
Auth Password:       <sip-password>
Preferred Codec:     PCMU
DTMF Mode:           RFC2833
T.38 Fax:            Enabled
T.38 MaxBitRate:     14400
ECM:                 Enabled
; Do NOT enable G.729 on this account.`,
  },
]

const CATEGORY_ORDER = [
  'Hosted platform',
  'SIP trunk / PSTN',
  'SIP trunk / PSTN (CLEC/cable)',
  'SIP trunk / PSTN (ILEC)',
  'On-site PBX / SIP trunk',
  'Fax / ATA',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button type="button" className="ct-copy-btn" onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function SipPortRow({ ports }) {
  const parts = []
  if (ports.udp?.length) parts.push(`UDP ${ports.udp.join(', ')}`)
  if (ports.tcp?.length) parts.push(`TCP ${ports.tcp.join(', ')}`)
  if (ports.tls?.length) parts.push(`TLS ${ports.tls.join(', ')}`)
  return <span>{parts.join(' · ') || '—'}</span>
}

function AuthBadge({ method }) {
  const isReg = /registration/i.test(method)
  const isIp = /ip.auth/i.test(method)
  const isBoth = isReg && isIp
  if (isBoth) return <span className="ct-badge ct-badge-both">Reg or IP auth</span>
  if (isReg) return <span className="ct-badge ct-badge-reg">Registration</span>
  if (isIp) return <span className="ct-badge ct-badge-ip">IP auth</span>
  return <span className="ct-badge">{method}</span>
}

function CarrierDetail({ carrier }) {
  const [codeOpen, setCodeOpen] = useState(false)

  return (
    <div className="ct-detail">
      <div className="ct-detail-header">
        <div>
          <div className="ct-detail-name">{carrier.label}</div>
          <div className="ct-detail-category">{carrier.category}</div>
        </div>
        <AuthBadge method={carrier.authMethod} />
      </div>

      <div className="ct-detail-grid">
        {/* Auth */}
        <div className="ct-detail-section">
          <div className="ct-section-title">Authentication</div>
          <div className="ct-section-body">{carrier.authNotes}</div>
          {carrier.registrationInterval !== 'N/A (IP auth only)' && carrier.registrationInterval !== 'N/A' && (
            <div className="ct-kv"><span className="ct-kv-key">Reg interval:</span><span>{carrier.registrationInterval}</span></div>
          )}
          <div className="ct-kv"><span className="ct-kv-key">SIP Proxy:</span><span className="ct-mono">{carrier.sipProxy}</span></div>
        </div>

        {/* Ports & Transport */}
        <div className="ct-detail-section">
          <div className="ct-section-title">Ports &amp; Transport</div>
          <div className="ct-kv"><span className="ct-kv-key">SIP ports:</span><SipPortRow ports={carrier.sipPorts} /></div>
          <div className="ct-kv"><span className="ct-kv-key">RTP range:</span><span>{carrier.rtpRange}</span></div>
          {(carrier.sbcIps?.length > 0 && !/Contact/.test(carrier.sbcIps[0])) ? (
            <div className="ct-kv ct-kv-stacked">
              <span className="ct-kv-key">SBC IP ranges:</span>
              <ul className="ct-ip-list">
                {carrier.sbcIps.map(ip => <li key={ip} className="ct-mono">{ip}</li>)}
              </ul>
            </div>
          ) : carrier.sbcIps?.length > 0 ? (
            <div className="ct-kv"><span className="ct-kv-key">SBC IPs:</span><span className="ct-note">{carrier.sbcIps[0]}</span></div>
          ) : carrier.cnameIps?.length > 0 ? (
            <div className="ct-kv ct-kv-stacked">
              <span className="ct-kv-key">SIP domains:</span>
              <ul className="ct-ip-list">
                {carrier.cnameIps.map(d => <li key={d} className="ct-mono">{d}</li>)}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Codecs */}
        <div className="ct-detail-section">
          <div className="ct-section-title">Codecs</div>
          <ul className="ct-codec-list">
            {carrier.codecs.map(c => <li key={c}>{c}</li>)}
          </ul>
          <div className="ct-section-note">{carrier.codecOrder}</div>
        </div>

        {/* Caller ID */}
        <div className="ct-detail-section">
          <div className="ct-section-title">Caller ID Headers</div>
          <div className="ct-badge-row">
            {carrier.callerIdHeaders.map(h => (
              <span key={h} className="ct-hdr-badge">{h}</span>
            ))}
          </div>
          <div className="ct-section-note">{carrier.callerIdNotes}</div>
        </div>

        {/* Fax / T.38 */}
        <div className="ct-detail-section">
          <div className="ct-section-title">Fax / T.38</div>
          <div className="ct-section-body">{carrier.t38}</div>
        </div>

        {/* Deployment Notes */}
        <div className="ct-detail-section ct-detail-section--full">
          <div className="ct-section-title">Deployment Notes</div>
          <ul className="ct-notes-list">
            {carrier.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </div>

      {/* Config Snippet */}
      <div className="ct-snippet-block">
        <div className="ct-snippet-header">
          <button
            type="button"
            className="ct-snippet-toggle"
            onClick={() => setCodeOpen(v => !v)}
            aria-expanded={codeOpen}
          >
            {codeOpen ? '▾' : '▸'} Config snippet
          </button>
          {codeOpen && <CopyButton text={carrier.configSnippet} />}
        </div>
        {codeOpen && (
          <pre className="ct-snippet-code">{carrier.configSnippet}</pre>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CarrierTemplates() {
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = CARRIERS.filter(c =>
    !query ||
    c.label.toLowerCase().includes(query) ||
    c.category.toLowerCase().includes(query) ||
    c.authMethod.toLowerCase().includes(query)
  )

  const selected = CARRIERS.find(c => c.id === selectedId) || null

  // Group filtered carriers
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = filtered.filter(c => c.category === cat)
    if (items.length) acc.push({ cat, items })
    return acc
  }, [])

  return (
    <div className="ct-root">
      <div className="ct-header">
        <div className="ct-title">Carrier Templates</div>
        <div className="ct-subtitle">SIP trunk reference — auth method, codec order, ports, T.38, and config snippets for each carrier platform.</div>
      </div>

      <div className="ct-layout">
        {/* Sidebar */}
        <div className="ct-sidebar">
          <input
            className="ct-search"
            type="search"
            placeholder="Filter carriers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {grouped.map(({ cat, items }) => (
            <div key={cat} className="ct-group">
              <div className="ct-group-label">{cat}</div>
              {items.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`ct-sidebar-item${selectedId === c.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="ct-sidebar-name">{c.label}</span>
                  <AuthBadge method={c.authMethod} />
                </button>
              ))}
            </div>
          ))}
          {!filtered.length && (
            <div className="ct-empty">No carriers match "{search}"</div>
          )}
        </div>

        {/* Detail panel */}
        <div className="ct-main">
          {selected ? (
            <CarrierDetail carrier={selected} />
          ) : (
            <div className="ct-placeholder">
              <div className="ct-placeholder-icon">📡</div>
              <div className="ct-placeholder-text">Select a carrier to see its SIP trunk config details.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
