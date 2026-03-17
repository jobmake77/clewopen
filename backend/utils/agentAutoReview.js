const MAX_RECOMMENDED_FILE_COUNT = 300
const MAX_RECOMMENDED_TAGS = 10

const SUSPICIOUS_FILENAME_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)id_rsa(\.|$)/i,
  /\.pem$/i,
  /(^|\/)secrets?\//i,
]

function issue(level, code, message) {
  return { level, code, message }
}

function hasRiskySystemPermission(manifest) {
  const permissions = manifest?.permissions || {}
  const systemPermissions = Array.isArray(permissions.system) ? permissions.system : []
  return systemPermissions.some((item) => ['exec', 'process'].includes(String(item || '').toLowerCase()))
}

export function runAgentAutoReview({ manifest, files, validationWarnings = [] }) {
  const safeFiles = Array.isArray(files) ? files : []
  const safeWarnings = Array.isArray(validationWarnings) ? validationWarnings : []
  const issues = []

  if (safeFiles.length === 0) {
    issues.push(issue('critical', 'empty-package', '压缩包为空或无法读取文件结构'))
  }

  if (safeFiles.length > MAX_RECOMMENDED_FILE_COUNT) {
    issues.push(
      issue(
        'warning',
        'too-many-files',
        `文件数量较多 (${safeFiles.length})，建议控制在 ${MAX_RECOMMENDED_FILE_COUNT} 以内`
      )
    )
  }

  const suspiciousFiles = safeFiles.filter((file) =>
    SUSPICIOUS_FILENAME_PATTERNS.some((pattern) => pattern.test(String(file || '')))
  )
  if (suspiciousFiles.length > 0) {
    issues.push(
      issue(
        'critical',
        'suspicious-files',
        `检测到疑似敏感文件: ${suspiciousFiles.slice(0, 5).join(', ')}`
      )
    )
  }

  if (hasRiskySystemPermission(manifest)) {
    issues.push(
      issue('warning', 'risky-system-permission', 'manifest 声明了 system.exec/process，需人工重点复核')
    )
  }

  const tags = Array.isArray(manifest?.tags) ? manifest.tags : []
  if (tags.length > MAX_RECOMMENDED_TAGS) {
    issues.push(
      issue(
        'warning',
        'too-many-tags',
        `manifest 标签过多 (${tags.length})，建议不超过 ${MAX_RECOMMENDED_TAGS} 个`
      )
    )
  }

  if (safeWarnings.length > 0) {
    issues.push(issue('warning', 'manifest-warnings', `包校验产生 ${safeWarnings.length} 条警告`))
  }

  const criticalCount = issues.filter((item) => item.level === 'critical').length
  const warningCount = issues.filter((item) => item.level === 'warning').length
  const score = Math.max(0, 100 - criticalCount * 45 - warningCount * 10)
  const decision = criticalCount > 0 ? 'reject' : 'manual'

  return {
    score,
    decision,
    summary: criticalCount > 0 ? '自动审核拒绝' : '自动审核通过，进入人工审核',
    issues,
    stats: {
      fileCount: safeFiles.length,
      warningCount: safeWarnings.length,
    },
    reviewedAt: new Date().toISOString(),
  }
}
