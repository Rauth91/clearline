/**
 * YealinkCodes — Searchable Yealink config code generator
 * Covers programmable keys, basic settings, LED, network, SIP, audio, display, and more.
 */

import { useState, useMemo } from 'react'

// ─── Data ────────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Programmable Keys', 'Basic', 'LED', 'Network', 'SIP', 'Audio', 'Display', 'Security', 'Provisioning', 'Call Settings']

const CODES = [
  // ── PROGRAMMABLE KEYS ────────────────────────────────────────────────────
  {
    id: 'pk-intercom',
    name: 'Intercom Key',
    category: 'Programmable Keys',
    description: 'One-touch intercom to an extension',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.line="1"',
      'programablekey.{KEY}.type="14"',
      'programablekey.{KEY}.value="{EXT}"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Intercom', type: 'text' },
      { id: 'EXT', label: 'Extension', default: '100', type: 'text' },
    ],
  },
  {
    id: 'pk-multicast',
    name: 'Multicast Paging Key',
    category: 'Programmable Keys',
    description: 'One-touch multicast page (Algo / paging system)',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{IP}:{PORT}"',
      'programablekey.{KEY}.type="24"',
      'programablekey.{KEY}.line="0"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Page All', type: 'text' },
      { id: 'IP', label: 'Multicast IP', default: '224.0.1.156', type: 'text' },
      { id: 'PORT', label: 'Port', default: '10008', type: 'text' },
    ],
  },
  {
    id: 'pk-night',
    name: 'Night Mode / Timeframe Toggle',
    category: 'Programmable Keys',
    description: 'Toggle NetSapiens timeframe (night mode on/off)',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{FEATURE_CODE}"',
      'programablekey.{KEY}.type="13"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Night Mode', type: 'text' },
      { id: 'FEATURE_CODE', label: 'Feature Code', default: '*55', type: 'text' },
    ],
  },
  {
    id: 'pk-blf',
    name: 'BLF (Busy Lamp Field)',
    category: 'Programmable Keys',
    description: 'Monitor and speed-dial an extension; lights up when in use',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{EXT}"',
      'programablekey.{KEY}.type="16"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Name / Label', default: 'John', type: 'text' },
      { id: 'EXT', label: 'Extension', default: '101', type: 'text' },
    ],
  },
  {
    id: 'pk-speeddial',
    name: 'Speed Dial Key',
    category: 'Programmable Keys',
    description: 'One-touch dial to any number or extension',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{NUMBER}"',
      'programablekey.{KEY}.type="13"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Help Desk', type: 'text' },
      { id: 'NUMBER', label: 'Number / Extension', default: '200', type: 'text' },
    ],
  },
  {
    id: 'pk-callpark',
    name: 'Call Park Key',
    category: 'Programmable Keys',
    description: 'Park a call to a slot',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{SLOT}"',
      'programablekey.{KEY}.type="10"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Park', type: 'text' },
      { id: 'SLOT', label: 'Park Slot / Code', default: '*68', type: 'text' },
    ],
  },
  {
    id: 'pk-dnd',
    name: 'Do Not Disturb Key',
    category: 'Programmable Keys',
    description: 'Toggle Do Not Disturb on/off',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="5"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'DND', type: 'text' },
    ],
  },
  {
    id: 'pk-voicemail',
    name: 'Voicemail Key',
    category: 'Programmable Keys',
    description: 'Direct access to voicemail',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{VM_CODE}"',
      'programablekey.{KEY}.type="40"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Voicemail', type: 'text' },
      { id: 'VM_CODE', label: 'Voicemail Code', default: '*97', type: 'text' },
    ],
  },
  {
    id: 'pk-forward',
    name: 'Call Forward Key',
    category: 'Programmable Keys',
    description: 'Toggle call forwarding on/off',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="2"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Forward', type: 'text' },
    ],
  },
  {
    id: 'pk-transfer',
    name: 'Transfer Key',
    category: 'Programmable Keys',
    description: 'Dedicated transfer button',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="3"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Transfer', type: 'text' },
    ],
  },
  {
    id: 'pk-hold',
    name: 'Hold Key',
    category: 'Programmable Keys',
    description: 'Dedicated hold button',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="4"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Hold', type: 'text' },
    ],
  },
  {
    id: 'pk-conference',
    name: 'Conference Key',
    category: 'Programmable Keys',
    description: 'Dedicated conference button',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="1"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Conf', type: 'text' },
    ],
  },
  {
    id: 'pk-redial',
    name: 'Redial Key',
    category: 'Programmable Keys',
    description: 'Redial last dialed number',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.type="6"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Redial', type: 'text' },
    ],
  },
  {
    id: 'pk-pickup',
    name: 'Directed Call Pickup Key',
    category: 'Programmable Keys',
    description: 'Pick up a ringing call at another extension',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{EXT}"',
      'programablekey.{KEY}.type="9"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Pickup', type: 'text' },
      { id: 'EXT', label: 'Extension to Pick Up', default: '101', type: 'text' },
    ],
  },
  {
    id: 'pk-group-pickup',
    name: 'Group Call Pickup Key',
    category: 'Programmable Keys',
    description: 'Pick up any ringing call in the group',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{PICKUP_CODE}"',
      'programablekey.{KEY}.type="23"',
      'programablekey.{KEY}.line="1"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Group Pickup', type: 'text' },
      { id: 'PICKUP_CODE', label: 'Pickup Code', default: '*8', type: 'text' },
    ],
  },
  {
    id: 'pk-dtmf',
    name: 'DTMF Key',
    category: 'Programmable Keys',
    description: 'Send DTMF tones during a call (e.g. for IVR navigation)',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{DTMF}"',
      'programablekey.{KEY}.type="38"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Press 1', type: 'text' },
      { id: 'DTMF', label: 'DTMF Sequence', default: '1', type: 'text' },
    ],
  },
  {
    id: 'pk-prefix',
    name: 'Prefix Key',
    category: 'Programmable Keys',
    description: 'Auto-prefix digits before dialing (e.g. 9 for outside line)',
    codes: [
      'programablekey.{KEY}.label="{LABEL}"',
      'programablekey.{KEY}.value="{PREFIX}"',
      'programablekey.{KEY}.type="32"',
    ],
    variables: [
      { id: 'KEY', label: 'Key #', default: '1', type: 'number' },
      { id: 'LABEL', label: 'Button Label', default: 'Outside Line', type: 'text' },
      { id: 'PREFIX', label: 'Prefix Digits', default: '9', type: 'text' },
    ],
  },

  // ── BASIC ────────────────────────────────────────────────────────────────
  {
    id: 'basic-forward-popup',
    name: 'Disable Forward Call Popup',
    category: 'Basic',
    description: 'Stop the phone from showing a forward popup notification',
    codes: ['features.forward_call_popup.enable="0"'],
    variables: [],
  },
  {
    id: 'basic-missed-popup',
    name: 'Disable Missed Call Popup',
    category: 'Basic',
    description: 'Suppress missed call notification popup on screen',
    codes: ['features.missed_call_popup.enable="0"'],
    variables: [],
  },
  {
    id: 'basic-text-popup',
    name: 'Disable Text Message Popup',
    category: 'Basic',
    description: 'Suppress text/SMS message popup',
    codes: ['features.text_message_popup.enable="0"'],
    variables: [],
  },
  {
    id: 'basic-vm-popup',
    name: 'Disable Voicemail Popup',
    category: 'Basic',
    description: 'Suppress voicemail waiting notification popup',
    codes: ['features.voice_mail_popup.enable="0"'],
    variables: [],
  },
  {
    id: 'basic-time-format',
    name: 'Change Time to 12-Hour Format',
    category: 'Basic',
    description: 'Switch the phone clock from 24-hour to 12-hour AM/PM',
    codes: ['local_time.time_format="0"'],
    variables: [],
  },
  {
    id: 'basic-time-24',
    name: 'Change Time to 24-Hour Format',
    category: 'Basic',
    description: 'Switch the phone clock to 24-hour format',
    codes: ['local_time.time_format="1"'],
    variables: [],
  },
  {
    id: 'basic-ntp',
    name: 'Set NTP / Time Server',
    category: 'Basic',
    description: 'Point the phone to a specific NTP server for time sync',
    codes: [
      'local_time.ntp_server1="{NTP_SERVER}"',
      'local_time.interval="1000"',
    ],
    variables: [
      { id: 'NTP_SERVER', label: 'NTP Server', default: 'pool.ntp.org', type: 'text' },
    ],
  },
  {
    id: 'basic-timezone',
    name: 'Set Timezone',
    category: 'Basic',
    description: 'Set the phone timezone offset from UTC',
    codes: ['local_time.time_zone="{TIMEZONE}"'],
    variables: [
      { id: 'TIMEZONE', label: 'Timezone (e.g. -6 for CST)', default: '-6', type: 'text' },
    ],
  },
  {
    id: 'basic-lang',
    name: 'Set Phone Language',
    category: 'Basic',
    description: 'Set the display language of the phone menu',
    codes: ['lang.gui="English"'],
    variables: [],
  },
  {
    id: 'basic-backlight',
    name: 'Set Backlight Timeout',
    category: 'Basic',
    description: 'How many seconds until the screen dims (0 = always on)',
    codes: ['phone_setting.backlight_time="{SECONDS}"'],
    variables: [
      { id: 'SECONDS', label: 'Timeout (seconds)', default: '30', type: 'number' },
    ],
  },
  {
    id: 'basic-screensaver',
    name: 'Enable Screen Saver',
    category: 'Basic',
    description: 'Turn on the screen saver after idle time',
    codes: [
      'phone_setting.screen_saver_enable="1"',
      'phone_setting.screen_saver_wait_time="{SECONDS}"',
    ],
    variables: [
      { id: 'SECONDS', label: 'Wait Time (seconds)', default: '120', type: 'number' },
    ],
  },
  {
    id: 'basic-ring-volume',
    name: 'Set Ring Volume',
    category: 'Basic',
    description: 'Set the default ringer volume (1–15)',
    codes: ['phone_setting.ring_vol="{VOLUME}"'],
    variables: [
      { id: 'VOLUME', label: 'Volume (1-15)', default: '8', type: 'number' },
    ],
  },
  {
    id: 'basic-ringtone',
    name: 'Set Default Ringtone',
    category: 'Basic',
    description: 'Set which ringtone the phone plays by default',
    codes: ['phone_setting.ring_type="Ring{NUM}.wav"'],
    variables: [
      { id: 'NUM', label: 'Ring Number (1-8)', default: '1', type: 'number' },
    ],
  },
  {
    id: 'basic-hotline',
    name: 'Set Hotline / Auto Dial Number',
    category: 'Basic',
    description: 'Phone auto-dials this number when handset is lifted',
    codes: [
      'features.hotline_enable="1"',
      'features.hotline_number="{NUMBER}"',
    ],
    variables: [
      { id: 'NUMBER', label: 'Hotline Number', default: '0', type: 'text' },
    ],
  },
  {
    id: 'basic-call-waiting',
    name: 'Enable/Disable Call Waiting',
    category: 'Basic',
    description: 'Toggle whether the phone accepts a second incoming call',
    codes: ['call_waiting.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'basic-auto-answer',
    name: 'Enable Auto Answer',
    category: 'Basic',
    description: 'Phone automatically answers incoming calls (useful for intercom)',
    codes: [
      'features.auto_answer.enable="1"',
      'features.auto_answer.mute_on_answer="{MUTE}"',
    ],
    variables: [
      { id: 'MUTE', label: 'Mute on Answer (1=yes, 0=no)', default: '0', type: 'text' },
    ],
  },
  {
    id: 'basic-block-anon',
    name: 'Block Anonymous Calls',
    category: 'Basic',
    description: 'Reject calls with no caller ID',
    codes: ['features.block_anonymous_call.enable="1"'],
    variables: [],
  },

  // ── LED ─────────────────────────────────────────────────────────────────
  {
    id: 'led-missed',
    name: 'LED for Missed Calls',
    category: 'LED',
    description: 'Enable or disable the power LED flash for missed calls',
    codes: ['phone_setting.missed_call_power_led_flash.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '0', type: 'text' },
    ],
  },
  {
    id: 'led-missed-pattern',
    name: 'LED Flash Pattern for Missed Calls',
    category: 'LED',
    description: 'Set the flash pattern for missed call LED (1=slow, 2=fast)',
    codes: ['phone_setting.missed_call_power_led_flash.pattern="{PATTERN}"'],
    variables: [
      { id: 'PATTERN', label: 'Pattern (1 or 2)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'led-voicemail',
    name: 'LED for New Voicemail',
    category: 'LED',
    description: 'Enable or disable power LED flash for new voicemail',
    codes: ['phone_setting.voice_mail_led_flash.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '0', type: 'text' },
    ],
  },
  {
    id: 'led-forward',
    name: 'LED for Call Forwarding Status',
    category: 'LED',
    description: 'Flash LED when call forwarding is active',
    codes: ['phone_setting.call_forward_led_flash.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '0', type: 'text' },
    ],
  },
  {
    id: 'led-active-call',
    name: 'LED for Active Call',
    category: 'LED',
    description: 'Flash LED when a call is in progress',
    codes: ['phone_setting.active_call_led_flash.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'led-registration',
    name: 'LED for Line Registration Status',
    category: 'LED',
    description: 'Flash LED to show SIP registration state',
    codes: ['phone_setting.line_registration_led_flash.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'led-brightness',
    name: 'LED Brightness',
    category: 'LED',
    description: 'Set overall LED brightness (1=low, 3=high)',
    codes: ['phone_setting.led_brightness="{LEVEL}"'],
    variables: [
      { id: 'LEVEL', label: 'Brightness (1-3)', default: '3', type: 'number' },
    ],
  },
  {
    id: 'led-missed-notif',
    name: 'LED Missed Call Notification',
    category: 'LED',
    description: 'Enable the missed call LED notification indicator',
    codes: ['phone_setting.missed_call_led.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },

  // ── NETWORK ──────────────────────────────────────────────────────────────
  {
    id: 'net-dhcp',
    name: 'Enable DHCP',
    category: 'Network',
    description: 'Let the phone get its IP from a DHCP server (recommended)',
    codes: ['network.dhcp="1"'],
    variables: [],
  },
  {
    id: 'net-static',
    name: 'Static IP Address',
    category: 'Network',
    description: 'Assign a fixed IP to the phone',
    codes: [
      'network.dhcp="0"',
      'network.static_ip="{IP}"',
      'network.subnet_mask="{MASK}"',
      'network.gateway="{GW}"',
      'network.primary_dns="{DNS1}"',
      'network.secondary_dns="{DNS2}"',
    ],
    variables: [
      { id: 'IP', label: 'IP Address', default: '192.168.1.100', type: 'text' },
      { id: 'MASK', label: 'Subnet Mask', default: '255.255.255.0', type: 'text' },
      { id: 'GW', label: 'Default Gateway', default: '192.168.1.1', type: 'text' },
      { id: 'DNS1', label: 'Primary DNS', default: '8.8.8.8', type: 'text' },
      { id: 'DNS2', label: 'Secondary DNS', default: '8.8.4.4', type: 'text' },
    ],
  },
  {
    id: 'net-vlan',
    name: 'VLAN Configuration',
    category: 'Network',
    description: 'Set voice VLAN ID and priority for QoS',
    codes: [
      'network.vlan_id="{VLAN_ID}"',
      'network.vlan_priority="{PRIORITY}"',
    ],
    variables: [
      { id: 'VLAN_ID', label: 'VLAN ID', default: '100', type: 'number' },
      { id: 'PRIORITY', label: 'VLAN Priority (0-7)', default: '5', type: 'number' },
    ],
  },
  {
    id: 'net-wifi-ssid',
    name: 'Wi-Fi SSID',
    category: 'Network',
    description: 'Set the wireless network name',
    codes: [
      'wifi.enable="1"',
      'wifi.ssid="{SSID}"',
      'wifi.psk="{PASSWORD}"',
    ],
    variables: [
      { id: 'SSID', label: 'Wi-Fi Network Name', default: 'YourWiFiName', type: 'text' },
      { id: 'PASSWORD', label: 'Wi-Fi Password', default: 'YourPassword', type: 'text' },
    ],
  },
  {
    id: 'net-nat',
    name: 'Enable NAT',
    category: 'Network',
    description: 'Enable NAT traversal for phones behind a firewall/router',
    codes: ['network.nat.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'net-lldp',
    name: 'Enable LLDP (for auto VLAN)',
    category: 'Network',
    description: 'Allow switch to push VLAN config via LLDP-MED',
    codes: [
      'network.lldp.enable="1"',
      'network.lldp.packet_interval="60"',
    ],
    variables: [],
  },
  {
    id: 'net-cdp',
    name: 'Enable CDP (Cisco Discovery Protocol)',
    category: 'Network',
    description: 'Use CDP for VLAN discovery on Cisco switches',
    codes: ['network.cdp.enable="1"'],
    variables: [],
  },
  {
    id: 'net-pc-port',
    name: 'Enable PC Port',
    category: 'Network',
    description: 'Enable the passthrough PC port on the back of the phone',
    codes: ['network.pc_port.enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '1', type: 'text' },
    ],
  },
  {
    id: 'net-qos-dscp',
    name: 'QoS DSCP Values',
    category: 'Network',
    description: 'Set DSCP markings for voice and SIP signaling (EF=46 for voice, AF31=26 for SIP)',
    codes: [
      'network.qos.rtptos="{RTP_DSCP}"',
      'network.qos.siptos="{SIP_DSCP}"',
    ],
    variables: [
      { id: 'RTP_DSCP', label: 'RTP/Voice DSCP (46=EF)', default: '46', type: 'number' },
      { id: 'SIP_DSCP', label: 'SIP Signaling DSCP (26=AF31)', default: '26', type: 'number' },
    ],
  },

  // ── SIP ──────────────────────────────────────────────────────────────────
  {
    id: 'sip-server',
    name: 'SIP Server / Proxy',
    category: 'SIP',
    description: 'Set the SIP registrar server for account 1',
    codes: [
      'account.1.sip_server_host="{HOST}"',
      'account.1.sip_server_port="{PORT}"',
    ],
    variables: [
      { id: 'HOST', label: 'SIP Server Hostname/IP', default: 'sip.yourprovider.com', type: 'text' },
      { id: 'PORT', label: 'SIP Port', default: '5060', type: 'number' },
    ],
  },
  {
    id: 'sip-account',
    name: 'SIP Account Credentials',
    category: 'SIP',
    description: 'Full SIP account setup for account 1',
    codes: [
      'account.1.enable="1"',
      'account.1.label="{LABEL}"',
      'account.1.display_name="{DISPLAY}"',
      'account.1.auth_name="{AUTH}"',
      'account.1.user_name="{USER}"',
      'account.1.password="{PASS}"',
      'account.1.sip_server_host="{HOST}"',
    ],
    variables: [
      { id: 'LABEL', label: 'Line Label', default: 'Line 1', type: 'text' },
      { id: 'DISPLAY', label: 'Display Name', default: 'John Smith', type: 'text' },
      { id: 'AUTH', label: 'Auth Username', default: '1001', type: 'text' },
      { id: 'USER', label: 'SIP Username', default: '1001', type: 'text' },
      { id: 'PASS', label: 'SIP Password', default: 'password', type: 'text' },
      { id: 'HOST', label: 'SIP Server', default: 'sip.yourprovider.com', type: 'text' },
    ],
  },
  {
    id: 'sip-transport',
    name: 'SIP Transport Protocol',
    category: 'SIP',
    description: 'Set SIP transport: UDP, TCP, or TLS',
    codes: ['account.1.transport="{TRANSPORT}"'],
    variables: [
      { id: 'TRANSPORT', label: 'Protocol (0=UDP, 1=TCP, 2=TLS)', default: '0', type: 'text' },
    ],
  },
  {
    id: 'sip-register-expire',
    name: 'SIP Registration Expiry',
    category: 'SIP',
    description: 'How often the phone re-registers with the SIP server (seconds)',
    codes: ['account.1.reg_expire_time="{SECONDS}"'],
    variables: [
      { id: 'SECONDS', label: 'Expiry (seconds)', default: '3600', type: 'number' },
    ],
  },
  {
    id: 'sip-outbound-proxy',
    name: 'SIP Outbound Proxy',
    category: 'SIP',
    description: 'Route SIP traffic through a specific outbound proxy',
    codes: [
      'account.1.outbound_proxy_enable="1"',
      'account.1.outbound_host="{PROXY}"',
      'account.1.outbound_port="{PORT}"',
    ],
    variables: [
      { id: 'PROXY', label: 'Outbound Proxy Host', default: 'proxy.yourprovider.com', type: 'text' },
      { id: 'PORT', label: 'Proxy Port', default: '5060', type: 'number' },
    ],
  },
  {
    id: 'sip-srtp',
    name: 'Enable SRTP (Encrypted Voice)',
    category: 'SIP',
    description: 'Turn on SRTP for encrypted media streams',
    codes: ['account.1.srtp_encryption="{VAL}"'],
    variables: [
      { id: 'VAL', label: '0=Off, 1=Optional, 2=Mandatory', default: '0', type: 'text' },
    ],
  },
  {
    id: 'sip-dtmf',
    name: 'DTMF Mode',
    category: 'SIP',
    description: 'Set how DTMF tones are sent (RFC 2833 is standard)',
    codes: ['account.1.dtmf.type="{MODE}"'],
    variables: [
      { id: 'MODE', label: '0=INBAND, 1=RFC2833, 2=SIP INFO', default: '1', type: 'text' },
    ],
  },

  // ── AUDIO ────────────────────────────────────────────────────────────────
  {
    id: 'audio-codec-order',
    name: 'Audio Codec Priority',
    category: 'Audio',
    description: 'Set codec preference order for account 1',
    codes: [
      'account.1.codec.1.enable="1"',
      'account.1.codec.1.payload_type="{CODEC1}"',
      'account.1.codec.2.enable="1"',
      'account.1.codec.2.payload_type="{CODEC2}"',
      'account.1.codec.3.enable="{C3_EN}"',
      'account.1.codec.3.payload_type="{CODEC3}"',
    ],
    variables: [
      { id: 'CODEC1', label: 'First Codec (PCMU=0, PCMA=8, G729=18)', default: 'PCMU', type: 'text' },
      { id: 'CODEC2', label: 'Second Codec', default: 'PCMA', type: 'text' },
      { id: 'C3_EN', label: 'Enable Third (1/0)', default: '1', type: 'text' },
      { id: 'CODEC3', label: 'Third Codec', default: 'G729', type: 'text' },
    ],
  },
  {
    id: 'audio-mic-volume',
    name: 'Microphone Volume',
    category: 'Audio',
    description: 'Set handset/headset microphone gain',
    codes: ['features.handset_mic_volume="{LEVEL}"'],
    variables: [
      { id: 'LEVEL', label: 'Volume (1-15)', default: '8', type: 'number' },
    ],
  },
  {
    id: 'audio-speaker-volume',
    name: 'Handset / Speaker Volume',
    category: 'Audio',
    description: 'Set the default handset and speaker volume',
    codes: [
      'features.handset_vol="{VOL}"',
      'features.speaker_vol="{SVOL}"',
    ],
    variables: [
      { id: 'VOL', label: 'Handset Volume (1-15)', default: '8', type: 'number' },
      { id: 'SVOL', label: 'Speaker Volume (1-15)', default: '8', type: 'number' },
    ],
  },
  {
    id: 'audio-noise-suppress',
    name: 'Noise Suppression',
    category: 'Audio',
    description: 'Enable background noise filtering',
    codes: ['features.noise_suppression="1"'],
    variables: [],
  },
  {
    id: 'audio-echo-cancel',
    name: 'Echo Cancellation',
    category: 'Audio',
    description: 'Enable acoustic echo cancellation',
    codes: ['features.aec_enable="1"'],
    variables: [],
  },
  {
    id: 'audio-vad',
    name: 'Voice Activity Detection (VAD)',
    category: 'Audio',
    description: 'Suppress silence packets to save bandwidth',
    codes: ['account.1.vad_enable="{VAL}"'],
    variables: [
      { id: 'VAL', label: 'Enable (1) / Disable (0)', default: '0', type: 'text' },
    ],
  },

  // ── DISPLAY ──────────────────────────────────────────────────────────────
  {
    id: 'display-idle-screen',
    name: 'Custom Idle Screen Text',
    category: 'Display',
    description: 'Show custom text on the phone idle screen',
    codes: ['phone_setting.idle_text="{TEXT}"'],
    variables: [
      { id: 'TEXT', label: 'Idle Screen Text', default: 'Welcome', type: 'text' },
    ],
  },
  {
    id: 'display-logo',
    name: 'Disable Yealink Logo on Boot',
    category: 'Display',
    description: 'Remove the Yealink splash screen on startup',
    codes: ['phone_setting.startup_logo_enable="0"'],
    variables: [],
  },
  {
    id: 'display-contrast',
    name: 'Screen Contrast',
    category: 'Display',
    description: 'Set LCD screen contrast level',
    codes: ['phone_setting.contrast="{LEVEL}"'],
    variables: [
      { id: 'LEVEL', label: 'Contrast (1-10)', default: '6', type: 'number' },
    ],
  },
  {
    id: 'display-caller-id',
    name: 'Caller ID Display Format',
    category: 'Display',
    description: 'Control how incoming caller ID is shown on screen',
    codes: ['features.show_call_info="{VAL}"'],
    variables: [
      { id: 'VAL', label: '0=Name only, 1=Number only, 2=Both', default: '2', type: 'text' },
    ],
  },

  // ── SECURITY ─────────────────────────────────────────────────────────────
  {
    id: 'sec-web-password',
    name: 'Change Web GUI Password',
    category: 'Security',
    description: 'Set a new admin password for the phone web interface',
    codes: [
      'security.user_name.admin="{USER}"',
      'security.user_password.admin="{PASS}"',
    ],
    variables: [
      { id: 'USER', label: 'Admin Username', default: 'admin', type: 'text' },
      { id: 'PASS', label: 'New Password', default: 'Admin1234', type: 'text' },
    ],
  },
  {
    id: 'sec-phone-lock',
    name: 'Phone Lock / Keypad Lock',
    category: 'Security',
    description: 'Lock the phone keypad after an idle period',
    codes: [
      'phone_setting.phone_lock.enable="1"',
      'phone_setting.phone_lock.lock_time_out="{SECONDS}"',
      'phone_setting.phone_lock.unlock_pin="{PIN}"',
    ],
    variables: [
      { id: 'SECONDS', label: 'Lock After (seconds)', default: '120', type: 'number' },
      { id: 'PIN', label: 'Unlock PIN', default: '0000', type: 'text' },
    ],
  },
  {
    id: 'sec-web-access',
    name: 'Disable Web GUI Access',
    category: 'Security',
    description: 'Prevent access to the phone web interface entirely',
    codes: ['network.http_server.enable="0"'],
    variables: [],
  },

  // ── PROVISIONING ─────────────────────────────────────────────────────────
  {
    id: 'prov-server',
    name: 'Auto Provisioning Server URL',
    category: 'Provisioning',
    description: 'Point the phone to a provisioning/config server',
    codes: [
      'autoprovision.server.url="{URL}"',
      'autoprovision.mode="0"',
    ],
    variables: [
      { id: 'URL', label: 'Provisioning Server URL', default: 'http://provisioning.yourprovider.com', type: 'text' },
    ],
  },
  {
    id: 'prov-interval',
    name: 'Auto Provisioning Check Interval',
    category: 'Provisioning',
    description: 'How often the phone checks for config updates (minutes)',
    codes: ['autoprovision.repeat.minutes="{MINS}"'],
    variables: [
      { id: 'MINS', label: 'Interval (minutes)', default: '1440', type: 'number' },
    ],
  },
  {
    id: 'prov-reboot',
    name: 'Auto Reboot After Provisioning',
    category: 'Provisioning',
    description: 'Automatically reboot the phone after applying a new config',
    codes: ['autoprovision.reboot_force="1"'],
    variables: [],
  },
  {
    id: 'prov-reset',
    name: 'Factory Reset Code',
    category: 'Provisioning',
    description: 'Config line to factory reset the phone on next provision cycle',
    codes: ['autoprovision.factory_reset="1"'],
    variables: [],
  },

  // ── CALL SETTINGS ────────────────────────────────────────────────────────
  {
    id: 'call-fwd-always',
    name: 'Forward All Calls',
    category: 'Call Settings',
    description: 'Unconditionally forward all calls to a number',
    codes: [
      'account.1.always_fwd.enable="1"',
      'account.1.always_fwd.target="{TARGET}"',
    ],
    variables: [
      { id: 'TARGET', label: 'Forward To (number/ext)', default: '200', type: 'text' },
    ],
  },
  {
    id: 'call-fwd-busy',
    name: 'Forward When Busy',
    category: 'Call Settings',
    description: 'Forward calls when the phone is busy on another call',
    codes: [
      'account.1.busy_fwd.enable="1"',
      'account.1.busy_fwd.target="{TARGET}"',
    ],
    variables: [
      { id: 'TARGET', label: 'Forward To (number/ext)', default: '200', type: 'text' },
    ],
  },
  {
    id: 'call-fwd-noanswer',
    name: 'Forward on No Answer',
    category: 'Call Settings',
    description: 'Forward calls if not answered within a timeout',
    codes: [
      'account.1.timeout_fwd.enable="1"',
      'account.1.timeout_fwd.target="{TARGET}"',
      'account.1.timeout_fwd.timeout="{SECONDS}"',
    ],
    variables: [
      { id: 'TARGET', label: 'Forward To (number/ext)', default: '200', type: 'text' },
      { id: 'SECONDS', label: 'Ring Before Forward (sec)', default: '20', type: 'number' },
    ],
  },
  {
    id: 'call-transfer-mode',
    name: 'Transfer Mode',
    category: 'Call Settings',
    description: 'Set attended vs blind transfer behavior on the Transfer key',
    codes: ['features.transfer_mode="{MODE}"'],
    variables: [
      { id: 'MODE', label: '0=Blind, 1=Attended, 2=New Call', default: '1', type: 'text' },
    ],
  },
  {
    id: 'call-dial-plan',
    name: 'Dial Plan',
    category: 'Call Settings',
    description: 'Set digit map / dial plan rules for automatic dialing',
    codes: ['dialplan.dialnow.rule="{PLAN}"'],
    variables: [
      { id: 'PLAN', label: 'Dial Plan Rule', default: 'x.', type: 'text' },
    ],
  },
  {
    id: 'call-interdigit',
    name: 'Interdigit Timeout',
    category: 'Call Settings',
    description: 'Seconds of silence after last digit before the call is placed',
    codes: ['phone_setting.inter_digit_time="{SECONDS}"'],
    variables: [
      { id: 'SECONDS', label: 'Timeout (seconds)', default: '3', type: 'number' },
    ],
  },
  {
    id: 'call-max-calls',
    name: 'Max Concurrent Calls Per Line',
    category: 'Call Settings',
    description: 'Limit how many simultaneous calls a line can handle',
    codes: ['account.1.max_call_in={NUM}'],
    variables: [
      { id: 'NUM', label: 'Max Calls (1-6)', default: '2', type: 'number' },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveCode(template, vars) {
  let out = template
  for (const [id, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${id}}`, val || `{${id}}`)
  }
  return out
}

function resolveAll(codes, varValues) {
  return codes.map(c => resolveCode(c, varValues)).join('\n')
}

// ─── Component ───────────────────────────────────────────────────────────────

function CodeCard({ item }) {
  const initVars = Object.fromEntries((item.variables || []).map(v => [v.id, v.default]))
  const [varValues, setVarValues] = useState(initVars)
  const [copied, setCopied] = useState(false)

  const resolved = resolveAll(item.codes, varValues)

  function handleCopy() {
    navigator.clipboard.writeText(resolved).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="yk-card">
      <div className="yk-card-head">
        <div>
          <div className="yk-card-name">{item.name}</div>
          {item.description && <div className="yk-card-desc">{item.description}</div>}
        </div>
        <span className="yk-badge">{item.category}</span>
      </div>

      {item.variables && item.variables.length > 0 && (
        <div className="yk-vars">
          {item.variables.map(v => (
            <label key={v.id} className="yk-var-label">
              <span>{v.label}</span>
              <input
                className="yk-var-input"
                type={v.type === 'number' ? 'text' : 'text'}
                value={varValues[v.id] ?? v.default}
                onChange={e => setVarValues(prev => ({ ...prev, [v.id]: e.target.value }))}
                placeholder={v.default}
              />
            </label>
          ))}
        </div>
      )}

      <div className="yk-code-wrap">
        <pre className="yk-code">{resolved}</pre>
        <button
          type="button"
          className={`yk-copy-btn${copied ? ' yk-copied' : ''}`}
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export default function YealinkCodes() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return CODES.filter(item => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory
      if (!matchCat) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.codes.some(c => c.toLowerCase().includes(q))
      )
    })
  }, [search, activeCategory])

  return (
    <section className="yk-root">
      <div className="yk-header">
        <h2 className="yk-title">Yealink Code Generator</h2>
        <p className="yk-subtitle">
          Search for any setting, fill in the fields, and copy the exact code into NetSapiens or your config file.
        </p>
        <input
          className="yk-search"
          type="search"
          placeholder="Search — e.g. multicast, BLF, night mode, VLAN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="yk-cats">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              className={`yk-cat-btn${activeCategory === cat ? ' yk-cat-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="yk-empty">No codes found for "{search}"</div>
      ) : (
        <div className="yk-grid">
          {filtered.map(item => (
            <CodeCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <div className="yk-count">{filtered.length} of {CODES.length} codes shown</div>
    </section>
  )
}
