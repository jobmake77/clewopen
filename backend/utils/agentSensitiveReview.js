import AdmZip from 'adm-zip'
import { AGENT_SENSITIVE_POLICY } from '../config/agentSensitivePolicy.js'

const MAX_FINDINGS = Math.max(1, Number(AGENT_SENSITIVE_POLICY.maxFindings || 60))
const MAX_FILE_BYTES = Math.max(1024, Number(AGENT_SENSITIVE_POLICY.maxFileBytes || 512 * 1024))
const TEXT_EXT_ALLOWLIST = Array.isArray(AGENT_SENSITIVE_POLICY.textExtAllowlist)
  ? AGENT_SENSITIVE_POLICY.textExtAllowlist.map((item) => String(item).toLowerCase())
  : ['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.csv']

function compileRules(rawRules = []) {
  return rawRules
    .map((rule) => {
      try {
        return {
          category: String(rule.category || 'unknown'),
          pattern: new RegExp(String(rule.pattern || ''), String(rule.flags || 'g')),
          message: String(rule.message || '检测到疑似敏感内容'),
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

const HIGH_RULES = compileRules(AGENT_SENSITIVE_POLICY.highRules || [])
const MEDIUM_RULES = compileRules(AGENT_SENSITIVE_POLICY.mediumRules || [])

const CATEGORY_REMEDIATION = {
  private_key: '删除私钥内容，改为引用环境变量或本地安全存储，不要放入 Agent 包。',
  api_key: '删除明文 API Key，改为运行时注入（环境变量/密钥管理服务）。',
  github_token: '移除 GitHub Token，使用短期凭证或用户本地配置，不要写入 memory 文件。',
  aws_access_key: '移除云访问密钥，改为 IAM 角色或临时凭证方式。',
  id_card: '删除证件号或仅保留脱敏片段，避免可识别个人身份信息。',
  email: '将邮箱改为脱敏或示例值，避免真实用户联系方式。',
  phone: '将手机号改为脱敏形式（如 138****1234）或示例值。',
  bank_card: '删除银行卡号，仅保留不可逆脱敏信息。',
  internal_url: '移除内网/本地地址，替换为公开可用或占位地址。',
  prompt_injection: '删除可疑越狱/绕过限制指令，明确合规边界。',
}

function getExt(name = '') {
  const index = String(name).lastIndexOf('.')
  if (index < 0) return ''
  return String(name).slice(index).toLowerCase()
}

function safeSnippet(value = '') {
  const content = String(value || '').trim().replace(/\s+/g, ' ')
  if (!content) return ''
  return `${content.slice(0, 6)}***${content.slice(-4)}`
}

function shouldInspectEntry(entryName = '') {
  const ext = getExt(entryName)
  if (TEXT_EXT_ALLOWLIST.includes(ext)) return true
  const lower = String(entryName || '').toLowerCase()
  return lower.includes('memory') || lower.includes('soul') || lower.includes('rules') || lower.includes('identity')
}

function createFinding({ severity, category, file, line, message, sample }) {
  return {
    severity,
    category,
    file,
    line,
    message,
    sample,
  }
}

function collectFindingsForLine({ line, lineNo, file, rules, severity, findings }) {
  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    let match = rule.pattern.exec(line)
    while (match) {
      findings.push(
        createFinding({
          severity,
          category: rule.category,
          file,
          line: lineNo,
          message: rule.message,
          sample: safeSnippet(match[0] || ''),
        })
      )
      if (findings.length >= MAX_FINDINGS) return
      match = rule.pattern.exec(line)
    }
    if (findings.length >= MAX_FINDINGS) return
  }
}

function hasLikelyInternalUrl(text = '') {
  const lower = String(text || '').toLowerCase()
  return lower.includes('.internal') || lower.includes('localhost') || lower.includes('127.0.0.1')
}

export function scanAgentPackageSensitiveContent(zipPath) {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
  const findings = []
  let scannedFiles = 0

  for (const entry of entries) {
    if (!shouldInspectEntry(entry.entryName)) continue
    const buffer = entry.getData()
    if (!buffer || buffer.length === 0 || buffer.length > MAX_FILE_BYTES) continue
    const content = buffer.toString('utf8')
    scannedFiles += 1
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      collectFindingsForLine({
        line,
        lineNo: i + 1,
        file: entry.entryName,
        rules: HIGH_RULES,
        severity: 'high',
        findings,
      })
      if (findings.length >= MAX_FINDINGS) break
      collectFindingsForLine({
        line,
        lineNo: i + 1,
        file: entry.entryName,
        rules: MEDIUM_RULES,
        severity: 'medium',
        findings,
      })
      if (findings.length >= MAX_FINDINGS) break
    }

    if (hasLikelyInternalUrl(content)) {
      findings.push(
        createFinding({
          severity: 'medium',
          category: 'internal_url',
          file: entry.entryName,
          line: null,
          message: '检测到疑似内网或本地地址，请确认是否可公开分发',
          sample: 'internal-url',
        })
      )
    }

    if (findings.length >= MAX_FINDINGS) break
  }

  const highFindings = findings.filter((item) => item.severity === 'high')
  const mediumFindings = findings.filter((item) => item.severity === 'medium')
  const decision = highFindings.length > 0 ? 'reject' : mediumFindings.length > 0 ? 'needs_review' : 'pass'
  const remediation = buildRemediation(findings)

  return {
    decision,
    summary: {
      scannedFiles,
      findingsCount: findings.length,
      highCount: highFindings.length,
      mediumCount: mediumFindings.length,
    },
    findings,
    remediation,
  }
}

function buildRemediation(findings = []) {
  const categories = [...new Set((findings || []).map((item) => String(item.category || '').toLowerCase()).filter(Boolean))]
  return categories.map((category) => ({
    category,
    suggestion: CATEGORY_REMEDIATION[category] || '请删除或脱敏该类敏感内容后重新上传。',
  }))
}
