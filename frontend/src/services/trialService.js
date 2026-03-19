import api from './api'

const TRIAL_REQUEST_TIMEOUT_MS = 240000

export const getTrialHistory = (agentId) => {
  return api.get(`/agents/${agentId}/trial/history`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const createTrialSession = (agentId) => {
  return api.post(`/agents/${agentId}/trial-sessions`, undefined, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const getTrialSession = (sessionId) => {
  return api.get(`/trial-sessions/${sessionId}`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const sendTrialSessionMessage = (sessionId, message) => {
  return api.post(`/trial-sessions/${sessionId}/messages`, { message }, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const token = localStorage.getItem('token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function buildStreamError(status, payload) {
  const errorMessage =
    payload?.error?.message ||
    payload?.message ||
    payload?.error ||
    `流式请求失败 (${status})`

  const error = new Error(errorMessage)
  error.response = {
    status,
    data: payload,
  }
  return error
}

function flushEventStreamBuffer(buffer, onEvent) {
  const chunks = buffer.split(/\r?\n\r?\n/)
  const rest = chunks.pop() || ''

  for (const chunk of chunks) {
    if (!chunk.trim() || chunk.startsWith(':')) continue

    let eventName = 'message'
    const dataLines = []

    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) continue

    const rawPayload = dataLines.join('\n')
    let payload = rawPayload

    try {
      payload = JSON.parse(rawPayload)
    } catch {
      payload = rawPayload
    }

    onEvent?.({
      event: eventName,
      data: payload,
    })
  }

  return rest
}

export const streamTrialSessionMessage = async (sessionId, message, handlers = {}) => {
  const response = await fetch(`/api/trial-sessions/${sessionId}/messages/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    let payload = null
    const text = await response.text()

    try {
      payload = JSON.parse(text)
    } catch {
      payload = { message: text }
    }

    throw buildStreamError(response.status, payload)
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalPayload = null

  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    buffer = flushEventStreamBuffer(buffer, (event) => {
      handlers.onEvent?.(event)

      if (event.event === 'done') {
        finalPayload = event.data
      }

      if (event.event === 'error') {
        throw buildStreamError(event.data?.statusCode || 500, event.data)
      }
    })

    if (done) break
  }

  if (buffer.trim()) {
    flushEventStreamBuffer(buffer, (event) => {
      handlers.onEvent?.(event)
      if (event.event === 'done') {
        finalPayload = event.data
      }
    })
  }

  return finalPayload
}

export const endTrialSession = (sessionId) => {
  return api.delete(`/trial-sessions/${sessionId}`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}
