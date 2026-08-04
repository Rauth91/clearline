/**
 * Yealink code shaping — task groups + model families (without retyping entries).
 */

export const YEALINK_TASKS = [
  'Calls & Transfers',
  'Park & Pickup',
  'Paging & Intercom',
  'Forwarding & DND',
  'Provisioning & Reset',
  'Diagnostics',
  'Keys & Display',
]

export const YEALINK_MODEL_FAMILIES = ['all', 'T3x', 'T4x', 'T5x', 'CP', 'AX']

const DESK_MODELS = ['T3x', 'T4x', 'T5x']
const ALL = ['all']

/** Per-id overrides: task, models, optional caveat */
const BY_ID = {
  'pk-intercom': { task: 'Paging & Intercom', models: ALL },
  'pk-multicast': {
    task: 'Paging & Intercom',
    models: ALL,
    caveat: 'Multicast IP/port must match Algo (or other) paging endpoints exactly.',
  },
  'pk-night': { task: 'Forwarding & DND', models: DESK_MODELS },
  'pk-blf': {
    task: 'Calls & Transfers',
    models: DESK_MODELS,
    caveat: 'BLF key counts vary by model; CP conference phones have limited DSS keys.',
  },
  'pk-speeddial': { task: 'Calls & Transfers', models: ALL },
  'pk-callpark': { task: 'Park & Pickup', models: DESK_MODELS },
  'pk-dnd': { task: 'Forwarding & DND', models: ALL },
  'pk-voicemail': { task: 'Calls & Transfers', models: ALL },
  'pk-forward': { task: 'Forwarding & DND', models: ALL },
  'pk-transfer': { task: 'Calls & Transfers', models: ALL },
  'pk-hold': { task: 'Calls & Transfers', models: ALL },
  'pk-conference': { task: 'Calls & Transfers', models: ALL },
  'pk-redial': { task: 'Calls & Transfers', models: ALL },
  'pk-pickup': { task: 'Park & Pickup', models: DESK_MODELS },
  'pk-group-pickup': { task: 'Park & Pickup', models: DESK_MODELS },
  'pk-dtmf': { task: 'Calls & Transfers', models: ALL },
  'pk-prefix': { task: 'Calls & Transfers', models: DESK_MODELS },

  'basic-forward-popup': { task: 'Forwarding & DND', models: ALL },
  'basic-missed-popup': { task: 'Keys & Display', models: ALL },
  'basic-text-popup': { task: 'Keys & Display', models: ALL },
  'basic-vm-popup': { task: 'Keys & Display', models: ALL },
  'basic-time-format': { task: 'Keys & Display', models: ALL },
  'basic-time-24': { task: 'Keys & Display', models: ALL },
  'basic-ntp': { task: 'Diagnostics', models: ALL },
  'basic-timezone': { task: 'Diagnostics', models: ALL },
  'basic-lang': { task: 'Keys & Display', models: ALL },
  'basic-backlight': { task: 'Keys & Display', models: DESK_MODELS },
  'basic-screensaver': { task: 'Keys & Display', models: DESK_MODELS },
  'basic-ring-volume': { task: 'Keys & Display', models: ALL },
  'basic-ringtone': { task: 'Keys & Display', models: ALL },
  'basic-hotline': { task: 'Calls & Transfers', models: ALL },
  'basic-call-waiting': { task: 'Calls & Transfers', models: ALL },
  'basic-auto-answer': {
    task: 'Paging & Intercom',
    models: ALL,
    caveat: 'Auto-answer is commonly used with intercom/paging barge-in.',
  },
  'basic-block-anon': { task: 'Forwarding & DND', models: ALL },

  'led-missed': { task: 'Keys & Display', models: DESK_MODELS },
  'led-missed-pattern': { task: 'Keys & Display', models: DESK_MODELS },
  'led-voicemail': { task: 'Keys & Display', models: DESK_MODELS },
  'led-forward': { task: 'Forwarding & DND', models: DESK_MODELS },
  'led-active-call': { task: 'Keys & Display', models: DESK_MODELS },
  'led-registration': { task: 'Diagnostics', models: DESK_MODELS },
  'led-brightness': { task: 'Keys & Display', models: DESK_MODELS },
  'led-missed-notif': { task: 'Keys & Display', models: DESK_MODELS },

  'net-dhcp': { task: 'Diagnostics', models: ALL },
  'net-static': { task: 'Diagnostics', models: ALL },
  'net-vlan': { task: 'Diagnostics', models: ALL },
  'net-wifi-ssid': {
    task: 'Diagnostics',
    models: ['T4x', 'T5x', 'AX'],
    caveat: 'Wi-Fi applies to wireless-capable models (e.g. T4xW / T5xW / AX). Wired-only phones ignore these keys.',
  },
  'net-nat': { task: 'Diagnostics', models: ALL },
  'net-lldp': { task: 'Diagnostics', models: ALL },
  'net-cdp': { task: 'Diagnostics', models: ALL },
  'net-pc-port': { task: 'Diagnostics', models: DESK_MODELS },
  'net-qos-dscp': { task: 'Diagnostics', models: ALL },

  'sip-server': { task: 'Diagnostics', models: ALL },
  'sip-account': { task: 'Diagnostics', models: ALL },
  'sip-transport': { task: 'Diagnostics', models: ALL },
  'sip-register-expire': { task: 'Diagnostics', models: ALL },
  'sip-outbound-proxy': { task: 'Diagnostics', models: ALL },
  'sip-srtp': { task: 'Diagnostics', models: ALL },
  'sip-dtmf': { task: 'Calls & Transfers', models: ALL },

  'audio-codec-order': { task: 'Diagnostics', models: ALL },
  'audio-mic-volume': { task: 'Diagnostics', models: ALL },
  'audio-speaker-volume': { task: 'Diagnostics', models: ALL },
  'audio-noise-suppress': { task: 'Diagnostics', models: ALL },
  'audio-echo-cancel': { task: 'Diagnostics', models: ALL },
  'audio-vad': { task: 'Diagnostics', models: ALL },

  'display-idle-screen': { task: 'Keys & Display', models: DESK_MODELS },
  'display-logo': { task: 'Keys & Display', models: DESK_MODELS },
  'display-contrast': { task: 'Keys & Display', models: DESK_MODELS },
  'display-caller-id': { task: 'Keys & Display', models: ALL },

  'sec-web-password': { task: 'Provisioning & Reset', models: ALL },
  'sec-phone-lock': { task: 'Provisioning & Reset', models: ALL },
  'sec-web-access': { task: 'Provisioning & Reset', models: ALL },

  'prov-server': { task: 'Provisioning & Reset', models: ALL },
  'prov-interval': { task: 'Provisioning & Reset', models: ALL },
  'prov-reboot': { task: 'Provisioning & Reset', models: ALL },
  'prov-reset': {
    task: 'Provisioning & Reset',
    models: ALL,
    caveat: 'Factory reset erases local config. Confirm RPS/provisioning URL before resetting field phones.',
    severity: 'err',
  },

  'call-fwd-always': { task: 'Forwarding & DND', models: ALL },
  'call-fwd-busy': { task: 'Forwarding & DND', models: ALL },
  'call-fwd-noanswer': { task: 'Forwarding & DND', models: ALL },
  'call-transfer-mode': { task: 'Calls & Transfers', models: ALL },
  'call-dial-plan': { task: 'Calls & Transfers', models: ALL },
  'call-interdigit': { task: 'Calls & Transfers', models: ALL },
  'call-max-calls': { task: 'Calls & Transfers', models: ALL },

  // BLF / Presence
  'blf-subscribe-period': {
    task: 'Calls & Transfers',
    models: DESK_MODELS,
    caveat: 'Set subscribe_period ≤ SIP registration expiry. If BLF keys go dark after some time, this value is too high or the server is not sending NOTIFY refreshes.',
  },
  'blf-pickup-enable': {
    task: 'Park & Pickup',
    models: DESK_MODELS,
    caveat: 'Requires the pickup code to be enabled on the PBX. For NetSapiens: *8 + extension (directed pickup). Confirm the feature code in NS admin before provisioning.',
  },
  'blf-alert-tone': {
    task: 'Calls & Transfers',
    models: DESK_MODELS,
    caveat: 'BLF alert tones can be disruptive in open offices. Consider disabling on phones not used for reception.',
  },
  'blf-ns-list-subscription': {
    task: 'Calls & Transfers',
    models: DESK_MODELS,
    caveat: 'NS XML presence list must be configured in NS admin → Domain → Presence before this will work. Confirm the list URI with your NS admin. Individual BLF SUBSCRIBE still works if the list URI is wrong — the phone falls back gracefully.',
  },
  'blf-led-behavior': {
    task: 'Keys & Display',
    models: DESK_MODELS,
    caveat: 'LED color values vary slightly across T3x/T4x/T5x firmware. Test on a physical phone after provisioning. Do not change these unless the default LED behavior is incorrect.',
  },

  // Call Park
  'callpark-settings': {
    task: 'Park & Pickup',
    models: DESK_MODELS,
    caveat: 'Verify NS feature codes in NS admin → Domain → Feature Codes. Default NS park is *68, retrieve is *88 — these can be customized per domain. Mismatch between phone and NS codes is the most common park failure.',
  },
  'callpark-orbit-blf': {
    task: 'Park & Pickup',
    models: DESK_MODELS,
    caveat: 'Park orbit monitoring requires NS to expose the orbit as a subscribable presence resource. Test BLF LED behavior with a parked call before considering this complete.',
  },
  'callpark-audio-notify': {
    task: 'Park & Pickup',
    models: DESK_MODELS,
  },
}

