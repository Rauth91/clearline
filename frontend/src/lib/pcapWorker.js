/**
 * Web Worker — parse pcap off the UI thread.
 * Messages in: { type: 'parse', buffer: ArrayBuffer, name?: string }
 * Messages out: { type: 'progress', pct } | { type: 'done', result } | { type: 'error', message }
 */

import { parsePcapFile } from './pcap.js'

self.onmessage = (event) => {
  const data = event.data || {}
  if (data.type !== 'parse') return
  try {
    const result = parsePcapFile(data.buffer, {
      onProgress: (pct) => {
        self.postMessage({ type: 'progress', pct })
      },
    })
    if (result.error) {
      self.postMessage({ type: 'error', message: result.error.message, code: result.error.code })
      return
    }
    self.postMessage({ type: 'done', result })
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) })
  }
}
