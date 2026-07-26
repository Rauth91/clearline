/**
 * Router vendor profiles for Router Advisor.
 * Conservative guidance — prefer “verify in current firmware docs” over invented syntax.
 */

/** @typedef {{ how: string, snippet?: string, steps?: string[] }} GuideBlock */

/**
 * VoIP platform SIP/RTP expectations.
 * Ranges are typical defaults — always verify against your specific cluster config.
 */
export const PLATFORM_PORTS = {
  netsapiens: {
    id: 'netsapiens',
    label: 'NetSapiens',
    sipUdp: [5060],
    sipTcp: [5060],
    sipTls: [5061],
    rtpUdp: { start: 10000, end: 20000 },
    registrationIntervalSec: 3600,
    notes: 'NetSapiens default RTP range is 10000–20000. Confirm with your NS cluster admin — some deployments use a narrower range. Registration default is 3600s; phones often re-register at 1800s.',
  },
  meta: {
    id: 'meta',
    label: 'Meta Switch',
    sipUdp: [5060],
    sipTcp: [5060],
    sipTls: [5061],
    rtpUdp: { start: 10000, end: 20000 },
    registrationIntervalSec: 3600,
    notes: 'Meta Switch hosted SIP typically uses 5060 UDP/TCP and RTP 10000–20000. Verify with your Meta tenant config — SIP TLS 5061 is available on some deployments.',
  },
  zultys: {
    id: 'zultys',
    label: 'Zultys MX',
    sipUdp: [5060],
    sipTcp: [5060],
    sipTls: [5061],
    rtpUdp: { start: 8000, end: 8200 },
    rtpUdpAlt: { start: 10000, end: 20000 },
    registrationIntervalSec: 3600,
    notes: 'Zultys MX default RTP range is 8000–8200. The alternate range (10000–20000) is configurable in MX Admin → System → RTP. Use 8000–8200 unless MX Admin shows otherwise.',
  },
}

export const CODEC_KBPS = {
  'g711': { label: 'G.711', kbps: 87.2 },
  'g722': { label: 'G.722', kbps: 87.2 },
  'g729': { label: 'G.729', kbps: 26.4 },
}