const CATEGORY_FALLBACK_TASK = {
  'Programmable Keys': 'Keys & Display',
  Basic: 'Keys & Display',
  LED: 'Keys & Display',
  Network: 'Diagnostics',
  SIP: 'Diagnostics',
  Audio: 'Diagnostics',
  Display: 'Keys & Display',
  Security: 'Provisioning & Reset',
  Provisioning: 'Provisioning & Reset',
  'Call Settings': 'Calls & Transfers',
  'BLF / Presence': 'Calls & Transfers',
  'Call Park': 'Park & Pickup',
}

/**
 * @param {object} item
 * @returns {object}
 */
export function shapeYealinkEntry(item) {
  const override = BY_ID[item.id] || {}
  const task = override.task || CATEGORY_FALLBACK_TASK[item.category] || 'Keys & Display'
  const models = override.models || ALL
  const caveat = override.caveat || item.caveat || ''
  const severity = override.severity
    || item.severity
    || (caveat
      ? (/reset|erase|do not|must be told|failure/i.test(caveat) ? 'err' : 'warn')
      : '')
  return {
    ...item,
    task,
    models,
    caveat,
    severity,
  }
}

/**
 * @param {object[]} codes
 * @returns {object[]}
 */
export function shapeYealinkCodes(codes) {
  return (codes || []).map(shapeYealinkEntry)
}

/** True if entry applies to selected model filter (or filter is all). */
export function matchesYealinkModel(item, model) {
  if (!model || model === 'all') return true
  const models = item.models || ALL
  if (models.includes('all')) return true
  return models.includes(model)
}
