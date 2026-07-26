/**
 * Built-in call flow templates + localStorage custom templates.
 * Each template is a partial design object — merged over an empty route on apply.
 */

const BUILTIN = [
  {
    id: 'standard-office',
    name: 'Standard office',
    description: 'AA with 3 options, M–F hours, VM after hours',
    icon: '🏢',
    design: {
      hours: { weekdayOpen: '8:00 AM', weekdayClose: '5:00 PM', timezone: 'America/Chicago' },
      autoAttendant: {
        enabled: 'Yes',
        greeting: 'Thank you for calling. Please listen carefully as our menu has changed.',
        option1: 'Sales',
        option2: 'Support',
        option0: 'Operator',
        timeoutAction: 'Repeat menu',
      },
      nightButton: { enabled: 'Yes', destination: 'General voicemail' },
      voicemail: { needed: 'Yes', generalMailbox: 'Main mailbox' },
    },
  },
  {
    id: 'direct-ring',
    name: 'Direct ring — no AA',
    description: 'DID rings straight to a hunt group, VM after hours',
    icon: '📞',
    design: {
      hours: { weekdayOpen: '8:00 AM', weekdayClose: '5:00 PM', timezone: 'America/Chicago' },
      autoAttendant: { enabled: 'No' },
      callFlow: { daytimePath: 'Hunt group — all phones ring', afterHoursPath: 'General voicemail' },
      voicemail: { needed: 'Yes', generalMailbox: 'Main mailbox' },
    },
  },
  {
    id: 'after-hours-vm',
    name: 'After-hours VM only',
    description: 'Simple routing — rings team, drops to VM when closed',
    icon: '🌙',
    design: {
      hours: { weekdayOpen: '9:00 AM', weekdayClose: '6:00 PM', timezone: 'America/Chicago' },
      autoAttendant: { enabled: 'No' },
      callFlow: { daytimePath: 'Ring all phones', afterHoursPath: 'After-hours voicemail' },
      nightButton: { enabled: 'Yes', destination: 'After-hours voicemail' },
      voicemail: { needed: 'Yes', generalMailbox: 'After-hours mailbox' },
    },
  },
  {
    id: 'multi-dept',
    name: 'Multi-department AA',
    description: 'AA with sales, support, billing, and operator options',
    icon: '🏬',
    design: {
      hours: { weekdayOpen: '8:00 AM', weekdayClose: '5:00 PM', timezone: 'America/Chicago' },
      autoAttendant: {
        enabled: 'Yes',
        greeting: 'Thank you for calling. For Sales press 1, Support press 2, Billing press 3, or stay on the line for the operator.',
        option1: 'Sales',
        option2: 'Support',
        option3: 'Billing',
        option0: 'Operator',
        timeoutAction: 'Transfer to operator',
      },
      nightButton: { enabled: 'Yes', destination: 'After-hours voicemail' },
      voicemail: { needed: 'Yes', generalMailbox: 'Main mailbox' },
    },
  },
  {
    id: 'on-call',
    name: 'On-call / 24-7',
    description: 'Always-open with on-call forwarding after hours',
    icon: '🔁',
    design: {
      hours: { weekdayOpen: '8:00 AM', weekdayClose: '5:00 PM', timezone: 'America/Chicago' },
      autoAttendant: { enabled: 'No' },
      callFlow: {
        daytimePath: 'Hunt group — office phones',
        afterHoursPath: 'On-call cell phone',
        ringGroups: 'On-call rotation',
      },
      nightButton: { enabled: 'Yes', whoUses: 'Front desk', destination: 'On-call cell' },
      voicemail: { needed: 'Yes', generalMailbox: 'Emergency mailbox' },
    },
  },
]

const STORAGE_KEY = 'cl_flow_templates_v1'

function loadCustom() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveCustom(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function getAllTemplates() {
  return [...BUILTIN, ...loadCustom()]
}

export function getBuiltinTemplates() {
  return BUILTIN
}

export function getCustomTemplates() {
  return loadCustom()
}

export function saveAsTemplate(name, description, design) {
  const list = loadCustom()
  const t = {
    id: `custom-${Date.now()}`,
    name,
    description: description || '',
    icon: '⭐',
    custom: true,
    design,
  }
  saveCustom([...list, t])
  return t
}

export function deleteCustomTemplate(id) {
  const list = loadCustom().filter(t => t.id !== id)
  saveCustom(list)
}

/**
 * Apply a template to a route design.
 * Deep-merges template.design over the current route, preserving route identity fields.
 */
export function applyTemplate(template, currentRoute) {
  const d = template.design || {}
  return {
    ...currentRoute,
    hours: { ...(currentRoute.hours || {}), ...(d.hours || {}) },
    autoAttendant: { ...(currentRoute.autoAttendant || {}), ...(d.autoAttendant || {}) },
    nightButton: { ...(currentRoute.nightButton || {}), ...(d.nightButton || {}) },
    callFlow: { ...(currentRoute.callFlow || {}), ...(d.callFlow || {}) },
    voicemail: { ...(currentRoute.voicemail || {}), ...(d.voicemail || {}) },
  }
}
