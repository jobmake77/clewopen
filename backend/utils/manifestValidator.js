import AdmZip from 'adm-zip'
import { logger } from '../config/logger.js'

/**
 * manifest.json 验证规则
 */
const MANIFEST_SCHEMA = {
  required: ['name', 'version', 'description', 'author'],
  optional: ['category', 'tags', 'permissions', 'dependencies', 'icon', 'homepage', 'repository'],
  types: {
    name: 'string',
    version: 'string',
    description: 'string',
    author: 'string',
    category: 'string',
    tags: 'array',
    permissions: 'object',
    dependencies: 'object',
    icon: 'string',
    homepage: 'string',
    repository: 'string'
  }
}

/**
 * 允许的分类列表
 */
const ALLOWED_CATEGORIES = [
  '软件开发', '数据分析', '内容创作', '通用办公',
  '营销推广', '设计工具', '教育培训', '其他'
]

/**
 * 禁止的文件扩展名（安全检查）
 */
const FORBIDDEN_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.dll', '.so', '.dylib', '.app']

/**
 * 禁止的路径模式（防止路径遍历）
 */
const FORBIDDEN_PATHS = ['../', './', '__MACOSX/', '.git/', '.svn/', '.DS_Store']

/**
 * 文件大小限制（字节）
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * 验证版本号格式 (语义化版本)
 */
const validateVersion = (version) => {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  return semverRegex.test(version)
}

/**
 * 验证权限配置
 */
const validatePermissions = (permissions) => {
  const validPermissions = {
    filesystem: ['read', 'write', 'delete'],
    network: ['http', 'https', 'websocket'],
    system: ['exec', 'env', 'process']
  }

  for (const [category, perms] of Object.entries(permissions)) {
    if (!validPermissions[category]) {
      return { valid: false, error: `无效的权限类别: ${category}` }
    }

    if (!Array.isArray(perms)) {
      return { valid: false, error: `权限 ${category} 必须是数组` }
    }

    for (const perm of perms) {
      if (!validPermissions[category].includes(perm)) {
        return { valid: false, error: `无效的权限: ${category}.${perm}` }
      }
    }
  }

  return { valid: true }
}

/**
 * 验证依赖配置
 */
const validateDependencies = (dependencies) => {
  const validTypes = ['skills', 'agents', 'packages']

  for (const type of validTypes) {
    if (dependencies[type] && !Array.isArray(dependencies[type])) {
      return { valid: false, error: `依赖 ${type} 必须是数组` }
    }
  }

  return { valid: true }
}

/**
 * 验证分类
 */
const validateCategory = (category) => {
  if (!category) {
    return { valid: true } // 分类是可选的
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return {
      valid: false,
      error: `无效的分类: ${category}。允许的分类: ${ALLOWED_CATEGORIES.join(', ')}`
    }
  }

  return { valid: true }
}

/**
 * 验证标签
 */
const validateTags = (tags) => {
  if (!tags) {
    return { valid: true } // 标签是可选的
  }

  if (!Array.isArray(tags)) {
    return { valid: false, error: '标签必须是数组' }
  }

  if (tags.length < 1) {
    return { valid: false, error: '至少需要 1 个标签' }
  }

  if (tags.length > 10) {
    return { valid: false, error: '标签数量不能超过 10 个' }
  }

  return { valid: true }
}

/**
 * 验证文件安全性
 */
const validateFileSecurity = (files) => {
  const errors = []
  const warnings = []

  for (const file of files) {
    // 检查禁止的路径模式
    for (const forbidden of FORBIDDEN_PATHS) {
      if (file.includes(forbidden)) {
        errors.push(`检测到不安全的路径: ${file}`)
        break
      }
    }

    // 检查禁止的文件扩展名
    const ext = file.substring(file.lastIndexOf('.')).toLowerCase()
    if (FORBIDDEN_EXTENSIONS.includes(ext)) {
      errors.push(`检测到禁止的文件类型: ${file} (${ext})`)
    }
  }

  return { errors, warnings }
}

/**
 * 验证文件结构
 */
const validateFileStructure = (files) => {
  const errors = []
  const warnings = []

  // 必需文件
  const requiredFiles = [
    'manifest.json',
    'agent/IDENTITY.md',
    'agent/RULES.md'
  ]

  // 推荐文件
  const recommendedFiles = [
    'README.md',
    'agent/SKILLS.md'
  ]

  // 检查必需文件
  for (const required of requiredFiles) {
    const found = files.some(f => f === required || f.endsWith('/' + required))
    if (!found) {
      errors.push(`缺少必需文件: ${required}`)
    }
  }

  // 检查 agent/ 目录
  const hasAgentDir = files.some(f => f.startsWith('agent/') || f.includes('/agent/'))
  if (!hasAgentDir) {
    errors.push('缺少 agent/ 目录')
  }

  // 检查推荐文件（仅警告）
  for (const recommended of recommendedFiles) {
    const found = files.some(f => f === recommended || f.endsWith('/' + recommended))
    if (!found) {
      warnings.push(`建议添加文件: ${recommended}`)
    }
  }

  return { errors, warnings }
}

/**
 * 解析 zip 文件并提取 manifest.json
 */
