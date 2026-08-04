import { describe, expect, it } from 'vitest'
import { resolveLegacyRedirect } from '../router.js'

function route(path) {
  const [pathPart, queryPart = ''] = path.replace(/^#/, '').split('?')
  const segments = pathPart.split('/').filter(Boolean)
  const query = {}
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v = ''] = pair.split('=')
      query[decodeURIComponent(k)] = decodeURIComponent(v)
    }
  }
  return { segments, query, path: pathPart, params: {}, name: 'tool' }
}

describe('resolveLegacyRedirect', () => {
  it('maps calldiag and pcap to callanalysis', () => {
    expect(resolveLegacyRedirect(route('/tools/calldiag'))).toEqual({
      path: '/tools/callanalysis',
      query: {},
    })
    expect(resolveLegacyRedirect(route('/tools/pcap'))).toEqual({
      path: '/tools/callanalysis',
      query: {},
    })
  })

  it('maps netcheck, ports, router to readiness tabs', () => {
    expect(resolveLegacyRedirect(route('/tools/netcheck')).path).toBe('/tools/readiness')
    expect(resolveLegacyRedirect(route('/tools/netcheck')).query.tab).toBe('network')
    expect(resolveLegacyRedirect(route('/tools/ports')).query.tab).toBe('ports')
    expect(resolveLegacyRedirect(route('/tools/router?focus=qos'))).toEqual({
      path: '/tools/readiness',
      query: { focus: 'qos', tab: 'router' },
    })
  })

  it('maps yealink and algo to deviceconfig tabs', () => {
    expect(resolveLegacyRedirect(route('/tools/yealink?q=park'))).toEqual({
      path: '/tools/deviceconfig',
      query: { q: 'park', tab: 'yealink' },
    })
    expect(resolveLegacyRedirect(route('/tools/algo')).query.tab).toBe('algo')
  })

  it('maps job runbook to golive tab', () => {
    expect(resolveLegacyRedirect(route('/job/abc/runbook'))).toEqual({
      path: '/job/abc/golive',
      query: { tab: 'runbook' },
    })
  })

  it('leaves canonical and palette routes alone', () => {
    expect(resolveLegacyRedirect(route('/tools/callanalysis'))).toBeNull()
    expect(resolveLegacyRedirect(route('/tools/readiness?tab=network'))).toBeNull()
    expect(resolveLegacyRedirect(route('/tools/deviceconfig'))).toBeNull()
    expect(resolveLegacyRedirect(route('/tools/quickcard'))).toBeNull()
    expect(resolveLegacyRedirect(route('/tools/codec'))).toBeNull()
    expect(resolveLegacyRedirect(route('/tools/firmware'))).toBeNull()
  })
})
