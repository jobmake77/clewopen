import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { getTrialRuntimeConfig } from '../config.js'
import { runDockerCommand, runDockerCommandQuietly } from './dockerCli.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LOCAL_TRIAL_DOCKER_DIR = path.resolve(__dirname, '../docker')

function getWorkspacePaths(workspaceId, rootDir) {
  return {
    workspacePath: path.join(rootDir, workspaceId),
    agentPath: path.join(rootDir, workspaceId, 'agent'),
    statePath: path.join(rootDir, workspaceId, 'state'),
    logsPath: path.join(rootDir, workspaceId, 'logs'),
    artifactsPath: path.join(rootDir, workspaceId, 'artifacts'),
  }
}

function getContainerName(workspaceId) {
  return `openclew-trial-${workspaceId}`
}

function getPoolContainerName(slotId, namespace = getTrialRuntimeConfig().poolNamespace) {
  return `openclew-trial-pool-${namespace}-${slotId}`
}

function getWorkspaceIdFromContainerName(containerName) {
  if (!containerName) return ''
  return String(containerName)
    .replace(/^openclew-trial-pool-/, '')
    .replace(/^openclew-trial-/, '')
}

function getTrialContainerName(sessionId) {
  return `openclew-trial-${sessionId}`
}

function buildDockerLabels(sessionId, options = {}) {
  const labels = []

  if (options.cleanupManaged !== false) {
    labels.push(['openclew.trial', 'true'])
    labels.push(['openclew.session_id', sessionId])
  }

  for (const [key, value] of Object.entries(options.labels || {})) {
    if (value === undefined || value === null || value === '') continue
    labels.push([key, String(value)])
  }

  return labels
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function syncLocalRuntimeFiles(containerName) {
  const sessionRunnerPath = path.join(LOCAL_TRIAL_DOCKER_DIR, 'session-runner.sh')
  const templateWorkspacePath = path.join(LOCAL_TRIAL_DOCKER_DIR, 'template', 'workspace')
  const templateHomePath = path.join(LOCAL_TRIAL_DOCKER_DIR, 'template', 'home')

  if (await pathExists(sessionRunnerPath)) {
    await runDockerCommand(
      ['cp', sessionRunnerPath, `${containerName}:/opt/openclew/bin/session-runner.sh`],
      { timeoutMs: 30000 }
    )
  }

  if (await pathExists(templateWorkspacePath)) {
    await runDockerCommand(
      ['cp', `${templateWorkspacePath}${path.sep}.`, `${containerName}:/opt/openclew/template/workspace`],
      { timeoutMs: 30000 }
    )
  }

  if (await pathExists(templateHomePath)) {
    await runDockerCommand(
      ['cp', `${templateHomePath}${path.sep}.`, `${containerName}:/opt/openclew/template/home`],
      { timeoutMs: 30000 }
    )
  }

  await runDockerCommand(
    ['exec', containerName, '/bin/sh', '-lc', 'chmod +x /opt/openclew/bin/session-runner.sh'],
    { timeoutMs: 30000 }
  )
}

async function buildDockerCreateArgs(workspaceId, rootDir, options = {}) {
  const config = getTrialRuntimeConfig()
  const containerName = options.containerName || getContainerName(workspaceId)
  const paths = getWorkspacePaths(workspaceId, rootDir)
  const labelId = options.labelId || workspaceId
  const labelArgs = buildDockerLabels(labelId, options).flatMap(([key, value]) => [
    '--label',
    `${key}=${value}`,
  ])
  const args = [
    'create',
    '--name',
    containerName,
    ...labelArgs,
    '--workdir',
    config.workspaceMountPath,
    '--memory',
    config.memory,
    '--cpus',
    config.cpus,
    '--pids-limit',
    config.pidsLimit,
    '--network',
    config.network,
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--mount',
    `type=bind,src=${paths.workspacePath},dst=${config.workspaceMountPath}`,
  ]

  if (config.readonlyRootfs) {
    args.push('--read-only')
  }

  args.push(config.containerImage, 'sleep', 'infinity')

  return {
    args,
    containerName,
    paths,
  }
}

async function ensureWorkspaceDirectories(paths) {
  await fs.mkdir(paths.agentPath, { recursive: true })
  await fs.mkdir(paths.statePath, { recursive: true })
  await fs.mkdir(paths.logsPath, { recursive: true })
  await fs.mkdir(paths.artifactsPath, { recursive: true })
}

function isMissingBindMountPathError(error) {
  return String(error?.message || '').includes('bind source path does not exist')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function createManagedContainerWorkspace(workspaceId, rootDir, options = {}) {
  const config = getTrialRuntimeConfig()
  const { args, containerName } = await buildDockerCreateArgs(
    workspaceId,
    rootDir,
    options
  )
  const paths = getWorkspacePaths(workspaceId, rootDir)

  await ensureWorkspaceDirectories(paths)

  await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })

  try {
    let lastCreateError = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await ensureWorkspaceDirectories(paths)
        await runDockerCommand(args, { timeoutMs: 60000 })
        lastCreateError = null
        break
      } catch (error) {
        lastCreateError = error

        if (!isMissingBindMountPathError(error) || attempt === 3) {
          throw error
        }

        await sleep(250 * attempt)
      }
    }

    if (lastCreateError) {
      throw lastCreateError
    }

    await runDockerCommand(['start', containerName], { timeoutMs: 60000 })
    if (config.mountLocalRuntimeFiles) {
      await syncLocalRuntimeFiles(containerName)
    }
  } catch (error) {
    await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })
    throw error
  }

  return {
    type: 'container',
    sandboxRef: `docker:${containerName}`,
    workspacePath: paths.workspacePath,
    containerName,
  }
}

