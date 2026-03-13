import fs from 'fs/promises'
import path from 'path'
import { getTrialRuntimeConfig } from '../config.js'

async function ensureRootDir() {
  await fs.mkdir(getTrialWorkspaceRoot(), { recursive: true })
}

async function ensureWorkspaceDirs(workspacePath) {
  await fs.mkdir(path.join(workspacePath, 'agent'), { recursive: true })
  await fs.mkdir(path.join(workspacePath, 'state'), { recursive: true })
  await fs.mkdir(path.join(workspacePath, 'logs'), { recursive: true })
  await fs.mkdir(path.join(workspacePath, 'artifacts'), { recursive: true })
}

export async function createLocalWorkspace(sessionId) {
  await ensureRootDir()
  const workspacePath = path.join(getTrialWorkspaceRoot(), sessionId)

  await ensureWorkspaceDirs(workspacePath)

  return {
    type: 'prompt',
    sandboxRef: `local:${sessionId}`,
    workspacePath,
  }
}

export async function destroyLocalWorkspace(workspacePath) {
  if (!workspacePath) return
  await fs.rm(workspacePath, { recursive: true, force: true })
}

export function getTrialWorkspaceRoot() {
  return getTrialRuntimeConfig().workspaceRoot
}
