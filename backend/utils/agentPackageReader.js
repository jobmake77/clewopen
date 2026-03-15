import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FILE_MAP = {
  identity: ['agent/IDENTITY.md', 'IDENTITY.md'],
  rules: ['agent/RULES.md', 'RULES.md'],
  memory: ['agent/MEMORY.md', 'MEMORY.md'],
  tools: ['agent/TOOLS.md', 'TOOLS.md'],
  readme: ['README.md'],
}

function createAgentPackageError(message, statusCode = 422, code = 'agent_package_invalid') {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

export function resolveAgentPackagePath(packageUrl) {
  const backendRoot = path.resolve(__dirname, '..')
  return path.join(backendRoot, packageUrl)
}

function openAgentZip(filePath) {
  try {
    return new AdmZip(filePath)
  } catch (error) {
    throw createAgentPackageError(
      'Agent 包不是有效的 zip 文件，暂时无法预览或试用，请联系管理员重新上传。',
      422,
      'agent_package_invalid_zip'
    )
  }
}

/**
 * 从 Agent 包 URL 中提取配置文件内容
 * @param {string} packageUrl - 相对路径，如 /uploads/agents/xxx.zip
 * @returns {{ identity, rules, memory, tools, readme }} 各文件的文本内容（不存在则为 null）
 */
export async function extractAgentFiles(packageUrl) {
  const filePath = resolveAgentPackagePath(packageUrl)

  try {
    await fs.access(filePath)
  } catch {
    throw createAgentPackageError(
      'Agent 包文件不存在，暂时无法预览或试用。',
      404,
      'agent_package_missing'
    )
  }

  const zip = openAgentZip(filePath)
  const entries = zip.getEntries()

  const result = {}

  for (const [key, candidates] of Object.entries(FILE_MAP)) {
    for (const candidate of candidates) {
      const entry = entries.find(
        (e) => e.entryName === candidate || e.entryName.endsWith('/' + candidate)
      )
      if (entry) {
        result[key] = entry.getData().toString('utf8')
        break
      }
    }
    if (!result[key]) {
      result[key] = null
    }
  }

  return result
}

export async function ensureAgentPackageUsable(packageUrl) {
  await extractAgentFiles(packageUrl)
  return true
}