export async function createContainerWorkspace(sessionId, options = {}) {
  const config = getTrialRuntimeConfig()
  return createManagedContainerWorkspace(sessionId, config.workspaceRoot, {
    ...options,
    containerName: options.containerName || getTrialContainerName(sessionId),
    labelId: sessionId,
  })
}

export async function createPoolContainerWorkspace(slotId, options = {}) {
  const config = getTrialRuntimeConfig()
  return createManagedContainerWorkspace(slotId, config.poolWorkspaceRoot, {
    ...options,
    cleanupManaged: false,
    containerName: options.containerName || getPoolContainerName(slotId, config.poolNamespace),
    labels: {
      'openclew.pool': 'true',
      'openclew.pool_namespace': config.poolNamespace,
      'openclew.pool_slot_id': slotId,
      ...(options.labels || {}),
    },
  })
}

export function getContainerNameFromSession(session) {
  if (!session?.sandbox_ref || typeof session.sandbox_ref !== 'string') {
    return null
  }
  if (!session.sandbox_ref.startsWith('docker:')) {
    return null
  }
  return session.sandbox_ref.slice('docker:'.length)
}

async function removeWorkspacePath(workspacePath) {
  if (!workspacePath) return
  await fs.rm(workspacePath, { recursive: true, force: true })
}

export async function destroyContainerWorkspace(session) {
  const containerName = getContainerNameFromSession(session)
  if (containerName) {
    await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })
  }

  await removeWorkspacePath(session?.workspace_path)
}

export async function destroyPoolContainerWorkspace(slotId, workspacePath) {
  const config = getTrialRuntimeConfig()
  const containerName = getPoolContainerName(slotId, config.poolNamespace)
  await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })
  if (workspacePath) {
    await removeWorkspacePath(workspacePath)
    return
  }

  await removeWorkspacePath(path.join(config.poolWorkspaceRoot, slotId))
}

async function emptyDirectory(targetPath) {
  try {
    const entries = await fs.readdir(targetPath)
    await Promise.all(
      entries.map((entry) => fs.rm(path.join(targetPath, entry), { recursive: true, force: true }))
    )
  } catch {
    await fs.mkdir(targetPath, { recursive: true })
  }
}

export async function resetSessionWorkspaceFiles(workspacePath) {
  if (!workspacePath) return

  const agentPath = path.join(workspacePath, 'agent')
  const artifactsPath = path.join(workspacePath, 'artifacts')
  const logsPath = path.join(workspacePath, 'logs')
  const statePath = path.join(workspacePath, 'state')

  await emptyDirectory(agentPath)
  await emptyDirectory(artifactsPath)

  await fs.mkdir(logsPath, { recursive: true })
  try {
    const logEntries = await fs.readdir(logsPath)
    await Promise.all(
      logEntries
        .filter((entry) => entry !== 'gateway.log')
        .map((entry) => fs.rm(path.join(logsPath, entry), { recursive: true, force: true }))
    )
  } catch {
    // noop
  }

  await fs.mkdir(statePath, { recursive: true })
  try {
    const stateEntries = await fs.readdir(statePath)
    await Promise.all(
      stateEntries
        .filter((entry) => entry !== 'openclaw')
        .map((entry) => fs.rm(path.join(statePath, entry), { recursive: true, force: true }))
    )
  } catch {
    // noop
  }
}

export function getPoolContainerNameFromSlotId(slotId) {
  const config = getTrialRuntimeConfig()
  return getPoolContainerName(slotId, config.poolNamespace)
}

export function getPoolWorkspacePath(slotId) {
  const config = getTrialRuntimeConfig()
  return path.join(config.poolWorkspaceRoot, slotId)
}

export function getPoolSlotIdFromContainerName(containerName) {
  const prefix = `openclew-trial-pool-${getTrialRuntimeConfig().poolNamespace}-`
  if (!containerName?.startsWith(prefix)) {
    return null
  }
  return String(containerName).slice(prefix.length)
}

export async function cleanupOrphanedTrialContainers(activeSessionIds = []) {
  const result = await runDockerCommandQuietly(
    [
      'ps',
      '-a',
      '--filter',
      'label=openclew.trial=true',
      '--format',
      '{{.ID}}|{{.Names}}|{{.Label "openclew.session_id"}}',
    ],
    { ignoreExitCodes: [1], timeoutMs: 30000 }
  )

  const activeSet = new Set(activeSessionIds)
  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const [, containerName, sessionId] = line.split('|')
    if (!sessionId || activeSet.has(sessionId)) {
      continue
    }
    await runDockerCommandQuietly(['rm', '-f', containerName], {
      ignoreExitCodes: [1],
      timeoutMs: 30000,
    })
  }
}
