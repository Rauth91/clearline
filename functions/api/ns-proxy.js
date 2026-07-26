/**
 * Cloudflare Pages Function — NetSapiens API proxy
 * Route: /api/ns-proxy
 *
 * Accepts POST { host, domain, username, password, endpoint, method?, body? }
 * Forwards to https://{host}/ns-api/v2/domains/{domain}/{endpoint}
 * with HTTP Basic auth. Returns the NS JSON response to the browser,
 * solving the CORS problem that blocks direct browser→NS calls.
 *
 * Security: only callable from same-origin (Pages enforces this via
 * the browser's same-origin request). No credentials are stored here.
 */

const ALLOWED_ENDPOINTS = /^(subscribers|attendants|huntgroups|timeframes|routes|domains)[/?]?/

export async function onRequestPost(context) {
  const { request } = context

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { host, domain, endpoint, username, password, method = 'GET', requestBody } = body

  // Validate required fields
  if (!host || !domain || !endpoint || !username || !password) {
    return json({ error: 'Missing required fields: host, domain, endpoint, username, password' }, 400)
  }

  // Restrict to known safe NS API endpoints only
  if (!ALLOWED_ENDPOINTS.test(String(endpoint))) {
    return json({ error: `Endpoint not allowed: ${endpoint}` }, 400)
  }

  // Sanitize host — must be a plain hostname/IP, no path injection
  const cleanHost = String(host).replace(/[^a-zA-Z0-9.\-:]/g, '')
  if (!cleanHost || cleanHost !== host) {
    return json({ error: 'Invalid host' }, 400)
  }

  const nsUrl = `https://${cleanHost}/ns-api/v2/domains/${encodeURIComponent(domain)}/${endpoint}`
  const credentials = btoa(`${username}:${password}`)

  let nsResponse
  try {
    nsResponse = await fetch(nsUrl, {
      method,
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: method !== 'GET' && requestBody ? JSON.stringify(requestBody) : undefined,
    })
  } catch (err) {
    return json({ error: `Failed to reach NS host: ${err.message}` }, 502)
  }

  let data
  try {
    data = await nsResponse.json()
  } catch {
    const text = await nsResponse.text().catch(() => '')
    return json({ error: `NS returned non-JSON (${nsResponse.status})`, raw: text.slice(0, 500) }, 502)
  }

  if (!nsResponse.ok) {
    return json({ error: `NS API error ${nsResponse.status}`, detail: data }, nsResponse.status)
  }

  return json(data, 200)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Same-origin only — no external CORS needed
      'Cache-Control': 'no-store',
    },
  })
}
