function normalizeText(value) {
  return String(value || '').trim()
}

const HIGH_RISK_PATTERNS = [
  {
    category: 'private_key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/i,
    description: '检测到私钥内容',
  },
  {
    category: 'api_key',
    pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/i,
    description: '检测到疑似 API Key',
  },
  {
    category: 'credential_assignment',
    pattern: /\b(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}["']?/i,
    description: '检测到明文密钥/口令赋值',
  },
  {
    category: 'id_card',
    pattern: /(身份证|id\s*card)[^\n]{0,20}\b\d{17}[0-9Xx]\b/i,
    description: '检测到身份证件信息',
  },
]

const MEDIUM_RISK_PATTERNS = [
  {
    category: 'phone',
    pattern: /\b1[3-9]\d{9}\b/,
    description: '检测到手机号',
  },
  {
    category: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    description: '检测到邮箱地址',
  },
  {
    category: 'name',
    pattern: /(姓名\s*[:：]\s*[^\s,，。;；]{2,12}|name\s*[:=]\s*[A-Za-z][A-Za-z\s.'-]{1,50})/i,
    description: '检测到姓名字段',
  },
]

function evaluateSingleText(source, text, patterns) {
  const findings = []
  for (const rule of patterns) {
    if (!rule.pattern.test(text)) continue
    findings.push({
      source,
      category: rule.category,
      description: rule.description,
    })
  }
  return findings
}

export function assessTrialInputRisk({ message = '', attachments = [] }) {
  const findingsHigh = []
  const findingsMedium = []
  const normalizedMessage = normalizeText(message)

  if (normalizedMessage) {
    findingsHigh.push(...evaluateSingleText('message', normalizedMessage, HIGH_RISK_PATTERNS))
    findingsMedium.push(...evaluateSingleText('message', normalizedMessage, MEDIUM_RISK_PATTERNS))
  }

  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const fileName = normalizeText(attachment?.fileName)
    if (!fileName) continue
    const source = `attachment:${fileName}`
    findingsHigh.push(...evaluateSingleText(source, fileName, HIGH_RISK_PATTERNS))
    findingsMedium.push(...evaluateSingleText(source, fileName, MEDIUM_RISK_PATTERNS))
  }

  if (findingsHigh.length > 0) {
    return {
      level: 'high',
      blocked: true,
      requiresConfirmation: false,
      findings: findingsHigh,
    }
  }

  if (findingsMedium.length > 0) {
    return {
      level: 'medium',
      blocked: false,
      requiresConfirmation: true,
      findings: findingsMedium,
    }
  }

  return {
    level: 'none',
    blocked: false,
    requiresConfirmation: false,
    findings: [],
  }
}

export function summarizeRiskFindings(findings = []) {
  return findings
    .slice(0, 5)
    .map((item) => `${item.description}（${item.source}）`)
    .join('；')
}
