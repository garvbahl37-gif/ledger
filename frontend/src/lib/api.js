/**
 * Ledger API client.
 *
 * The one non-obvious thing in here: the pipeline endpoint is a POST with a
 * multipart body that responds with text/event-stream. EventSource cannot do
 * that — it only issues GETs and cannot set a body. So the stream is read off
 * fetch's ReadableStream and framed by hand. Everything else is plain JSON.
 */

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: options.body instanceof FormData
        ? undefined
        : { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      throw new ApiError(`${API_BASE} did not respond in time.`, 0, 'timeout')
    }
    throw new ApiError(
      `Can't reach the Ledger API at ${API_BASE}. Start the backend with: uvicorn main:app --port 8000`,
      0,
      cause?.message,
    )
  }

  if (!res.ok) {
    let detail
    try {
      detail = (await res.json())?.detail
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status, detail)
  }

  if (res.status === 204) return null
  const type = res.headers.get('content-type') || ''
  return type.includes('application/json') ? res.json() : res.text()
}

/* ─── Health & sessions ──────────────────────────────────────────── */

/**
 * True when this page is served over HTTPS but the engine is configured on
 * plain HTTP. Browsers block that combination outright as mixed content, so the
 * request can never succeed and the UI should say why rather than time out.
 */
export function isMixedContentBlocked() {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    API_BASE.startsWith('http://')
  )
}

/**
 * Health check with a hard timeout. Without one, a request to an unreachable
 * host can hang until the browser's own (very long) network timeout, leaving
 * the interface reporting "checking" indefinitely.
 */
export function health(timeoutMs = 6000) {
  if (isMixedContentBlocked()) {
    return Promise.reject(
      new ApiError(
        `This page is served over HTTPS, so the browser blocks requests to ${API_BASE}. ` +
        'Point VITE_API_BASE at an HTTPS engine, or run the interface locally.',
        0,
        'mixed-content',
      ),
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return request('/api/health', { signal: controller.signal })
    .finally(() => clearTimeout(timer))
}
export const createSession = () => request('/api/sessions/create', { method: 'POST' })
export const getStatus     = (id) => request(`/api/sessions/${id}/status`)
export const getReport     = (id) => request(`/api/sessions/${id}/report`)
export const listSessions  = () => request('/api/admin/sessions')

export const addHypotheses = (id, hypotheses) =>
  request(`/api/sessions/${id}/hypotheses`, {
    method: 'POST',
    body: JSON.stringify({ hypotheses }),
  })

export const runSql = (id, query) =>
  request(`/api/sessions/${id}/sql`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  })

export const sendChat = (id, message) =>
  request(`/api/sessions/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })

/* ─── Observability ──────────────────────────────────────────────── */

export const getTelemetry      = (id) => request(`/api/sessions/${id}/telemetry`)
export const getTelemetryStats = () => request('/api/admin/telemetry/overview')
export const getPromptVersions = () => request('/api/admin/prompt-versions')
export const runMetaAgent      = () => request('/api/admin/meta-agent/run', { method: 'POST' })

/* ─── Exports ────────────────────────────────────────────────────── */

export const notebookUrl = (id) => `${API_BASE}/api/sessions/${id}/notebook`
export const reportUrl   = (id) => `${API_BASE}/api/sessions/${id}/export/report.html`
export const pdfUrl      = (id) => `${API_BASE}/api/sessions/${id}/export/report.pdf`

/* ─── SSE over POST ──────────────────────────────────────────────── */

/**
 * Parse an SSE frame buffer into events, returning the unconsumed tail.
 * A frame is terminated by a blank line; `data:` lines within a frame join
 * with newlines. Split out so it can be unit-tested without a network.
 */
export function parseSseBuffer(buffer) {
  const events = []
  let rest = buffer
  let idx

  // Accept both \n\n and \r\n\r\n terminators.
  while ((idx = rest.search(/\r?\n\r?\n/)) !== -1) {
    const raw = rest.slice(0, idx)
    rest = rest.slice(idx + rest.match(/\r?\n\r?\n/)[0].length)

    const data = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n')

    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      events.push({ stage: 'RAW', message: data })
    }
  }
  return { events, rest }
}

async function streamPipeline(path, body, { onEvent, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    signal,
  })

  if (!res.ok) {
    let detail
    try { detail = (await res.json())?.detail } catch { detail = await res.text().catch(() => '') }
    throw new ApiError(detail || `Upload failed (${res.status})`, res.status, detail)
  }
  if (!res.body) throw new ApiError('This browser cannot read streaming responses.', 0)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseBuffer(buffer)
      buffer = rest
      for (const evt of events) onEvent?.(evt)
    }
    // Flush any frame not terminated by a blank line before EOF.
    buffer += decoder.decode()
    if (buffer.trim()) {
      const { events } = parseSseBuffer(`${buffer}\n\n`)
      for (const evt of events) onEvent?.(evt)
    }
  } finally {
    reader.releaseLock?.()
  }
}

/** Upload a file and stream the pipeline. `dataDict` feeds A2's RAG context. */
export function uploadAndStream(sessionId, { file, dataDict, hypotheses, onEvent, signal }) {
  const form = new FormData()
  form.append('file', file)
  if (dataDict) form.append('data_dict', dataDict)
  if (hypotheses?.length) form.append('user_hypotheses', JSON.stringify(hypotheses))
  return streamPipeline(`/api/sessions/${sessionId}/upload`, form, { onEvent, signal })
}

/** Connect a Google Sheet / Drive CSV by URL and stream the pipeline. */
export function connectSheetAndStream(sessionId, { url, hypotheses, onEvent, signal }) {
  return streamPipeline(
    `/api/sessions/${sessionId}/connect-sheet`,
    { url, user_hypotheses: hypotheses?.length ? hypotheses : null },
    { onEvent, signal },
  )
}
