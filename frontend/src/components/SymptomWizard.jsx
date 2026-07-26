/**
 * SymptomWizard — Guided VoIP troubleshooting tree
 * Covers: NetSapiens, Meta, Zultys, Yealink, Algo, Pangea
 *
 * Leaf nodes support a `tools` array of { label, path } to deep-link
 * into other ClearLine tools directly from the result screen.
 */

import { useState } from 'react'
import { navigate } from '../lib/router.js'

// ─── Tree Definition ──────────────────────────────────────────────────────────
// Branch node: { q, opts: [{ label, next }] }
// Leaf node:   { title, platform, steps, escalate?, tools? }

const TREE = {
  root: {
    q: 'What is the main symptom?',
    opts: [
      { label: 'Phones not ringing / missed calls',            next: 'no_ring' },
      { label: 'Calls dropping mid-call',                       next: 'drop' },
      { label: 'One-way or no audio',                           next: 'audio' },
      { label: 'IVR / keypad tones not working (DTMF)',         next: 'dtmf' },
      { label: "Can't make outbound calls",                     next: 'outbound' },
      { label: 'Registration / offline phones',                 next: 'reg' },
      { label: 'Paging not working',                            next: 'paging' },
      { label: 'Fax failures',                                  next: 'fax' },
      { label: 'Auto-attendant / IVR routing issues',           next: 'aa' },
      { label: 'Poor call quality (choppy / echo / static)',    next: 'quality' },
    ],
  },

  // ── No Ring ──────────────────────────────────────────────────────────────
  no_ring: {
    q: 'Which platform are the phones on?',
    opts: [
      { label: 'NetSapiens', next: 'no_ring_ns' },
      { label: 'Meta',       next: 'no_ring_meta' },
      { label: 'Zultys',     next: 'no_ring_zultys' },
    ],
  },
  no_ring_ns: {
    title: 'Phones not ringing — NetSapiens',
    platform: 'NetSapiens',
    steps: [
      'Check NetSapiens portal → Subscribers → confirm the DID is mapped to the correct subscriber or hunt group.',
      'Verify the subscriber\'s Answering Rules are not forwarding all calls to voicemail or another number.',
      'Check Time Frames: confirm the active time frame matches the current time and routes to the right destination. A gap in the schedule causes calls to drop silently.',
      'In Call History, find the inbound call and pull it into Call Diagnostic — look for where it terminates (busy, forwarded, no answer, timeout?).',
      'Confirm the Yealink phone is registered: Admin → Devices → check Last Seen timestamp.',
      'On the phone, verify DND is not enabled — check the DND key LED and web UI → Features.',
      'If a hunt group: Admin → Hunt Groups → confirm members are listed and ring order is correct.',
      'Check voicemail box capacity — a full mailbox can cause calls to reject instead of going to voicemail.',
    ],
    escalate: 'If the DID is mapped correctly and calls still don\'t arrive, pull the SIP log from Call Diagnostic and look for the final SIP response code on the inbound leg.',
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  no_ring_meta: {
    title: 'Phones not ringing — Meta',
    platform: 'Meta',
    steps: [
      'Log into the Meta admin portal and check the ring group / extension routing for the DID.',
      'Confirm the Yealink is registered to Meta: check Devices in the portal.',
      'Verify the user\'s Find Me / Follow Me settings aren\'t routing away from the desk phone.',
      'Check business hours rules — if after-hours routing is misconfigured, calls may hit voicemail immediately.',
      'Check voicemail-to-email: if the mailbox is full, calls may reject.',
      'On the Yealink phone, verify DND is off and the correct line is active.',
    ],
    escalate: 'Contact Meta support with the inbound DID, timestamp, and originating number for a SIP trace.',
  },
  no_ring_zultys: {
    title: 'Phones not ringing — Zultys',
    platform: 'Zultys',
    steps: [
      'Open Zultys MX Administrator → Users → confirm the extension is active and the DID is assigned.',
      'Check Ring Groups: verify the phone is a member and no member override is in place.',
      'Confirm the MX-E or MXvirtual trunk is online: Trunks → check SIP trunk status (should be green/active).',
      'Verify the Yealink phone is registered: check SIP Registrations in MX Admin.',
      'In MX call logs, find the inbound call and trace its routing path.',
      'Check if Auto Answer or DND is set on the user\'s profile in MX Admin → Users → Advanced.',
    ],
    escalate: 'Enable SIP debug logging on the MX and capture the call attempt for Zultys support.',
  },

  // ── Dropping Calls ───────────────────────────────────────────────────────
  drop: {
    q: 'When do calls drop?',
    opts: [
      { label: 'At exactly 30 or 32 seconds',  next: 'drop_timer' },
      { label: 'After a transfer',              next: 'drop_transfer' },
      { label: 'Randomly during the call',      next: 'drop_random' },
      { label: 'When placed on hold',           next: 'drop_hold' },
    ],
  },
  drop_timer: {
    title: 'Calls dropping at ~30 seconds',
    platform: 'SIP / NAT — all platforms',
    steps: [
      '30-second drops are almost always a SIP ACK routing problem — the ACK from the phone never reaches the carrier after the 200 OK.',
      'ROOT CAUSE: the phone\'s Contact header contains a private IP (10.x, 192.168.x) that the carrier cannot route back to.',
      'FIRST STEP: disable SIP ALG on the router/firewall completely. SIP ALG rewrites SDP and mangles Contact headers, making this worse. It is never helpful for hosted VoIP.',
      'On Yealink web UI → Network → NAT: set NAT Traversal to STUN and configure a STUN server (e.g., stun.l.google.com:19302).',
      'On NetSapiens SBC: confirm "Force RTP Proxy" is enabled for the domain — all media should pass through the server, not phone-to-phone directly.',
      'Verify the firewall allows the ACK packet to return from the carrier to the NS SBC on UDP 5060.',
      'Pull the call from Call Diagnostic — look for a 200 OK followed by no ACK in the ladder, then a BYE arriving around 30s.',
      'If using a Meraki: Security & SD-WAN → Threat protection — ensure no SIP inspection is active.',
    ],
    escalate: 'If the ACK is visible in the SIP trace but the carrier is still dropping, capture a WAN-side pcap and provide timestamps to the carrier. This is a carrier-side routing failure.',
    tools: [
      { label: 'Open Call Diagnostic', path: '/tools/calldiag' },
      { label: 'Open Packet Capture', path: '/tools/pcap' },
    ],
  },
  drop_transfer: {
    title: 'Calls dropping after transfer',
    platform: 'NetSapiens / Yealink',
    steps: [
      'Confirm transfer type: Attended (consult then transfer) vs Blind (direct). Both can fail for different reasons.',
      'Check Yealink transfer key config: programablekey.N.type = 3 for Blind Transfer, type = 9 for Attended Transfer.',
      'On NetSapiens: verify "Transfer Routing" is enabled in the domain settings so re-INVITE is handled server-side.',
      'Check if the receiving extension has call waiting enabled — if not, a second call during attended transfer is rejected with 486.',
      'Test with a direct dial to the target extension first — if that fails, the transfer destination is the issue, not the transfer itself.',
      'In Call Diagnostic, look for REFER or re-INVITE in the ladder. A 4xx response on the REFER = permission or routing issue.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  drop_random: {
    title: 'Calls dropping randomly',
    platform: 'Network / General',
    steps: [
      'Check internet circuit stability: run a continuous ping to 8.8.8.8 and watch for packet loss or latency spikes.',
      'Review QoS policy: SIP (UDP 5060) and RTP (UDP 10000–20000) need DSCP EF (46). Without QoS, competing traffic can starve voice.',
      'Check for bandwidth saturation: heavy downloads/uploads sharing the same circuit will kill active calls.',
      'Inspect the Yealink registration keep-alive interval: web UI → Account → SIP → set keep-alive to 30s to prevent NAT mappings from expiring.',
      'On NetSapiens, check the SIP OPTIONS ping interval for the trunk. A failing OPTIONS probe will tear down the trunk and drop all active calls.',
      'Check RTP timeout: if no media flows for 30+ seconds (e.g., hold with no comfort noise and the carrier sends BYE), enable MOH on NetSapiens.',
      'Run a VoIP quality test from the site using MyConnection Pro or a similar tool and check MOS, jitter, and loss.',
    ],
    escalate: 'Capture a Visualware / MyConnection Pro test at the time drops occur. Provide MOS, jitter, and loss values to the carrier.',
    tools: [{ label: 'Open Network Check', path: '/tools/netcheck' }],
  },
  drop_hold: {
    title: 'Calls dropping when placed on hold',
    platform: 'NetSapiens / Yealink',
    steps: [
      'When on hold, Yealink sends a re-INVITE with a=sendonly. Some carriers send BYE if they stop receiving RTP (no comfort noise).',
      'On Yealink web UI → Features → General: enable "RFC 2543 Hold" if the carrier requires the old hold format (a=inactive vs a=sendonly).',
      'Check NetSapiens domain: confirm Music on Hold (MOH) is configured and the media server is reachable — MOH keeps RTP flowing and prevents carrier timeout.',
      'Verify the phone is sending comfort noise during hold: web UI → Account → Advanced → Comfort Noise should be On.',
      'Test hold with an internal call first — if internal hold works but external drops, the issue is carrier-side hold behavior.',
      'In Call Diagnostic, look for a re-INVITE at the point of hold — if it receives 488 or no response, that is the failure point.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },

  // ── DTMF ─────────────────────────────────────────────────────────────────
  dtmf: {
    q: 'Where is DTMF failing?',
    opts: [
      { label: 'Into an auto-attendant or external IVR (bank, carrier)',  next: 'dtmf_aa' },
      { label: 'Into NetSapiens auto-attendant specifically',             next: 'dtmf_ns_aa' },
      { label: 'Fax tones not working (T.38 / fax detection)',           next: 'dtmf_fax' },
      { label: 'DTMF works on some phones but not others',               next: 'dtmf_mixed' },
    ],
  },
  dtmf_aa: {
    title: 'DTMF not working into external IVR / auto-attendant',
    platform: 'Yealink / SIP',
    steps: [
      'DTMF failure is almost always a signaling method mismatch. There are three DTMF modes: RFC 2833 (in RTP), SIP INFO (in signaling), and In-Band (audio tones). The phone and the receiving system must agree.',
      'On Yealink web UI → Account → Advanced → DTMF: confirm it is set to RFC 2833. This is the correct mode for 99% of deployments.',
      'Confirm DTMF payload type is 101 (the standard RFC 2833 event payload). Yealink: account.N.dtmf.info_type = 1 for RFC 2833.',
      'If the carrier requires SIP INFO: change Yealink DTMF to "SIP INFO" (account.N.dtmf.info_type = 2). This is rare but required by some carriers.',
      'Avoid In-Band DTMF (audio tones) — G.729 and G.722 compress audio in ways that destroy the tones.',
      'Check ptime: Yealink default is 20ms. If ptime is set to 30ms or higher, DTMF event packets may be delayed enough to be dropped.',
      'If calls use G.729: switch to G.711 PCMU for the DTMF call path — G.729 annex B VAD will mute DTMF tones.',
      'Test with a softphone (Zoiper, Linphone) using RFC 2833 — if softphone works but Yealink doesn\'t, re-flash the phone firmware.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  dtmf_ns_aa: {
    title: 'DTMF not working into NetSapiens auto-attendant',
    platform: 'NetSapiens',
    steps: [
      'NetSapiens processes RFC 2833 DTMF from the RTP stream. Confirm the phone is sending RFC 2833, not In-Band or SIP INFO.',
      'On Yealink web UI → Account → DTMF Type: set to RFC 2833, payload type 101.',
      'In NetSapiens admin → Auto Attendants → check the DTMF timeout value. If set too short (under 3s), callers cannot press a key in time.',
      'Check if NAT is causing DTMF RTP packets to be dropped. If Force RTP Proxy is not enabled, RFC 2833 packets may not reach the NS media server.',
      'Enable Force RTP Proxy on the NS domain: Admin → Domains → [domain] → SIP settings. All media must pass through the server.',
      'Check the auto-attendant "No Input" action — if DTMF events are lost, the caller hears the greeting loop and nothing happens.',
      'Pull the call in Call Diagnostic and look at the RTP section — if DTMF events appear in the SIP INFO but not as RTP events, the method is wrong.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  dtmf_fax: {
    title: 'Fax tones / T.38 not detected',
    platform: 'SIP / T.38',
    steps: [
      'Fax tones (CNG at 1100 Hz) trigger a re-INVITE from the carrier to upgrade the call to T.38 (image/t38) media.',
      'If T.38 is not supported on the ATA/PBX, the call stays on G.711 (fax passthrough). G.711 passthrough is sensitive to packet loss and rarely works reliably over VoIP.',
      'Check Yealink ATA or NetSapiens: confirm T.38 is enabled. NS Admin → Domains → Voice Settings → T.38 Fax.',
      'For Yealink ATAs (HT series): web UI → FXS ports → T.38 Fax passthrough → Enable.',
      'If T.38 negotiation fails: check that both the carrier and the PBX have matching T.38 MaxBitRate settings (typically 14400).',
      'Pangea fax is cloud-hosted — if routing fax to Pangea, the carrier SIP trunk must point fax DIDs to the Pangea SIP endpoint, not the Yealink phone.',
      'Test by sending a fax to a known-working number like a FedEx store — if that works, the destination fax machine is the issue.',
    ],
  },
  dtmf_mixed: {
    title: 'DTMF works on some phones but not others',
    platform: 'Yealink — mixed firmware',
    steps: [
      'Mixed DTMF behavior across phones almost always means inconsistent firmware or provisioning.',
      'Check the firmware version on working vs non-working phones: Yealink web UI → Status → Firmware.',
      'Ensure all phones are on the same firmware version. Use Yealink auto-provisioning to push a uniform config.',
      'Compare the account.N.dtmf.info_type and account.N.dtmf.dtmf_payload values between a working and non-working phone.',
      'If using a provisioning server: confirm the DTMF config is in the model-specific .cfg file, not just the device .cfg — model cfg applies to all phones of that model.',
      'Re-provision the non-working phone from scratch using the Yealink RPS or provisioning server.',
    ],
    tools: [{ label: 'Open Yealink Codes', path: '/tools/yealink' }],
  },

  // ── Audio Issues ─────────────────────────────────────────────────────────
  audio: {
    q: 'Describe the audio issue:',
    opts: [
      { label: "One-way audio (I can hear them but they can't hear me, or vice versa)", next: 'audio_oneway' },
      { label: 'No audio at all (both sides silent)',                                   next: 'audio_none' },
      { label: 'Audio works on some calls but not others',                              next: 'audio_intermittent' },
    ],
  },
  audio_oneway: {
    title: 'One-way audio',
    platform: 'SIP / NAT',
    steps: [
      'One-way audio = RTP is flowing in only one direction. Classic NAT problem.',
      'The phone\'s RTP packets leave from a private IP that the far end cannot route back to. The phone hears the far end but the far end cannot hear the phone.',
      'Disable SIP ALG on the router/firewall first. SIP ALG rewrites Contact/Via headers and makes NAT worse.',
      'On Yealink web UI → Network → NAT: set NAT Traversal to STUN. Configure a public STUN server.',
      'On NetSapiens SBC: enable Force RTP Proxy for the domain — all media must pass through the server.',
      'Verify the firewall allows UDP 10000–20000 (or the configured RTP range) both inbound and outbound.',
      'In Call Diagnostic, check the SDP section — if the phone\'s c= line shows a private IP, NAT proxy is not working.',
      'Test using a softphone on the same network — if softphone has two-way audio but Yealink is one-way, it is phone-level NAT.',
    ],
    tools: [
      { label: 'Open Call Diagnostic', path: '/tools/calldiag' },
      { label: 'Open Packet Capture', path: '/tools/pcap' },
    ],
  },
  audio_none: {
    title: 'No audio — both sides silent',
    platform: 'Codec / Firewall',
    steps: [
      'No audio on both sides = codec mismatch or RTP completely blocked by firewall.',
      'In Call Diagnostic → SDP section: verify both sides agreed on a common codec in the 200 OK. If the 200 OK has no m=audio line, there was no codec match.',
      'Common mismatch: Yealink offers G.722.1 (Siren) as first priority, but most carriers only support G.711 PCMU/PCMA.',
      'On Yealink web UI → Account → Codec: move G.711u (PCMU) to position 1, disable G.722.1 and Opus for carrier-facing accounts.',
      'Pull a pcap on the LAN — you should see UDP packets to/from the carrier IP on port 10000+. If you see no RTP at all, a firewall is blocking it.',
      'Confirm the Yealink has a valid IP, subnet, and default gateway — a routing issue can pass SIP on port 5060 but block RTP to a different subnet.',
      'Check if SRTP is required: if the carrier requires encrypted media and the phone sends plain RTP, all media will be rejected.',
    ],
    tools: [
      { label: 'Open Call Diagnostic', path: '/tools/calldiag' },
      { label: 'Open Packet Capture', path: '/tools/pcap' },
    ],
  },
  audio_intermittent: {
    title: 'Intermittent audio — works on some calls',
    platform: 'Network / Codec',
    steps: [
      'Intermittent audio usually means different call paths hit different NAT conditions or different codec negotiations.',
      'Check if the issue correlates with call direction (inbound vs outbound) or specific DIDs.',
      'Review codec priority: if G.722.1 is first, some carriers accept it and some reject it — the call succeeds but with no audio when rejected.',
      'Check network switching: if calls route through different WAN paths (MPLS vs internet), one path may block RTP.',
      'Verify all phones are on the same firmware version — audio bugs are sometimes firmware-specific on Yealink.',
      'Enable RTP statistics on Yealink during a bad call: web UI → Status → RTP. Capture packet loss and jitter values.',
    ],
  },

  // ── Outbound ─────────────────────────────────────────────────────────────
  outbound: {
    q: 'What happens when you dial out?',
    opts: [
      { label: 'Fast busy / reorder tone immediately',     next: 'ob_busy' },
      { label: '403 Forbidden or 407 auth error',          next: 'ob_auth' },
      { label: 'Phone shows Not Registered',               next: 'reg' },
      { label: 'Rings but no answer (carrier side)',        next: 'ob_ring' },
    ],
  },
  ob_busy: {
    title: 'Outbound calls — fast busy / immediate rejection',
    platform: 'NetSapiens / Carrier',
    steps: [
      'Fast busy on outbound usually means the call is not reaching the carrier at all.',
      'Check NetSapiens → Trunks: confirm the outbound trunk is registered/active (green icon).',
      'Verify outbound dial plan: Admin → Dial Plan → confirm 10-digit and 11-digit patterns exist and point to the correct trunk group.',
      'Check if the caller ID (From: header) is authorized by the carrier. A non-whitelisted outbound number causes immediate 403.',
      'Test with a known-good number format: try 1NPANXXXXXX vs NPANXXXXXX — carriers vary on what they require.',
      'On the Yealink, confirm Outbound Proxy is set to the correct NetSapiens SBC address. A wrong proxy means INVITE never reaches NS.',
      'Check NS trunk concurrent call limit — if the trunk is maxed out, new calls will reject immediately.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  ob_auth: {
    title: 'Outbound calls — 403 Forbidden or 407 auth challenge',
    platform: 'NetSapiens / SIP',
    steps: [
      '407 Proxy Auth Required is NORMAL — the PBX should auto-respond with trunk credentials. If the call fails after 407, credentials are wrong.',
      'Check trunk username/password in NetSapiens → Carriers / Trunks → SIP credentials.',
      '403 Forbidden means the carrier is rejecting outright — usually a caller ID or IP whitelist issue.',
      'Confirm the public IP of the NetSapiens SBC is whitelisted at the carrier portal.',
      'On Yealink: if account auth fails (401), re-enter the SIP password in web UI → Account → Register → Password.',
      'In Call Diagnostic, look for the 407 challenge followed by a re-INVITE with credentials. If the re-INVITE is missing, the PBX is not handling the auth.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  ob_ring: {
    title: 'Outbound rings but goes to voicemail / not answered',
    platform: 'Carrier / General',
    steps: [
      'Confirm the called party number is correct and dialable from a cell phone.',
      'Check if the outbound caller ID is showing correctly — if the caller ID is wrong or unknown, the recipient may ignore it.',
      'CNAM (Caller ID Name): verify CNAM is registered for the outbound DID at the carrier portal.',
      'Some carriers have CNAM lookup delays of 24–48 hours after porting — calls may show generic during that window.',
      'If the phone shows the call placed but the carrier billing shows nothing, the carrier is dropping it before the network edge.',
    ],
  },

  // ── Registration ─────────────────────────────────────────────────────────
  reg: {
    q: 'What platform is the phone registering to?',
    opts: [
      { label: 'NetSapiens', next: 'reg_ns' },
      { label: 'Meta',       next: 'reg_meta' },
      { label: 'Zultys',     next: 'reg_zultys' },
    ],
  },
  reg_ns: {
    title: 'Phone offline / registration failed — NetSapiens',
    platform: 'NetSapiens',
    steps: [
      'On Yealink web UI → Status → check SIP account status. Should show Registered. If Failed, note the response code.',
      '401 / 403: credentials are wrong. Verify SIP username and password match exactly in NS portal → Subscribers.',
      '408 Timeout: network issue. Ping the NetSapiens proxy address from the phone\'s subnet.',
      'Check Yealink → Account → SIP Server 1: confirm the hostname/IP and port (standard is 5060 UDP).',
      'Verify DNS resolves the NetSapiens hostname from the phone\'s network segment.',
      'Check if a firewall rule is blocking outbound UDP 5060 from the phone VLAN.',
      'NS portal → Devices: confirm the device is provisioned and the MAC address matches exactly.',
      'If using Yealink RPS: confirm the redirect is pointing to the correct NS SBC hostname.',
    ],
    escalate: 'Enable SIP debug on the Yealink (web UI → Settings → Configuration → Phone Debug) and capture the REGISTER / 4xx exchange.',
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  reg_meta: {
    title: 'Phone offline / registration failed — Meta',
    platform: 'Meta',
    steps: [
      'Check Yealink web UI → Account → SIP Server: confirm it matches the Meta SIP proxy address exactly.',
      'Verify credentials match the Meta user\'s SIP credentials (case-sensitive username and password).',
      'Meta uses TLS/SRTP on some deployments — confirm transport. If Meta requires TLS: set Yealink transport to TLS and port to 5061.',
      'If the phone was previously working, check if Meta changed their proxy address or if there was a password reset in the portal.',
      'Confirm the account is active in the Meta portal — suspended or over-limit accounts reject REGISTER with 403.',
    ],
  },
  reg_zultys: {
    title: 'Phone offline / registration failed — Zultys',
    platform: 'Zultys',
    steps: [
      'Open Zultys MX Admin → Current Status → SIP Registrations. Find the extension and check status.',
      'Verify the Yealink is configured to register to the MX IP or hostname on port 5060.',
      'MX user must have SIP Phone assigned, not just MXIE softphone — check User → Advanced → Phone type.',
      'Verify the SIP password in MX User → Advanced matches the Yealink account password exactly.',
      'Confirm the Yealink is on a subnet that can reach the MX — check routing and VLAN config.',
      'MX firewall rules: UDP 5060 and RTP 8000–8200 must be allowed from the phone subnet.',
    ],
  },

  // ── Paging ───────────────────────────────────────────────────────────────
  paging: {
    q: 'What type of paging issue?',
    opts: [
      { label: 'Algo unit not receiving pages',             next: 'paging_algo_rx' },
      { label: 'Phones not receiving multicast page',        next: 'paging_phone_rx' },
      { label: "One-way audio on page (can't hear it)",     next: 'paging_audio' },
    ],
  },
  paging_algo_rx: {
    title: 'Algo unit not receiving pages',
    platform: 'Algo',
    steps: [
      'Open Algo web UI (http://[device-IP]) → SIP → verify SIP registration status. The Algo must be registered before it can receive pages.',
      'Check the Algo is registered to the same SIP server as the phones (NetSapiens or Zultys).',
      'If using multicast: Algo web UI → Multicast → confirm the multicast group IP and port match the Yealink paging key exactly (default 224.1.1.1:10000).',
      'Verify multicast routing on the switch: IGMP snooping must allow the multicast group to pass through all VLANs between the sending phone and the Algo.',
      'Test with a direct SIP call to the Algo extension first to rule out audio hardware issues.',
      'Check Algo volume and output settings in the web UI — the unit may be receiving but the volume is set to 0.',
      'Confirm the Algo is on the same VLAN as the phones or that multicast is explicitly routed between VLANs.',
    ],
    tools: [{ label: 'Open Algo Config Builder', path: '/tools/algo' }],
  },
  paging_phone_rx: {
    title: 'Phones not receiving multicast page',
    platform: 'Yealink',
    steps: [
      'On Yealink web UI → Features → Paging/Intercom: verify Paging Barge In is enabled.',
      'Check the multicast listen address matches exactly: 224.1.1.1:10000 (or your configured group).',
      'Yealink config keys: multicastpaging.receive_priority.1 = 1, multicastpaging.listen_address.1.ip_address = 224.1.1.1:10000.',
      'Ensure all phones are on a VLAN that receives multicast — check managed switch IGMP snooping config.',
      'Verify the paging key on the sending phone is correct: programablekey.N.type = 24, programablekey.N.value = 224.1.1.1:10000.',
      'Test with one phone close to the paging server on the same switch port to rule out switch-level multicast filtering.',
    ],
    tools: [{ label: 'Open Yealink Codes', path: '/tools/yealink' }],
  },
  paging_audio: {
    title: 'One-way audio on page',
    platform: 'Algo / Yealink',
    steps: [
      'If listeners can\'t hear the page: check the Algo speaker output, cable connections, and volume setting.',
      'If the Algo can\'t hear the person paging (intercom models): verify the Algo microphone input — some models require an external mic.',
      'Codec mismatch: Algo and Yealink must negotiate G.711 PCMU. Disable G.722.1 on the Algo SIP account — Algo devices do not support it reliably.',
      'For multicast paging: audio is unidirectional by design. Only the initiator speaks; listeners cannot respond. Use intercom (SIP call) for two-way.',
      'Verify the Algo RTP port range is not blocked by a firewall rule.',
    ],
  },

  // ── Fax ──────────────────────────────────────────────────────────────────
  fax: {
    q: 'What is happening with the fax?',
    opts: [
      { label: 'Fax connects but fails to complete / garbled',  next: 'fax_t38' },
      { label: 'Outbound fax fails immediately',                next: 'fax_out' },
      { label: 'Inbound fax not received',                      next: 'fax_in' },
      { label: 'Pangea portal issues',                          next: 'fax_portal' },
    ],
  },
  fax_t38: {
    title: 'Fax connects but fails mid-transmission (T.38)',
    platform: 'SIP / T.38 / Pangea',
    steps: [
      'When a fax tone (CNG at 1100 Hz) is detected, the carrier sends a re-INVITE to upgrade the call from voice (G.711) to T.38 (m=image). If the PBX or ATA does not support T.38, this re-INVITE fails and the fax fails.',
      'Check NetSapiens: Admin → Domains → Voice Settings → T.38 Fax → Enable. If this is Off, NS will reject the carrier\'s T.38 re-INVITE.',
      'For Yealink ATAs (HT1xx, HT2xx): web UI → FXS Ports → T.38 Fax Passthrough → Enable.',
      'Match T.38 MaxBitRate on both ends: most carriers expect 14400. NS: Carriers → [carrier] → Fax settings.',
      'If T.38 is enabled on both ends but still fails: try forcing G.711 fax passthrough. This is less reliable but avoids T.38 negotiation entirely. Requires very low packet loss (< 0.5%).',
      'If using Pangea: confirm the DID is pointed to the Pangea fax SIP endpoint, NOT the phone extension. Pangea handles T.38 natively.',
      'Run a packet capture during the fax attempt and look for the re-INVITE with m=image. If NS rejects it with 488 or 606, T.38 is not enabled.',
    ],
    tools: [
      { label: 'Open Packet Capture', path: '/tools/pcap' },
      { label: 'Open Call Diagnostic', path: '/tools/calldiag' },
    ],
  },
  fax_out: {
    title: 'Outbound fax failing immediately',
    platform: 'Pangea / NetSapiens',
    steps: [
      'Log into Pangea portal and check the outbound fax job status and error code.',
      'Verify the outbound number is a fax-capable DID on Pangea — not all DIDs support fax.',
      'Check file format: Pangea accepts PDF and TIFF. Complex graphics or scanned PDFs with large file sizes can time out.',
      'Verify the Pangea account is not over its monthly page limit.',
      'Check Pangea API status: https://status.pangea.io for any active incidents.',
      'Test with a known-good destination number (a major carrier fax number or FedEx store).',
      'Confirm outbound caller ID on Pangea is set and valid — some carriers reject fax calls with missing caller ID.',
    ],
  },
  fax_in: {
    title: 'Inbound fax not received',
    platform: 'Pangea',
    steps: [
      'Verify the inbound DID in NetSapiens is pointed to the Pangea fax SIP endpoint, not a voice destination.',
      'Check the Pangea portal → Inbound → confirm the DID is listed and active.',
      'Check the fax-to-email address: confirm it is correct and check the spam/junk folder.',
      'If using webhook delivery, verify the webhook URL is reachable and returning HTTP 200 OK.',
      'Check sender compatibility: older fax machines using V.34 or V.17 may need specific settings in Pangea.',
      'Ask the sender to confirm the fax was sent successfully on their end (their transmission report).',
    ],
  },
  fax_portal: {
    title: 'Pangea portal issues',
    platform: 'Pangea',
    steps: [
      'Check https://status.pangea.io for any active incidents.',
      'Clear browser cache and try a different browser or incognito window.',
      'Verify login credentials — Pangea accounts can be locked after inactivity or failed login attempts.',
      'If using API: check that the API key is valid and has not been rotated. Verify in Pangea portal → Settings → API Keys.',
      'Contact Pangea support at support@pangea.cloud. Include your account ID and the affected DID.',
    ],
  },

  // ── Auto-Attendant ───────────────────────────────────────────────────────
  aa: {
    q: 'What is the auto-attendant issue?',
    opts: [
      { label: 'Menu selections not recognized (DTMF not working)', next: 'dtmf_ns_aa' },
      { label: 'Calls not routing to correct destination after selection', next: 'aa_route' },
      { label: 'Greeting plays but call drops after',                      next: 'aa_drop' },
    ],
  },
  aa_route: {
    title: 'Auto-attendant routes to wrong destination',
    platform: 'NetSapiens',
    steps: [
      'Log into NetSapiens → Auto Attendants → select the attendant → review each DTMF key assignment carefully.',
      'Check for overlapping dial plan: pressing 1 might match both the "1" key and a 10-digit number starting with 1.',
      'Verify time frames: the after-hours menu may be loading instead of the business-hours menu if time frames overlap or have a gap.',
      'Test each key individually and find the resulting call in Call History — trace the routing path.',
      'Confirm destination extensions and hunt groups still exist. A deleted extension causes routing to fall through to the timeout action.',
      'Check the timeout and invalid-input actions — if both are set to Disconnect, any routing failure silently drops the call.',
    ],
    tools: [{ label: 'Open Call Diagnostic', path: '/tools/calldiag' }],
  },
  aa_drop: {
    title: 'Auto-attendant drops call after greeting',
    platform: 'NetSapiens',
    steps: [
      'The most common cause: no DTMF received and the "No Input" action is set to Disconnect.',
      'In NetSapiens → Auto Attendants: change No Input action to loop to the greeting or transfer to an operator.',
      'Check DTMF timeout — if it is too short (under 3 seconds), the attendant gives up before the caller can press a key.',
      'Verify the greeting audio file is not corrupted — re-upload a fresh WAV file (8kHz, 16-bit, mono format).',
      'Test with a softphone (known-good DTMF) to rule out DTMF detection failure vs. greeting file issue.',
      'Check if the call is actually a fax: some fax machines dial into the auto-attendant and the CNG tone causes unexpected routing.',
    ],
  },

  // ── Quality ──────────────────────────────────────────────────────────────
  quality: {
    q: 'What does the quality problem sound like?',
    opts: [
      { label: 'Choppy / robotic voice',                   next: 'qual_jitter' },
      { label: 'Echo (hearing yourself or the far end)',   next: 'qual_echo' },
      { label: 'Static / crackling',                       next: 'qual_static' },
    ],
  },
  qual_jitter: {
    title: 'Choppy / robotic audio — jitter / packet loss',
    platform: 'Network / QoS',
    steps: [
      'Run a VoIP quality test (MyConnection Pro / Visualware) from the site. Target: jitter < 20ms, packet loss < 1%, RTT < 150ms one-way.',
      'Note: the ClearLine Call Diagnostic shows SIP signaling timing, not RTP jitter. Use a pcap or MyConnection test for actual RTP metrics.',
      'Check jitter buffer on Yealink: web UI → Account → Advanced → Jitter Buffer. Set to Adaptive, max 120ms.',
      'Enable QoS on the router: SIP (UDP 5060) needs DSCP CS3 (24), RTP (UDP 10000–20000) needs DSCP EF (46). Without QoS, any competing traffic can preempt voice.',
      'Check for bandwidth saturation: other devices uploading/downloading on the same circuit can cause bursts of jitter.',
      'Verify the phone VLAN is properly isolated and QoS markings are honored at the WAN edge (ISP hand-off).',
      'If the ISP is applying traffic shaping to VoIP ports, request QoS passthrough or test with a different source port.',
      'Check Yealink Status → RTP statistics during a bad call. Jitter > 20ms is noticeable; > 50ms is severe.',
    ],
    tools: [
      { label: 'Open Network Check', path: '/tools/netcheck' },
      { label: 'Open Packet Capture', path: '/tools/pcap' },
      { label: 'Codec & QoS Reference', path: '/tools/codec' },
    ],
  },
  qual_echo: {
    title: 'Echo during calls',
    platform: 'Yealink / Acoustic',
    steps: [
      'Near-end echo (you hear yourself): the phone\'s speaker is feeding into the microphone. Reduce speaker volume or use a handset.',
      'Far-end echo (the other person hears themselves): their phone or speakerphone is the source. Ask them to reduce volume.',
      'On Yealink: acoustic echo cancellation (AEC) should be on by default. Verify in web UI → Features → Audio → AEC = Enabled.',
      'Long-delay echo (300ms+) is a network echo — check for echo cancellation on the trunk in NetSapiens domain settings.',
      'Sidetone echo: if sidetone gain is set too high, the user hears a faint echo of themselves. Check Yealink sidetone settings.',
      'Speakerphone echo: keep objects away from the phone mic. Yealink speakerphones need clear airspace around the microphone array.',
      'ATA echo: if calls pass through an analog ATA (Algo intercom, Grandstream), enable echo cancellation in the ATA settings.',
    ],
  },
  qual_static: {
    title: 'Static / crackling audio',
    platform: 'Yealink / Physical',
    steps: [
      'Check the physical handset cord — coiled cords develop shorts over time. Swap to a straight replacement cord.',
      'Try a different handset or headset on the same phone to isolate phone body vs. accessory.',
      'Check the Ethernet cable and switch port — a degraded cable causes packet loss that sounds like audio crackling.',
      'Update Yealink firmware — audio driver bugs are fixed in newer versions. Check Yealink support portal.',
      'Check for electromagnetic interference: is the phone near a power supply, wireless charger, fluorescent ballast, or microwave?',
      'If only on speakerphone: clean the speaker grille — dust and debris cause crackling at certain frequencies.',
      'If only when the far end speaks: the issue is their connection or hardware, not the local phone.',
    ],
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SymptomWizard() {
  const [path, setPath] = useState(['root'])

  const currentId = path[path.length - 1]
  const current = TREE[currentId]
  const isLeaf = !!current?.title

  function choose(next) {
    setPath(p => [...p, next])
  }

  function reset() {
    setPath(['root'])
  }

  function back() {
    if (path.length <= 1) return
    setPath(p => p.slice(0, -1))
  }

  // Build readable breadcrumb labels from the path
  const breadcrumbs = path.slice(0, -1).map(id => {
    const node = TREE[id]
    return node?.title || node?.q || null
  }).filter(Boolean)

  return (
    <div className="sw-root">
      <div className="sw-header">
        <div className="sw-title">Symptom Wizard</div>
        <div className="sw-subtitle">Guided troubleshooting — NetSapiens · Meta · Zultys · Yealink · Algo · Pangea</div>
      </div>

      {breadcrumbs.length > 0 && (
        <div className="sw-breadcrumb">
          <button type="button" className="sw-bc-item sw-bc-home" onClick={reset}>Start</button>
          {breadcrumbs.map((label, i) => (
            <span key={i} className="sw-bc-sep">
              <span className="sw-bc-arrow">›</span>
              <span className="sw-bc-item">{label}</span>
            </span>
          ))}
        </div>
      )}

      {!isLeaf && current && (
        <div className="sw-question-wrap">
          <div className="sw-question">{current.q}</div>
          <div className="sw-options">
            {current.opts.map(opt => (
              <button
                key={opt.next}
                type="button"
                className="sw-opt-btn"
                onClick={() => choose(opt.next)}
              >
                <span className="sw-opt-label">{opt.label}</span>
                <span className="sw-opt-arrow">→</span>
              </button>
            ))}
          </div>
          {path.length > 1 && (
            <button type="button" className="btn btn-secondary sw-back-btn" onClick={back}>
              ← Back
            </button>
          )}
        </div>
      )}

      {isLeaf && (
        <div className="sw-result">
          <div className="sw-result-header">
            <div className="sw-result-platform">{current.platform}</div>
            <div className="sw-result-title">{current.title}</div>
          </div>

          <ol className="sw-steps">
            {current.steps.map((step, i) => (
              <li key={i} className="sw-step">
                <span className="sw-step-num">{i + 1}</span>
                <span className="sw-step-text">{step}</span>
              </li>
            ))}
          </ol>

          {/* Direct tool links */}
          {current.tools?.length > 0 && (
            <div className="sw-tool-links">
              <span className="sw-tool-links-label">Open in ClearLine:</span>
              {current.tools.map(t => (
                <button
                  key={t.path}
                  type="button"
                  className="btn btn-primary sw-tool-btn"
                  onClick={() => navigate(t.path)}
                >
                  {t.label} →
                </button>
              ))}
            </div>
          )}

          {current.escalate && (
            <div className="sw-escalate">
              <div className="sw-escalate-label">Escalation path</div>
              <div className="sw-escalate-body">{current.escalate}</div>
            </div>
          )}

          <div className="sw-result-actions">
            <button type="button" className="btn btn-secondary" onClick={back}>← Back</button>
            <button type="button" className="btn btn-ghost" onClick={reset}>Start over</button>
          </div>
        </div>
      )}
    </div>
  )
}
