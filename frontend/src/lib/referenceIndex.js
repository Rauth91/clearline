/**
 * Flattened searchable index over Yealink codes + Codec/QoS + firmware table.
 */

import { YEALINK_CODES } from '../data/yealinkCodes.js'
import { CODECS, DSCP, QOS_TIPS, SIP_CODES } from '../data/codecRef.js'
import { FIRMWARE_TABLE } from './firmwareTable.js'

/** @typedef {{ source: 'yealink' | 'codec' | 'firmware', title: string, subtitle: string, body: string, keywords: string[] }} RefRecord */

/** @type {RefRecord[]} */
export const REFERENCE_RECORDS = [
  ...YEALINK_CODES.map(code => ({
    source: /** @type {const} */ ('yealink'),
    title: code.name,
    subtitle: [code.task, code.category].filter(Boolean).join(' · ') || 'Yealink',
    body: [code.description, code.caveat, ...(code.codes || [])].filter(Boolean).join(' · '),
    keywords: [
      code.id,
      code.category,
      code.task,
      code.caveat,
      ...(code.models || []),
      ...(code.codes || []),
      ...(code.variables || []).flatMap(v => [v.id, v.label]),
    ].filter(Boolean).map(String),
  })),
  ...CODECS.map(c => ({
    source: /** @type {const} */ ('codec'),
    title: c.name,
    subtitle: `${c.type} · ${c.bandwidth}`,
    body: c.notes,
    keywords: [c.type, c.bandwidth, String(c.payload), c.ptime, c.quality, 'codec'],
  })),
  ...DSCP.map(d => ({
    source: /** @type {const} */ ('codec'),
    title: d.class,
    subtitle: `DSCP ${d.value} · ${d.hex}`,
    body: d.use,
    keywords: [d.value, d.hex, d.binary, d.tos, 'dscp', 'qos', d.critical ? 'critical' : ''],
  })),
  ...QOS_TIPS.map((t, i) => ({
    source: /** @type {const} */ ('codec'),
    title: `QoS tip · ${t.platform}`,
    subtitle: t.platform,
    body: t.tip,
    keywords: [t.platform, 'qos', 'tip', String(i)],
  })),
  ...SIP_CODES.map(c => ({
    source: /** @type {const} */ ('codec'),
    title: `SIP ${c.code} ${c.label}`,
    subtitle: `${c.class} · ${c.severity}`,
    body: c.desc,
    keywords: [c.code, c.label, c.class, c.severity, 'sip'],
  })),
  ...FIRMWARE_TABLE.map(e => ({
    source: /** @type {const} */ ('firmware'),
    title: e.model,
    subtitle: e.eol
      ? 'EOL'
      : (e.minFw ? `Min ${e.minFw}` : 'No minimum listed'),
    body: e.eolNote || (e.minFw ? `Minimum firmware ${e.minFw} for NetSapiens provisioning.` : 'Check platform notes.'),
    keywords: [
      e.model,
      e.minFw,
      e.eol ? 'eol' : 'supported',
      e.eolNote,
      'firmware',
      'yealink',
      'polycom',
      'cisco',
      'algo',
    ].filter(Boolean).map(String),
  })),
]

function fieldScore(text, q) {
  const t = String(text || '').toLowerCase()
  if (!t || !q) return 0
  let score = 0
  if (t.startsWith(q)) score += 12
  else if (t.includes(q)) score += 6
  for (const word of t.split(/[\s/·,;:|()\-]+/).filter(Boolean)) {
    if (word.startsWith(q)) score += 4
    else if (word.includes(q)) score += 1
  }
  return score
}

/**
 * Score a record against a query using includes / startsWith on title, subtitle, body, keywords.
 * @param {RefRecord} record
 * @param {string} query
 */
export function scoreReferenceRecord(record, query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return 0
  let score = fieldScore(record.title, q) * 2
  score += fieldScore(record.subtitle, q)
  score += fieldScore(record.body, q)
  for (const kw of record.keywords || []) {
    score += fieldScore(kw, q)
  }
  return score
}

/**
 * @param {string} query
 * @param {{ limit?: number, source?: 'yealink' | 'codec' | 'firmware' }} [opts]
 * @returns {Array<RefRecord & { score: number }>}
 */
export function searchReference(query, opts = {}) {
  const q = String(query || '').trim()
  const limit = opts.limit ?? 40
  const source = opts.source
  const pool = source
    ? REFERENCE_RECORDS.filter(r => r.source === source)
    : REFERENCE_RECORDS

  if (!q) {
    return pool.slice(0, limit).map(r => ({ ...r, score: 0 }))
  }

  return pool
    .map(r => ({ ...r, score: scoreReferenceRecord(r, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}

export function groupReferenceResults(results) {
  const yealink = results.filter(r => r.source === 'yealink')
  const codec = results.filter(r => r.source === 'codec')
  const firmware = results.filter(r => r.source === 'firmware')
  return { yealink, codec, firmware }
}
