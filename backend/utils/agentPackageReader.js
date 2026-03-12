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

/**
 * 从 Agent 包 URL 中提取配置文件内容
 * @param {string} packageUrl - 相对路径，如 /uploads/agents/xxx.zip
 * @returns {{ identity, rules, memory, tools, readme }} 各文件的文本内容（不存在则为 null）
 */
export async function extractAgentFiles(packageUrl) {
  const backendRoot = path.resolve(__dirname, '..')
  const filePath = path.join(backendRoot, packageUrl)

  await fs.access(filePath) // throws if file doesn't exist

  const zip = new AdmZip(filePath)
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
