const REDACTED = '***REDACTED***'

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /authorization/i,
  /token/i,
  /secret/i,
  /password/i,
  /cookie/i,
]

function shouldMaskKey(key) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(String(key)))
}

export function maskSecret(value) {
  if (!value) return ''
  const text = String(value)
  if (text.length <= 8) return REDACTED
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

export function redactString(value) {
  if (!value) return value

  let output = String(value)
  output = output.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
    REDACTED
  )
  output = output.replace(/(Bearer\s+)[^\s"']+/gi, `$1${REDACTED}`)
  output = output.replace(
    /\b(api[_-]?key|token|password|secret)=([^&\s]+)/gi,
    (_, key) => `${key}=${REDACTED}`
  )
  output = output.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
  output = output.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, REDACTED)
  output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
  output = output.replace(/\b1[3-9]\d{9}\b/g, REDACTED)
  output = output.replace(/\b\d{17}[0-9Xx]\b/g, REDACTED)
  output = output.replace(/(姓名\s*[:：]\s*)([^\s,，。;；]{2,12})/gi, `$1${REDACTED}`)
  output = output.replace(/(name\s*[:=]\s*)([A-Za-z][A-Za-z\s.'-]{1,50})/gi, `$1${REDACTED}`)

  return output
}

export function redactObject(value, depth = 0) {
  if (depth > 6 || value == null) return value

  if (typeof value === 'string') return redactString(value)
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => redactObject(item, depth + 1))

  const result = {}
  for (const [key, raw] of Object.entries(value)) {
    if (shouldMaskKey(key)) {
      result[key] = typeof raw === 'string' ? maskSecret(raw) : REDACTED
      continue
    }
    result[key] = redactObject(raw, depth + 1)
  }
  return result
}