/** @type {Array<object>} */
export const ROUTER_PROFILES = [
  {
    id: 'cisco-ios',
    vendor: 'Cisco IOS / IOS-XE',
    platformNames: ['ISR', 'Catalyst', 'IOS-XE'],
    kind: 'cli',
    sipAlg: {
      how: 'Disable SIP NAT ALG / SIP fixup so SDP and RTP ports are not rewritten.',
      snippet: `! Verify commands against your IOS/IOS-XE train before applying
no ip nat service sip udp port 5060
no ip nat service sip tcp port 5060
! Older ASA-style (if applicable): no inspect sip`,
    },
    qos: {
      how: 'Trust DSCP on phone access ports; priority-queue EF (46) for RTP and CS3 (24) for SIP.',
      snippet: `! Example MQC sketch — adapt class-maps to your ACL/DSCP marks
class-map match-any VOICE-EF
 match dscp ef
class-map match-any VOICE-CS3
 match dscp cs3
policy-map WAN-OUT
 class VOICE-EF
  priority <PRIORITY_KBPS>
 class VOICE-CS3
  bandwidth percent 5
 class class-default
  fair-queue
! Apply outbound on the WAN interface
! interface <WAN>
!  service-policy output WAN-OUT`,
    },
    udpTimeout: {
      how: 'Raise UDP NAT timeout so registrations survive between refreshes.',
      snippet: 'ip nat translation timeout <UDP_TIMEOUT_SEC>  ! or udp-timeout on some trains',
      note: 'Prefer timeout ≥ 2× registration interval; verify CLI for your release.',
    },
    portForwardNote: 'Hosted seats: allow outbound SIP/RTP only — do not port-forward inbound RTP to phones.',
    dhcpOptionNote: 'Option 66/160 or vendor-option for Yealink provisioning if phones are on a dedicated VLAN/DHCP scope.',
    caveats: [
      'Verify SIP ALG / NAT service commands on your exact IOS train — syntax drifts.',
      'Do not invent ACL port lists from memory; match platformPorts below and carrier docs.',
    ],
  },
  {
    id: 'meraki-mx',
    vendor: 'Meraki MX',
    platformNames: ['MX', 'Meraki'],
    kind: 'gui',
    sipAlg: {
      how: 'Meraki does not expose classic “SIP ALG” the same way; disable SIP inspection helpers if present and avoid Layer-7 SIP “fix” that rewrites SDP.',
      steps: [
        'Security & SD-WAN → Threat protection / Firewall — ensure no SIP application rewrite is forcing media through unexpected paths.',
        'Confirm Uplink / SD-WAN does not pin VoIP into a path that breaks RTP symmetry.',
        'Document that Meraki’s “VoIP” traffic shaping is QoS, not SIP ALG — still verify call quality after changes.',
      ],
    },
    qos: {
      how: 'Use Traffic shaping rules: high priority for SIP/RTP (DSCP EF/CS3 or port-based).',
      steps: [
        'Security & SD-WAN → SD-WAN & traffic shaping → Traffic shaping rules.',
        'Create a rule matching VoIP (DSCP EF / CS3 or SIP+RTP ports) → Priority: High / ignore network limits as appropriate.',
        `Size priority capacity using the formula below (~<PRIORITY_KBPS> kbps for this site).`,
      ],
    },
    udpTimeout: {
      how: 'Meraki UDP timeouts are limited; use SIP keepalives / shorter registration if UDP mappings drop.',
      steps: [
        'Prefer shorter phone registration / keep-alive if NAT mappings expire mid-day.',
        'If using Auto VPN / SD-WAN, confirm hub policies do not drop long-lived UDP.',
      ],
      note: 'Confirm current Meraki UDP session behavior in the MX firmware notes for your release.',
    },
    portForwardNote: 'No 1:1 NAT or port forwards for hosted desk phones. Only forward if an on-site SBC requires published signaling/media.',
    dhcpOptionNote: 'Use VLAN + DHCP option for provisioning URL on the phone VLAN (Dashboard → Switching or MX addressing).',
    caveats: [
      'Meraki GUI labels change; verify against current Dashboard docs.',
      'Layer-7 firewall “VoIP” categories are not a substitute for correct NAT/QoS.',
    ],
  },
  {
    id: 'unifi',
    vendor: 'Ubiquiti UniFi',
    platformNames: ['UniFi', 'UDM', 'UXG'],
    kind: 'gui',
    sipAlg: {
      how: 'Disable SIP ALG / SIP module under Security / Firewall / Internet if present on your UniFi OS version.',
      steps: [
        'Settings → Security (or Firewall & Security) → locate SIP / SIP ALG / application control.',
        'Turn SIP ALG / SIP helper OFF.',
        'Apply and retest registration + two-way audio.',
      ],
    },
    qos: {
      how: 'Smart Queues / QoS: prioritize EF/CS3 or create a VoIP traffic rule toward the WAN.',
      steps: [
        'Settings → Internet / QoS / Smart Queues — enable with upload/download matching the ISP circuit.',
        'Add a traffic rule or DSCP trust for VoIP (EF for RTP, CS3 for SIP) if your UniFi OS version supports it.',
        'Reserve ~<PRIORITY_KBPS> kbps priority for voice for this seat count.',
      ],
    },
    udpTimeout: {
      how: 'Increase UDP timeout / NAT session timeout where UniFi exposes it; otherwise shorten SIP registration.',
      steps: [
        'Search Settings for NAT / session / UDP timeout (varies by UniFi OS).',
        'Set ≥ 2× registration interval when the control exists.',
      ],
      note: 'UniFi OS moves these knobs often — verify on your console version.',
    },
    portForwardNote: 'Do not port-forward RTP to phones for hosted VoIP. Port forwards only for an on-site SBC if required.',
    dhcpOptionNote: 'Networks → phone VLAN → DHCP option 66/160 (or UniFi “DHCP Options”) for provisioning.',
    caveats: [
      'UDM/UXG feature sets differ from USG — confirm path on your appliance.',
      'IDS/IPS can impair SIP; whitelist voice if you see one-way audio after enabling Threat Management.',
    ],
  },
  {
    id: 'fortigate',
    vendor: 'FortiGate',
    platformNames: ['FortiOS', 'FortiGate'],
    kind: 'cli',
    sipAlg: {
      how: 'Remove the SIP session-helper (and disable sip ALG profiles) so FortiOS does not rewrite SDP.',
      snippet: `config system session-helper
show
# delete the entry where protocol is SIP (often #12) — verify before delete
# delete <id>
end
config voip profile
edit "default"
  config sip
    set rtp disable   ! only if you intentionally disable RTP pinholes; prefer removing helper
  end
end
! Prefer: remove SIP session-helper; verify with current FortiOS cookbook for your version`,
    },
    qos: {
      how: 'Traffic shaping: priority for DSCP EF / CS3 or VoIP services toward the WAN.',
      snippet: `! Sketch — adapt shared-policy / shaping-policy to your FortiOS major version
config firewall shaping-policy
edit 10
  set name "VoIP-Priority"
  set service "SIP" "RTP"
  set dstintf "wan1"
  set traffic-shaper "VoIP-EF"
  set traffic-shaper-reverse "VoIP-EF"
next
end
! Create shaper with guaranteed bandwidth ~<PRIORITY_KBPS> kbps`,
    },
    udpTimeout: {
      how: 'Raise UDP session timers for SIP registrations.',
      snippet: `config system session-ttl
set default <UDP_TIMEOUT_SEC>
end
! Or per-policy session-ttl — verify FortiOS syntax for your release`,
      note: 'Use ≥ 2× registration interval.',
    },
    portForwardNote: 'VIP/port-forward only for on-site SBC. Hosted phones should dial out; no inbound RTP VIP to desks.',
    dhcpOptionNote: 'DHCP server option on the phone VLAN for Yealink provisioning URL.',
    caveats: [
      'SIP session-helper IDs differ by FortiOS version — always `show` before `delete`.',
      'SSL deep inspection on SIP/TLS can break registration; exempt voice if needed.',
    ],
  },
  {
    id: 'sonicwall',
    vendor: 'SonicWall',
    platformNames: ['SonicOS', 'TZ', 'NSa'],
    kind: 'gui',
    sipAlg: {
      how: 'Disable SIP transformations / Consistent NAT for SIP as recommended for hosted VoIP.',
      steps: [
        'VoIP → Settings (or Network → VoIP) → uncheck Enable SIP Transformations (wording varies by SonicOS).',
        'If “Consistent NAT” interacts badly with your provider, follow current SonicWall VoIP KB for hosted SIP.',
        'Apply and retest blind transfer + hold/resume.',
      ],
    },
    qos: {
      how: 'Enable VoIP / Bandwidth Management; prioritize SIP and RTP.',
      steps: [
        'Firewall Settings → BWM / VoIP — enable and set guaranteed bandwidth ~<PRIORITY_KBPS> kbps.',
        'Ensure access rules allow outbound SIP/RTP from the phone zone to WAN.',
      ],
    },
    udpTimeout: {
      how: 'Increase UDP connection cache / default UDP timeout for the phone zone.',
      steps: [
        'Firewall Settings → Advanced / Connection Settings — raise UDP timeout to ≥ 2× registration.',
        'Confirm SonicOS version-specific path in admin guide.',
      ],
      note: 'Menu names differ between SonicOS 6.5 / 7.',
    },
    portForwardNote: 'No inbound port forwards to phones for hosted service; only for an on-site SBC if required.',
    dhcpOptionNote: 'DHCP server options on the voice zone for provisioning.',
    caveats: [
      'SonicWall “Enable SIP Transformations” is the usual ALG equivalent — leave it off for most hosted seats.',
      'DPI-SSL can interfere; whitelist provisioning and SIP hosts if phones fail to download configs.',
    ],
  },
  {
    id: 'pfsense',
    vendor: 'pfSense / OPNsense',
    platformNames: ['pfSense', 'OPNsense', 'FreeBSD'],
    kind: 'mixed',
    sipAlg: {
      how: 'Do not enable siproxd / SIP proxy packages unless you intentionally terminate SIP. Keep outbound NAT static-port for phones.',
      snippet: `# pfSense: Firewall → NAT → Outbound → Hybrid/Advanced
# Static port for UDP from phone net (preserves RTP ports)
# Shell note (verify before use):
# pfctl -s nat
# No siproxd unless designed in`,
      steps: [
        'Firewall → NAT → Outbound: use Hybrid and add static-port mappings for the phone network.',
        'Ensure no siproxd / FreeSWITCH packages are rewriting SIP unless intentional.',
      ],
    },
    qos: {
      how: 'Limiter / traffic shaper: priority queue for EF/CS3 or SIP+RTP.',
      steps: [
        'Firewall → Traffic Shaper — create HFSC/CBQ with a realtime voice queue ~<PRIORITY_KBPS> kbps.',
        'Floating rules: match DSCP EF/CS3 or ports → assign to voice queue on WAN out.',
      ],
      snippet: '# Prefer GUI shaper; CLI pf rules are site-specific — do not paste blind.',
    },
    udpTimeout: {
      how: 'System → Advanced → Firewall & NAT — UDP timeout.',
      snippet: '# Firewall Maximum UDP Timeouts → set ≥ 2× registration (seconds)',
      steps: [
        'System → Advanced → Firewall & NAT → UDP Timeouts ≥ 2× registration interval.',
      ],
      note: 'OPNsense path: Firewall → Settings → Advanced.',
    },
    portForwardNote: 'No WAN port forwards to phones. Port forward / 1:1 only for on-site SBC.',
    dhcpOptionNote: 'Services → DHCP → phone VLAN → Additional Options for provisioning.',
    caveats: [
      'Static-port outbound NAT is critical for RTP on many hosted platforms.',
      'Packages (ntop, IDS) can add latency — monitor MOS after enabling.',
    ],
  },
  {
    id: 'mikrotik',
    vendor: 'MikroTik RouterOS',
    platformNames: ['RouterOS', 'CCR', 'hEX'],
    kind: 'cli',
    sipAlg: {
      how: 'Disable SIP ALG / sip helper in the firewall service ports list.',
      snippet: `/ip firewall service-port
set sip disabled=yes
print
# Confirm sip shows disabled`,
    },
    qos: {
      how: 'Queue tree / simple queues: prioritize DSCP EF and CS3 toward the WAN.',
      snippet: `/ip firewall mangle
add chain=prerouting action=mark-packet new-packet-mark=voice-ef passthrough=no dscp=46 comment="RTP EF"
add chain=prerouting action=mark-packet new-packet-mark=voice-cs3 passthrough=no dscp=24 comment="SIP CS3"
/queue tree
add name=wan-voice parent=<WAN> packet-mark=voice-ef priority=1 limit-at=<PRIORITY_KBPS>k max-limit=<PRIORITY_KBPS>k
# Adapt interface names; verify RouterOS v6 vs v7 queue syntax`,
    },
    udpTimeout: {
      how: 'Raise UDP stream timeout in connection tracking.',
      snippet: `/ip firewall connection tracking
set udp-timeout=<UDP_TIMEOUT_SEC>
# or udp-stream-timeout on some versions — check /ip firewall connection tracking print`,
      note: '≥ 2× registration interval.',
    },
    portForwardNote: 'No dst-nat for desk phones on hosted VoIP; dst-nat only for on-site SBC if needed.',
    dhcpOptionNote: 'DHCP network option for provisioning URL on the voice VLAN.',
    caveats: [
      'RouterOS v6/v7 queue and firewall syntax differ — test in lab.',
      'fasttrack can bypass queues; exclude voice marks from fasttrack if QoS is required.',
    ],
  },
  {
    id: 'adtran',
    vendor: 'Adtran NetVanta',
    platformNames: ['NetVanta', 'Adtran'],
    kind: 'mixed',
    sipAlg: {
      how: 'Disable SIP ALG / SIP stub if the NetVanta image exposes it (common on older AOS).',
      snippet: `! Example — confirm against your AOS release notes
no ip firewall alg sip
! or: voip sip alg disable   (wording varies)`,
      steps: [
        'Search running-config / GUI for “sip alg” / “firewall alg sip” and disable.',
        'Save and retest transfers.',
      ],
    },
    qos: {
      how: 'Map EF/CS3 into priority/low-latency queue on the WAN interface.',
      steps: [
        'Configure class-maps matching DSCP EF and CS3 (or SIP/RTP ACLs).',
        'Priority bandwidth ~<PRIORITY_KBPS> kbps on the WAN policy-map.',
      ],
      snippet: '! Prefer vendor QoS wizard/docs for your AOS version before pasting class-maps',
    },
    udpTimeout: {
      how: 'Increase UDP NAT / firewall session timeout for SIP registrations.',
      steps: [
        'Locate UDP timeout under firewall/NAT settings (CLI or GUI).',
        'Set ≥ 2× registration interval.',
      ],
      note: 'Confirm command on your AOS train.',
    },
    portForwardNote: 'Hosted phones: outbound only. Forward only if an SBC is on-site.',
    dhcpOptionNote: 'DHCP options on voice VLAN for phone provisioning.',
    caveats: [
      'NetVanta SIP features differ widely by AOS — treat snippets as starting points only.',
    ],
  },
  {
    id: 'omada',
    vendor: 'TP-Link Omada',
    platformNames: ['Omada', 'ER', 'OC'],
    kind: 'gui',
    sipAlg: {
      how: 'Disable SIP ALG under Firewall / ALG settings on the gateway.',
      steps: [
        'Omada Controller → Settings → Wired Networks / Gateway → ALG (path varies).',
        'Turn SIP ALG Off → Apply.',
        'Retest registration and attended transfer.',
      ],
    },
    qos: {
      how: 'QoS / Bandwidth Control: high priority for voice DSCP or ports.',
      steps: [
        'Create a QoS rule for SIP/RTP or DSCP EF/CS3 with guaranteed ~<PRIORITY_KBPS> kbps.',
        'Ensure the phone VLAN is included in the rule source.',
      ],
    },
    udpTimeout: {
      how: 'Raise UDP session timeout if Omada exposes NAT session timers; otherwise shorten registration.',
      steps: [
        'Search gateway advanced / NAT session settings for UDP timeout.',
        'Set ≥ 2× registration when available.',
      ],
      note: 'Controller versions move menus — verify on your Omada release.',
    },
    portForwardNote: 'No port forwarding to phones for hosted VoIP; only for on-site SBC.',
    dhcpOptionNote: 'DHCP option on the voice LAN for Yealink provisioning server.',
    caveats: [
      'Omada gateway models differ (ER605 vs larger) — confirm ALG page exists on your SKU.',
    ],
  },
  {
    id: 'generic',
    vendor: 'Generic / unknown',
    platformNames: ['Other', 'Unknown'],
    kind: 'gui',
    sipAlg: {
      how: 'Find and disable SIP ALG, SIP Fixup, SIP Transformations, or SIP session helper — whatever the vendor calls SDP rewriting.',
      steps: [
        'Search admin UI/docs for: SIP ALG, SIP Fixup, SIP Transformations, SIP helper, VoIP ALG.',
        'Disable it; save/apply; reboot only if the vendor requires it.',
        'Retest: register, outbound call, hold/resume, attended transfer, parking.',
      ],
    },
    qos: {
      how: 'Prioritize DSCP EF (46) for RTP and CS3 (24) for SIP on the WAN egress.',
      steps: [
        'Enable QoS / traffic shaping on the WAN.',
        'Match DSCP EF → priority/LLQ; DSCP CS3 → assured forwarding.',
        'Guarantee ~<PRIORITY_KBPS> kbps for voice for this seat count.',
      ],
    },
    udpTimeout: {
      how: 'Set UDP/NAT session timeout ≥ 2× the SIP registration interval.',
      steps: [
        'Locate UDP timeout / NAT session timeout.',
        'Set seconds ≥ 2× registration interval (see platform section).',
      ],
      note: 'If the knob does not exist, lower phone registration interval / enable keep-alives.',
    },
    portForwardNote: 'Default: no inbound forwards. Exception only for an on-site SBC/edge.',
    dhcpOptionNote: 'If phones are isolated on a VLAN, add DHCP provisioning options (66/160/vendor).',
    caveats: [
      'Identify the exact appliance firmware before changing ALG/QoS.',
      'When unsure, capture SIP+RTP (Packet Capture tool) before and after changes.',
    ],
  },
]

export function getProfile(id) {
  return ROUTER_PROFILES.find(p => p.id === id) || ROUTER_PROFILES.find(p => p.id === 'generic')
}

export function searchProfiles(query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return ROUTER_PROFILES
  return ROUTER_PROFILES.filter(p => {
    const hay = [p.vendor, p.id, ...(p.platformNames || [])].join(' ').toLowerCase()
    return hay.includes(q)
  })
}
