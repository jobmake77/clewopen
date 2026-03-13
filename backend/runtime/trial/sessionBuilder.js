import fs from 'fs/promises'
import path from 'path'
import { extractAgentFiles, resolveAgentPackagePath } from '../../utils/agentPackageReader.js'

export async function buildSessionWorkspace(agent, workspacePath) {
  const files = await extractAgentFiles(agent.package_url)
  const agentDir = path.join(workspacePath, 'agent')
  const stateDir = path.join(workspacePath, 'state')
  const artifactsDir = path.join(workspacePath, 'artifacts')

  const writes = [
    ['manifest.json', JSON.stringify(agent.manifest || {}, null, 2)],
    ['IDENTITY.md', files.identity || ''],
    ['RULES.md', files.rules || ''],
    ['MEMORY.md', files.memory || ''],
    ['TOOLS.md', files.tools || ''],
    ['README.md', files.readme || ''],
  ]

  await Promise.all(
    writes.map(([name, content]) => fs.writeFile(path.join(agentDir, name), content, 'utf8'))
  )

  await fs.copyFile(
    resolveAgentPackagePath(agent.package_url),
    path.join(artifactsDir, 'agent-package.zip')
  )

  await fs.writeFile(
    path.join(stateDir, 'conversation.json'),
    JSON.stringify({ messages: [] }, null, 2),
    'utf8'
  )

  return files
}

export async function loadSessionWorkspaceFiles(workspacePath) {
  const agentDir = path.join(workspacePath, 'agent')
  const read = async (fileName) => {
    try {
      return await fs.readFile(path.join(agentDir, fileName), 'utf8')
    } catch {
      return ''
    }
  }

  return {
    identity: await read('IDENTITY.md'),
    rules: await read('RULES.md'),
    memory: await read('MEMORY.md'),
    tools: await read('TOOLS.md'),
    readme: await read('README.md'),
  }
}