export const extractManifest = (zipPath) => {
  try {
    const zip = new AdmZip(zipPath)
    const zipEntries = zip.getEntries()

    // 查找 manifest.json
    const manifestEntry = zipEntries.find(
      entry => entry.entryName === 'manifest.json' || entry.entryName.endsWith('/manifest.json')
    )

    if (!manifestEntry) {
      return {
        success: false,
        error: 'Agent 包中未找到 manifest.json 文件'
      }
    }

    // 读取并解析 manifest.json
    const manifestContent = manifestEntry.getData().toString('utf8')
    const manifest = JSON.parse(manifestContent)

    return {
      success: true,
      manifest,
      files: zipEntries.map(entry => entry.entryName)
    }
  } catch (error) {
    logger.error('解析 manifest.json 失败:', error)
    return {
      success: false,
      error: error.message === 'Unexpected end of JSON input'
        ? 'manifest.json 格式错误'
        : `解析失败: ${error.message}`
    }
  }
}

/**
 * 验证 manifest.json 内容
 */
export const validateManifest = (manifest) => {
  const errors = []

  // 检查必填字段
  for (const field of MANIFEST_SCHEMA.required) {
    if (!manifest[field]) {
      errors.push(`缺少必填字段: ${field}`)
    }
  }

  // 检查字段类型
  for (const [field, expectedType] of Object.entries(MANIFEST_SCHEMA.types)) {
    if (manifest[field]) {
      const actualType = Array.isArray(manifest[field]) ? 'array' : typeof manifest[field]
      if (actualType !== expectedType) {
        errors.push(`字段 ${field} 类型错误，期望 ${expectedType}，实际 ${actualType}`)
      }
    }
  }

  // 验证版本号
  if (manifest.version && !validateVersion(manifest.version)) {
    errors.push('版本号格式错误，应符合语义化版本规范 (如 1.0.0)')
  }

  // 验证分类
  if (manifest.category) {
    const categoryResult = validateCategory(manifest.category)
    if (!categoryResult.valid) {
      errors.push(categoryResult.error)
    }
  }

  // 验证标签
  if (manifest.tags) {
    const tagsResult = validateTags(manifest.tags)
    if (!tagsResult.valid) {
      errors.push(tagsResult.error)
    }
  }

  // 验证权限
  if (manifest.permissions) {
    const permResult = validatePermissions(manifest.permissions)
    if (!permResult.valid) {
      errors.push(permResult.error)
    }
  }

  // 验证依赖
  if (manifest.dependencies) {
    const depResult = validateDependencies(manifest.dependencies)
    if (!depResult.valid) {
      errors.push(depResult.error)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest
  }
}

/**
 * 验证 Skill/MCP 包的文件结构（宽松版本）
 */
const validateResourceFileStructure = (files, resourceType) => {
  const errors = []
  const warnings = []

  const requiredFiles = ['manifest.json']

  const recommendedFiles = resourceType === 'skill'
    ? ['README.md', 'skill.js', 'skill.ts', 'index.js', 'index.ts']
    : ['README.md', 'server.js', 'server.ts', 'index.js', 'index.ts']

  for (const required of requiredFiles) {
    const found = files.some(f => f === required || f.endsWith('/' + required))
    if (!found) {
      errors.push(`缺少必需文件: ${required}`)
    }
  }

  const hasRecommended = recommendedFiles.some(r => files.some(f => f === r || f.endsWith('/' + r)))
  if (!hasRecommended) {
    warnings.push(`建议添加入口文件: ${recommendedFiles.join(' 或 ')}`)
  }

  return { errors, warnings }
}

/**
 * 验证 Skill/MCP 包（宽松的 manifest 验证）
 */
export const validateResourcePackage = (zipPath, resourceType = 'skill') => {
  const allErrors = []
  const allWarnings = []

  const extractResult = extractManifest(zipPath)
  if (!extractResult.success) {
    return { valid: false, errors: [extractResult.error], warnings: [] }
  }

  // 只验证基本字段
  const manifest = extractResult.manifest
  if (!manifest.name) allErrors.push('缺少必填字段: name')
  if (!manifest.version) allErrors.push('缺少必填字段: version')
  if (!manifest.description) allErrors.push('缺少必填字段: description')

  if (manifest.version && !validateVersion(manifest.version)) {
    allErrors.push('版本号格式错误，应符合语义化版本规范 (如 1.0.0)')
  }

  const structureResult = validateResourceFileStructure(extractResult.files, resourceType)
  allErrors.push(...structureResult.errors)
  allWarnings.push(...structureResult.warnings)

  const securityResult = validateFileSecurity(extractResult.files)
  allErrors.push(...securityResult.errors)
  allWarnings.push(...securityResult.warnings)

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    manifest: extractResult.manifest,
    files: extractResult.files
  }
}

/**
 * 完整验证 Agent 包
 */
export const validateAgentPackage = (zipPath) => {
  const allErrors = []
  const allWarnings = []

  // 1. 提取 manifest.json
  const extractResult = extractManifest(zipPath)
  if (!extractResult.success) {
    return {
      valid: false,
      errors: [extractResult.error],
      warnings: []
    }
  }

  // 2. 验证 manifest.json 内容
  const validateResult = validateManifest(extractResult.manifest)
  allErrors.push(...validateResult.errors)

  // 3. 验证文件结构
  const structureResult = validateFileStructure(extractResult.files)
  allErrors.push(...structureResult.errors)
  allWarnings.push(...structureResult.warnings)

  // 4. 验证文件安全性
  const securityResult = validateFileSecurity(extractResult.files)
  allErrors.push(...securityResult.errors)
  allWarnings.push(...securityResult.warnings)

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    manifest: extractResult.manifest,
    files: extractResult.files
  }
}
