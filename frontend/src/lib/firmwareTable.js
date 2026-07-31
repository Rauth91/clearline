/**
 * firmwareTable.js — minimum firmware versions required for NetSapiens provisioning.
 * Used by the Hardware Audit step in MigrationWorkspace.
 */

export const FIRMWARE_TABLE = [
  // ── Yealink ────────────────────────────────────────────────
  { model: 'Yealink T21P_E2', minFw: '52.84.0.125', eol: false },
  { model: 'Yealink T41S',    minFw: '66.84.0.125', eol: false },
  { model: 'Yealink T42S',    minFw: '66.86.0.20',  eol: false },
  { model: 'Yealink T43U',    minFw: '96.86.0.25',  eol: false },
  { model: 'Yealink T46G',    minFw: '28.84.0.130', eol: false },
  { model: 'Yealink T46S',    minFw: '66.86.0.20',  eol: false },
  { model: 'Yealink T46U',    minFw: '108.86.0.20', eol: false },
  { model: 'Yealink T48S',    minFw: '66.86.0.20',  eol: false },
  { model: 'Yealink T48U',    minFw: '108.86.0.20', eol: false },
  { model: 'Yealink T53',     minFw: '96.86.0.25',  eol: false },
  { model: 'Yealink T53W',    minFw: '96.86.0.25',  eol: false },
  { model: 'Yealink T54W',    minFw: '96.86.0.25',  eol: false },
  { model: 'Yealink T57W',    minFw: '96.86.0.25',  eol: false },
  { model: 'Yealink T33G',    minFw: '124.86.0.40', eol: false },
  { model: 'Yealink T31G',    minFw: '124.86.0.40', eol: false },
  { model: 'Yealink T31P',    minFw: '124.86.0.40', eol: false },
  { model: 'Yealink T21',     minFw: null,           eol: true,  eolNote: 'EOL — may not provision on NS' },
  { model: 'Yealink W60B',    minFw: '77.83.0.20',  eol: false },
  { model: 'Yealink W70B',    minFw: '146.85.0.5',  eol: false },
  { model: 'Yealink CP960',   minFw: '73.86.0.20',  eol: false },
  // ── Polycom / Poly ─────────────────────────────────────────
  { model: 'Polycom VVX150',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom VVX250',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom VVX300',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX310',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX350',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom VVX400',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX410',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX450',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom VVX500',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX501',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom VVX600',  minFw: '5.9.0',  eol: true,  eolNote: 'EOL — verify support with Reinvent' },
  { model: 'Polycom VVX601',  minFw: '6.3.0',  eol: false },
  { model: 'Polycom Trio8800', minFw: '5.9.3', eol: false },
  // ── Cisco SPA ──────────────────────────────────────────────
  { model: 'Cisco SPA303',    minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA504G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA508G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA509G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA512G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA514G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  { model: 'Cisco SPA525G',   minFw: null, eol: true,  eolNote: 'EOL — not supported on NS' },
  // ── Algo ───────────────────────────────────────────────────
  { model: 'Algo 8180',       minFw: null, eol: false, eolNote: 'SIP paging — no NS provisioning needed' },
  { model: 'Algo 8188',       minFw: null, eol: false, eolNote: 'SIP paging — no NS provisioning needed' },
]

/**
 * Compare firmware version strings (e.g. "66.86.0.20" vs "66.84.0.125").
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareFw(a, b) {
  if (!a || !b) return 0
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/**
 * Find the firmware table entry for a model string (fuzzy match).
 */
export function lookupFirmware(modelStr) {
  if (!modelStr) return null
  const norm = String(modelStr).toLowerCase().replace(/[\s\-_.]+/g, '')
  return FIRMWARE_TABLE.find(e => {
    const em = e.model.toLowerCase().replace(/[\s\-_.]+/g, '')
    return norm === em || norm.includes(em) || em.includes(norm)
  }) || null
}

/**
 * Audit a device: given model and currentFw string, return { status, message }.
 * status: 'ok' | 'warn' | 'fail' | 'unknown'
 */
export function auditDevice(model, currentFw) {
  const entry = lookupFirmware(model)
  if (!entry) return { status: 'unknown', message: 'Model not in firmware table — verify manually' }
  if (entry.eol) return { status: 'warn', message: entry.eolNote || 'EOL device — verify support' }
  if (!currentFw || !currentFw.trim()) return { status: 'unknown', message: 'No firmware version entered — enter current version to verify' }
  if (!entry.minFw) return { status: 'ok', message: entry.eolNote || 'Supported' }
  const cmp = compareFw(currentFw.trim(), entry.minFw)
  if (cmp < 0) return { status: 'fail', message: `Needs upgrade to ${entry.minFw} minimum (currently ${currentFw})` }
  return { status: 'ok', message: `${currentFw} ≥ ${entry.minFw} ✓` }
}
