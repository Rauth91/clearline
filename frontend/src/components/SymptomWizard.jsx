/**
 * SymptomWizard — Guided VoIP troubleshooting tree
 * Covers: NetSapiens, Meta, Zultys, Yealink phones/server
 */

import { useState } from 'react'

// ─── Tree Definition ──────────────────────────────────────────────────────────
// Each node: { id, question, options: [{ label, next }] }
// Leaf nodes: { id, title, platform, steps: [], escalate? }

const TREE = {
  root: {
    q: 'What is the main symptom?',
    opts: [
      { label: 'Phones not ringing / missed calls',   next: 'no_ring' },
      { label: 'Calls dropping mid-call',              next: 'drop' },
      { label: 'One-way or no audio',                  next: 'audio' },
      { label: 'Can\'t make outbound calls',           next: 'outbound' },
      { label: 'Registration / offline phones',        next: 'reg' },
      { label: 'Paging not working',                   next: 'paging' },
      { label: 'Fax failures (Pangea)',                next: 'fax' },
      { label: 'Auto-attendant / IVR issues',          next: 'aa' },
      { label: 'Poor call quality (choppy/echo)',      next: 'quality' },
    ],
  },

  // ── No Ring ───────────────────────────────────────────────────────────────
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
      'Check NetSapiens portal → Subscribers → confirm DID is mapped to the correct subscriber/hunt group.',
      'Verify the subscriber\'s "Answering Rules" are not forwarding all calls to voicemail or another number.',
      'Check Time Frames: confirm the active time frame matches the current time and is routing to the right destination.',
      'In Call History, find the inbound call and check the ladder diagram — look for where it terminates (busy, no answer, forwarded?).',
      'Confirm the Yealink phone is registered: Admin → Devices → check "Last Seen" timestamp.',
      'On the phone, verify DND (Do Not Disturb) is not enabled — check the DND key LED and web UI.',
      'If a hunt group: Admin → Hunt Groups → confirm members are listed and "Ring All" or sequential order is correct.',
      'Check if inbound DID is pointed at an auto-attendant that has an incomplete schedule — time frame gap causes calls to drop.',
    ],
    escalate: 'If DID is mapped correctly and calls still don\'t arrive at the phone, capture a packet trace on the NetSapiens server or pull the SIP log from the Call Diagnostic tool.',
  },
  no_ring_meta: {
    title: 'Phones not ringing — Meta',
    platform: 'Meta',
    steps: [
      'Log into the Meta admin portal and check the ring group / extension routing for the DID.',
      'Confirm the Yealink phone is registered to Meta: check Devices in the portal.',
      'Verify the user\'s "Find Me / Follow Me" settings aren\'t routing away from the desk phone.',
      'Check business hours rules — if after-hours routing is misconfigured, calls may hit voicemail immediately.',
      'Check voicemail-to-email settings; if mailbox is full, calls may reject.',
      'On the Yealink phone, verify DND is off and the correct line is active.',
    ],
    escalate: 'Contact Meta support with the inbound DID, timestamp, and originating number for a SIP trace.',
  },
  no_ring_zultys: {
    title: 'Phones not ringing — Zultys',
    platform: 'Zultys',
    steps: [
      'Open Zultys MX Administrator → Users → confirm the extension is active and DID is assigned.',
      'Check Ring Groups: verify the phone is a member and no member override is in place.',
      'Confirm MX-E or MXvirtual trunk is online: Trunks → check SIP trunk status.',
      'Verify the Yealink phone is registered: check SIP registrations in MX Admin.',
      'In MX call logs, find the inbound call and trace its routing path.',
      'Check if "Auto Answer" or "DND" is set on the user\'s profile.',
    ],
    escalate: 'Enable SIP debug logging on the MX and capture the call attempt for Zultys support.',
  },

  // ── Dropping Calls ────────────────────────────────────────────────────────
  drop: {
    q: 'When do calls drop?',
    opts: [
      { label: 'At exactly 30 or 32 seconds',     next: 'drop_timer' },
      { label: 'After a transfer',                 next: 'drop_transfer' },
      { label: 'Randomly during the call',         next: 'drop_random' },
      { label: 'When placed on hold',              next: 'drop_hold' },
    ],
  },
  drop_timer: {
    title: 'Calls dropping at ~30 seconds',
    platform: 'NetSapiens / SIP general',
    steps: [
      '30-second drops are almost always a SIP 200 OK / ACK routing problem — the ACK never makes it back to the carrier.',
      'Check for NAT: the phone\'s Contact header is likely sending a private IP. Enable "SIP ALG" fix on the router or disable SIP ALG if it\'s mangling packets.',
      'On the Yealink phone web UI → Network → NAT: set "NAT Traversal" to STUN or enable "Keep-Alive".',
      'On NetSapiens: check the SBC/proxy settings — confirm RTP proxying is enabled so media doesn\'t go direct.',
      'Verify the firewall is not blocking the ACK packet returning on UDP 5060.',
      'Pull the call from Call Diagnostic — look for a 200 OK followed by no ACK in the ladder, then a BYE at ~30s.',
    ],
    escalate: 'If ACK is being sent but carrier is still dropping, capture a pcap on the WAN interface and share with the carrier.',
  },
  drop_transfer: {
    title: 'Calls dropping after transfer',
    platform: 'NetSapiens / Yealink',
    steps: [
      'Confirm transfer type: Attended (consult then transfer) vs Blind (direct). Both can fail differently.',
      'Check Yealink transfer key config — for blind transfer, programablekey type should be 3 (Transfer).',
      'On NetSapiens, enable "Transfer Routing" in the domain settings to ensure re-INVITE is handled server-side.',
      'Check if the receiving extension has call waiting enabled — if not, a second call during transfer is rejected.',
      'Test with a direct dial instead of transfer to rule out the endpoint being the issue.',
      'In Call Diagnostic, look for REFER or re-INVITE in the ladder — a 4xx on either = permission or routing issue.',
    ],
  },
  drop_random: {
    title: 'Calls dropping randomly',
    platform: 'General',
    steps: [
      'Check internet circuit stability: run a continuous ping to 8.8.8.8 and monitor for packet loss.',
      'Review QoS policy on the router/switch — SIP (UDP 5060) and RTP (UDP 10000-20000) need DSCP EF (46) priority.',
      'Check for bandwidth saturation: if the circuit is shared, heavy downloads/uploads can kill active calls.',
      'Inspect the Yealink phone\'s registration keep-alive interval — set to 30–60 seconds to prevent session timeout.',
      'On NetSapiens, check the SIP OPTIONS ping interval for the trunk — a failing OPTIONS probe will tear down calls.',
      'Look for RTP timeout: if there\'s no media for 30+ seconds (e.g., hold with no comfort noise), the session may be dropped.',
    ],
    escalate: 'Set up a continuous SIP monitor on the trunk and capture a drop event with timestamps for carrier escalation.',
  },
  drop_hold: {
    title: 'Calls dropping when placed on hold',
    platform: 'NetSapiens / Yealink',
    steps: [
      'This is almost always an RTP / media path issue. When on hold, the Yealink sends a re-INVITE with a=sendonly.',
      'Check if the carrier or far-end supports RTP hold — some carriers send BYE if they stop receiving RTP.',
      'On Yealink web UI → Features → General: enable "RFC 2543 Hold" if the carrier requires it.',
      'Verify the phone is sending "comfort noise" during hold (sendonly vs inactive SDP).',
      'Check NetSapiens domain: confirm MOH (Music on Hold) is configured and the media server is reachable.',
      'Test hold with an internal call first — if internal hold works, the issue is with the carrier\'s hold behavior.',
    ],
  },

  // ── Audio Issues ──────────────────────────────────────────────────────────
  audio: {
    q: 'Describe the audio issue:',
    opts: [
      { label: 'One-way audio (I can hear them but they can\'t hear me, or vice versa)', next: 'audio_oneway' },
      { label: 'No audio at all (both sides silent)',                                    next: 'audio_none' },
      { label: 'Audio works on some calls but not others',                               next: 'audio_intermittent' },
    ],
  },
  audio_oneway: {
    title: 'One-way audio',
    platform: 'SIP / NAT',
    steps: [
      'One-way audio = RTP is flowing one direction only. This is a classic NAT problem.',
      'The phone\'s RTP packets are leaving from a private IP that the far end can\'t route back to.',
      'Check Yealink web UI → Network → NAT settings. Enable "NAT Traversal" or set a STUN server.',
      'On NetSapiens SBC: ensure "Force RTP Proxy" is enabled for the domain — all media should pass through the server.',
      'Check firewall: UDP port range 10000–20000 (or whatever RTP range is configured) must be open both ways.',
      'Verify the Yealink\'s "Local RTP Port" setting matches what the firewall allows.',
      'In Call Diagnostic, look at codec negotiation — if SDP has different ports for send vs receive, NAT is the issue.',
      'Test using a softphone on the same network — if softphone has audio but Yealink doesn\'t, it\'s phone-level NAT.',
    ],
  },
  audio_none: {
    title: 'No audio both ways',
    platform: 'General',
    steps: [
      'Check codec mismatch: in Call Diagnostic → SDP section, verify both sides agree on a common codec.',
      'Common mismatch: Yealink offers G.722.1 (Siren) but carrier only supports G.711 PCMU/PCMA.',
      'On Yealink web UI → Account → Codec: disable G.722.1 and Opus for carrier trunks; leave G.711u/a enabled.',
      'Verify RTP is flowing: pull a pcap on the LAN — you should see UDP packets to/from the carrier IP on port 10000+.',
      'Check if a firewall rule is blocking RTP entirely (different port range than SIP 5060).',
      'Confirm the Yealink has a valid IP and default gateway — a routing issue can pass SIP but block RTP to different subnets.',
    ],
  },
  audio_intermittent: {
    title: 'Intermittent audio / some calls no audio',
    platform: 'General',
    steps: [
      'This usually means different call paths hit different NAT conditions or different codecs.',
      'Check if the issue correlates with call direction: inbound vs outbound, or specific DIDs.',
      'Review codec priority: if G.722.1 is first in the list, some carriers accept it and some reject it.',
      'Check network switching — if calls route through different paths (MPLS vs internet), one path may block RTP.',
      'Verify all phones are using the same firmware version — audio bugs are sometimes firmware-specific.',
      'Enable RTP statistics on Yealink (web UI → Status → RTP) during a bad call and capture packet loss/jitter values.',
    ],
  },

  // ── Outbound ─────────────────────────────────────────────────────────────
  outbound: {
    q: 'What happens when you try to dial out?',
    opts: [
      { label: 'Fast busy / reorder tone immediately',    next: 'ob_busy' },
      { label: '403 Forbidden or 407 Auth error',         next: 'ob_auth' },
      { label: 'Phone shows "Not Registered"',            next: 'reg' },
      { label: 'Rings but nobody answers (carrier side)', next: 'ob_ring' },
    ],
  },
  ob_busy: {
    title: 'Outbound calls — fast busy / immediate rejection',
    platform: 'NetSapiens / Carrier',
    steps: [
      'Fast busy on outbound usually means the call is not reaching the carrier at all.',
      'Check NetSapiens → Trunks: confirm the outbound trunk is registered/active (green status).',
      'Verify outbound dial plan: Admin → Dial Plan → check that 10-digit and 11-digit patterns exist and point to the correct trunk.',
      'Check if the caller ID (From header) is authorized by the carrier — a non-whitelisted number causes immediate rejection.',
      'Test with a known-good number format: try 1NPANXXXXXX vs NPANXXXXXX.',
      'On the Yealink, check "Outbound Proxy" setting — if pointed at wrong server, SIP INVITE never reaches NetSapiens.',
    ],
  },
  ob_auth: {
    title: 'Outbound calls — 403 Forbidden or 407 Auth challenge',
    platform: 'NetSapiens / SIP',
    steps: [
      '407 Proxy Auth Required is normal — the phone or NetSapiens should auto-respond with credentials.',
      'If the call fails after 407, credentials are wrong: check the trunk username/password in NetSapiens → Carriers.',
      '403 Forbidden means the carrier is rejecting outright — usually a caller ID or IP whitelist issue.',
      'Confirm the public IP of the NetSapiens server is whitelisted at the carrier.',
      'On Yealink: if account auth fails (401), re-enter the SIP password in web UI → Account → Register.',
      'In Call Diagnostic, look for the 407 challenge followed by the re-INVITE — if re-INVITE is missing, the platform isn\'t handling auth.',
    ],
  },
  ob_ring: {
    title: 'Outbound rings but goes to carrier voicemail / not answered',
    platform: 'Carrier',
    steps: [
      'This is normal if the called party doesn\'t answer. Verify the called number is correct.',
      'Check if calls to that number go through from a mobile — if not, carrier routing issue on their end.',
      'Some carriers have CNAM lookup delays — the caller ID may be showing incorrectly and the recipient is ignoring it.',
      'Verify CNAM is registered for your outbound DID with the carrier.',
      'If the phone shows the call was placed but billing shows nothing, the carrier is dropping it before the network.',
    ],
  },

  // ── Registration ──────────────────────────────────────────────────────────
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
      'On Yealink web UI → Status → check SIP account status. Should show "Registered". If "Failed", note the error code.',
      '401/403: credentials wrong. Verify SIP username/password matches NetSapiens subscriber settings.',
      '408 Timeout: network issue. Ping the NetSapiens proxy from the phone\'s subnet.',
      'Check Yealink → Account → SIP Server 1: confirm the hostname/IP and port (usually 5060).',
      'Verify DNS resolves the NetSapiens hostname from the phone\'s network.',
      'Check if a firewall is blocking UDP 5060 outbound from the phone VLAN.',
      'On NetSapiens portal → Devices: confirm the device is provisioned with the correct MAC address.',
      'If using Yealink server (RPS), confirm the redirect is pointing to the correct NetSapiens proxy.',
    ],
    escalate: 'Enable SIP debug on the Yealink (web UI → Settings → Configuration → Phone Debug) and capture the REGISTER exchange.',
  },
  reg_meta: {
    title: 'Phone offline / registration failed — Meta',
    platform: 'Meta',
    steps: [
      'Check Yealink web UI → Account → SIP Server: confirm it matches the Meta SIP proxy address.',
      'Verify account credentials match the Meta user\'s SIP credentials exactly (case-sensitive).',
      'Meta uses TLS/SRTP on some deployments — check if TLS is required and the phone\'s transport is set to TLS.',
      'Confirm port: Meta may use 5061 (TLS) instead of 5060 (UDP). Check Yealink → Account → SIP Server Port.',
      'If the phone was previously working, check if Meta changed their proxy address or if there was a password reset.',
    ],
  },
  reg_zultys: {
    title: 'Phone offline / registration failed — Zultys',
    platform: 'Zultys',
    steps: [
      'Open Zultys MX Admin → Current Status → SIP Registrations. Find the extension and check status.',
      'Verify the Yealink is configured to register to the MX IP/hostname on port 5060.',
      'Check MX user: User must have "SIP Phone" assigned, not just softphone.',
      'Verify the SIP password in MX User → Advanced matches the Yealink account password.',
      'Confirm the Yealink is on a VLAN/subnet that can reach the MX — check routing.',
      'Check MX firewall rules: UDP 5060 and RTP range must be allowed from the phone subnet.',
    ],
  },

  // ── Paging ────────────────────────────────────────────────────────────────
  paging: {
    q: 'What type of paging issue?',
    opts: [
      { label: 'Algo paging unit not receiving pages',          next: 'paging_algo_rx' },
      { label: 'Phones not receiving multicast page',           next: 'paging_phone_rx' },
      { label: 'One-way audio on page (can\'t hear the page)',  next: 'paging_audio' },
    ],
  },
  paging_algo_rx: {
    title: 'Algo unit not receiving pages',
    platform: 'Algo',
    steps: [
      'Open Algo web UI (default: http://[device-IP]) → SIP → verify SIP registration status.',
      'Check the Algo is registered to the same server as the phones (NetSapiens or Zultys).',
      'If using multicast: Algo web UI → Multicast → confirm the multicast group IP and port match the Yealink paging key.',
      'Common multicast group: 224.1.1.1, port 10000. Must match exactly on both Yealink and Algo.',
      'Verify multicast routing is enabled on the switch/router — IGMP snooping must allow the multicast group.',
      'Test with a direct SIP call to the Algo extension first to rule out audio hardware issues.',
      'Check Algo volume/output settings — unit may be receiving but volume is set to 0.',
      'Confirm the Algo is on the same VLAN as the phones or multicast is routed between VLANs.',
    ],
  },
  paging_phone_rx: {
    title: 'Phones not receiving multicast page',
    platform: 'Yealink',
    steps: [
      'On Yealink web UI → Features → Paging/Intercom: verify "Paging Barge In" is enabled.',
      'Check the multicast listening address: should match the multicast group the paging key sends to (e.g., 224.1.1.1:10000).',
      'Yealink multicast listen config: settings.cfg → multicastpaging.receive_priority.X, multicastpaging.listen_address.X.ip_address',
      'Ensure all phones are on a VLAN that receives multicast — check switch IGMP snooping.',
      'Verify the paging key sends to the correct group: programablekey.N.type = 24, programablekey.N.value = 224.1.1.1:10000.',
      'Test with one phone close to the paging server on the same switch to rule out routing.',
    ],
  },
  paging_audio: {
    title: 'One-way audio on paging',
    platform: 'Algo / Yealink',
    steps: [
      'If you can\'t hear the page: check the Algo speaker output and volume.',
      'If the Algo can\'t hear the person paging: verify the Algo microphone input (some models have an external mic jack).',
      'Check codec: Algo and Yealink must agree — G.711 PCMU is safest. Disable G.722.1 on the Algo SIP account.',
      'For multicast pages: audio is unidirectional by design — the listener cannot talk back.',
      'Verify RTP port range: Algo uses a specific RTP port range; check it\'s not firewalled.',
    ],
  },

  // ── Fax ──────────────────────────────────────────────────────────────────
  fax: {
    q: 'What is happening with fax?',
    opts: [
      { label: 'Outbound fax fails to send',    next: 'fax_out' },
      { label: 'Inbound fax not received',      next: 'fax_in' },
      { label: 'Pangea portal not receiving',   next: 'fax_portal' },
    ],
  },
  fax_out: {
    title: 'Outbound fax failures — Pangea',
    platform: 'Pangea',
    steps: [
      'Log into Pangea portal and check the outbound fax job status and error code.',
      'Common failure: T.38 negotiation failed — the carrier doesn\'t support T.38. Switch to G.711 passthrough (fax over voice).',
      'Check if the destination fax number is correct — test with a known-good fax number.',
      'Verify outbound fax is sending from a number that has fax capability on Pangea.',
      'Check file format: Pangea accepts PDF and TIFF. Some files with complex graphics fail to convert.',
      'Check Pangea API status page for any known outages.',
      'Confirm the Pangea account is not over its monthly page limit.',
    ],
  },
  fax_in: {
    title: 'Inbound fax not received',
    platform: 'Pangea',
    steps: [
      'Verify the inbound DID is pointed to the Pangea fax endpoint, not a voice destination.',
      'Check the Pangea portal → Inbound → confirm the DID is listed and active.',
      'Check the email address for fax-to-email delivery — confirm it\'s correct and not in spam.',
      'If using a webhook, verify the webhook endpoint is reachable and returning 200 OK.',
      'Check sender compatibility — some older fax machines only support V.34 or lower, which may need specific Pangea settings.',
      'Ask the sender to confirm the fax was sent successfully on their end (transmission report).',
    ],
  },
  fax_portal: {
    title: 'Pangea portal issues',
    platform: 'Pangea',
    steps: [
      'Check https://status.pangea.io for any active incidents.',
      'Clear browser cache and try a different browser or incognito window.',
      'Verify login credentials — Pangea accounts can expire or be locked after inactivity.',
      'If API integration: check API key is valid and has not been rotated.',
      'Contact Pangea support: support@pangea.cloud with account ID and affected DID.',
    ],
  },

  // ── Auto-Attendant ────────────────────────────────────────────────────────
  aa: {
    q: 'What is the auto-attendant issue?',
    opts: [
      { label: 'DTMF digits not working (menu selections not recognized)', next: 'aa_dtmf' },
      { label: 'Calls not routing to correct destination after selection',  next: 'aa_route' },
      { label: 'Greeting plays but call drops after',                       next: 'aa_drop' },
    ],
  },
  aa_dtmf: {
    title: 'Auto-attendant DTMF not working',
    platform: 'NetSapiens / Yealink',
    steps: [
      'DTMF failure is almost always a signaling method mismatch.',
      'NetSapiens expects RFC 2833 (DTMF in RTP). Check Yealink web UI → Account → DTMF: set to "RFC 2833".',
      'Some carriers require SIP INFO DTMF — check which method the carrier is configured for on the trunk.',
      'On Yealink, confirm DTMF payload type is 101 (standard for RFC 2833).',
      'Test DTMF with a softphone — if it works there but not on Yealink, it\'s a phone firmware/config issue.',
      'Check if NAT is causing DTMF RTP packets to be dropped — use the Call Diagnostic to verify RTP flow.',
      'In NetSapiens portal: Auto Attendant → DTMF Timeout. Increase the timeout if the caller needs more time.',
    ],
  },
  aa_route: {
    title: 'Auto-attendant routing wrong destination',
    platform: 'NetSapiens',
    steps: [
      'Log into NetSapiens → Auto Attendants → select the attendant → review each DTMF key assignment.',
      'Check for overlapping dial plan: pressing 1 might match both "1" and a 10-digit number starting with 1.',
      'Verify time frame: after-hours menu may be loading instead of business-hours menu if time frames overlap.',
      'Test each key individually and log the resulting route in Call History.',
      'Confirm destination extensions/hunt groups exist — a deleted extension causes routing to fall through.',
    ],
  },
  aa_drop: {
    title: 'Auto-attendant drops call after greeting',
    platform: 'NetSapiens',
    steps: [
      'This usually means no DTMF was received and the "No Input" action is set to "Disconnect".',
      'In NetSapiens → Auto Attendants: change the "No Input" action to loop back to the greeting or transfer to an operator.',
      'Check DTMF timeout setting — if it\'s too short, the attendant gives up before the caller can press a key.',
      'Verify the greeting audio file is not corrupted — upload a fresh WAV file (8kHz, 16-bit, mono).',
      'Test with a softphone that has known-good audio to rule out DTMF detection failure.',
    ],
  },

  // ── Quality ───────────────────────────────────────────────────────────────
  quality: {
    q: 'What does the quality problem sound like?',
    opts: [
      { label: 'Choppy / robotic voice (jitter)',       next: 'qual_jitter' },
      { label: 'Echo (hearing yourself or the far end)', next: 'qual_echo' },
      { label: 'Static / crackling',                    next: 'qual_static' },
    ],
  },
  qual_jitter: {
    title: 'Choppy / robotic audio — jitter',
    platform: 'Network / QoS',
    steps: [
      'Run a VoIP quality test from the site: test at https://www.voip-info.org/tools (or similar).',
      'Check jitter buffer on Yealink: web UI → Account → Advanced → Jitter Buffer. Set to "Adaptive" and max 120ms.',
      'Enable QoS on the router/switch: SIP (UDP 5060) and RTP (UDP 10000-20000) need DSCP EF (46) = highest priority.',
      'Check for bandwidth saturation during the call — other devices downloading/uploading can cause jitter.',
      'Verify the phone VLAN has dedicated bandwidth and QoS markings are honored at the WAN edge.',
      'If the site uses a shared internet circuit, check if ISP is applying traffic shaping to VoIP ports.',
      'In Yealink Status → RTP, check "Jitter" value during a call. Above 20ms is noticeable; above 50ms is severe.',
    ],
  },
  qual_echo: {
    title: 'Echo during calls',
    platform: 'Yealink / Acoustic',
    steps: [
      'Echo from the near end: the phone\'s speaker is feeding back into the microphone. Reduce speaker volume.',
      'On Yealink handset: acoustic echo cancellation (AEC) should be on by default. Verify in web UI → Features → Audio.',
      'Echo from the far end: their phone or headset is the source. Ask them to lower speaker volume.',
      'Long-delay echo (300ms+) is a network echo — check for echo cancellation on the trunk in NetSapiens.',
      'Sidetone echo: check Yealink sidetone settings — "Sidetone Gain" set too high causes self-echo.',
      'Speakerphone echo: Yealink speakerphone needs clearance — don\'t put objects near the mic.',
      'Check for TDM/analog interface echo if calls pass through an ATA (Algo, Grandstream) — enable echo cancellation on the ATA.',
    ],
  },
  qual_static: {
    title: 'Static / crackling audio',
    platform: 'Yealink / Physical',
    steps: [
      'Check the physical handset cord — coiled cords often develop shorts over time. Replace with a known-good cord.',
      'Try a different headset or handset on the same phone.',
      'Check the Ethernet cable and switch port — a bad cable can cause packet loss that manifests as audio artifacts.',
      'Update Yealink firmware — audio driver bugs are fixed in newer versions.',
      'Check for electromagnetic interference: is the phone near a power supply, microwave, or fluorescent light?',
      'If only on speakerphone: clean the speaker grille (dust can cause crackling).',
      'If only on one call destination: the issue is likely the far end\'s connection, not the local phone.',
    ],
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SymptomWizard() {
  const [path, setPath] = useState(['root'])
  const [done, setDone] = useState(false)

  const currentId = path[path.length - 1]
  const current = TREE[currentId]
  const isLeaf = !!current?.title

  function choose(next) {
    setPath(p => [...p, next])
    if (TREE[next]?.title) setDone(true)
  }

  function reset() {
    setPath(['root'])
    setDone(false)
  }

  function back() {
    if (path.length <= 1) return
    const prev = path.slice(0, -1)
    setPath(prev)
    setDone(TREE[prev[prev.length - 1]]?.title ? true : false)
  }

  const breadcrumbs = path.slice(1).map(id => TREE[id]?.q || TREE[id]?.title).filter(Boolean)

  return (
    <div className="sw-root">
      <div className="sw-header">
        <div className="sw-title">Symptom Wizard</div>
        <div className="sw-subtitle">Guided troubleshooting for NetSapiens · Meta · Zultys · Yealink</div>
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

      {!isLeaf && (
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
          {current.escalate && (
            <div className="sw-escalate">
              <span className="sw-escalate-icon">📞</span>
              <span>{current.escalate}</span>
            </div>
          )}
          <div className="sw-result-actions">
            <button type="button" className="btn btn-secondary" onClick={back}>← Back</button>
            <button type="button" className="btn btn-primary" onClick={reset}>Start Over</button>
          </div>
        </div>
      )}
    </div>
  )
}
