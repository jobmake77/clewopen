import fs from 'fs/promises'
import path from 'path'
import { getTrialRuntimeConfig } from '../config.js'
import { runDockerCommand, runDockerCommandQuietly } from './dockerCli.js'

function getWorkspacePaths(sessionId, rootDir) {
  return {
    workspacePath: path.join(rootDir, sessionId),
    agentPath: path.join(rootDir, sessionId, 'agent'),
    statePath: path.join(rootDir, sessionId, 'state'),
    logsPath: path.join(rootDir, sessionId, 'logs'),
    artifactsPath: path.join(rootDir, sessionId, 'artifacts'),
  }
}

function getContainerName(sessionId) {
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

function buildDockerCreateArgs(sessionId, workspacePath, options = {}) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerName(sessionId)
  const paths = getWorkspacePaths(sessionId, config.workspaceRoot)
  const labelArgs = buildDockerLabels(sessionId, options).flatMap(([key, value]) => [
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
    `type=bind,src=${paths.agentPath},dst=${config.workspaceMountPath}/agent,readonly`,
    '--mount',
    `type=bind,src=${paths.artifactsPath},dst=${config.workspaceMountPath}/artifacts,readonly`,
    '--mount',
    `type=bind,src=${paths.statePath},dst=${config.workspaceMountPath}/state`,
    '--mount',
    `type=bind,src=${paths.logsPath},dst=${config.workspaceMountPath}/logs`,
  ]

  if (config.readonlyRootfs) {
    args.push('--read-only')
  }

  args.push(config.containerImage, 'sleep', 'infinity')

  return {
    args,
    containerName,
  }
}

export async function createContainerWorkspace(sessionId, options = {}) {
  const config = getTrialRuntimeConfig()
  const paths = getWorkspacePaths(sessionId, config.workspaceRoot)

  await fs.mkdir(paths.agentPath, { recursive: true })
  await fs.mkdir(paths.statePath, { recursive: true })
  await fs.mkdir(paths.logsPath, { recursive: true })
  await fs.mkdir(paths.artifactsPath, { recursive: true })

  const { args, containerName } = buildDockerCreateArgs(sessionId, paths.workspacePath, options)

  await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })

  try {
    await runDockerCommand(args, { timeoutMs: 60000 })
    await runDockerCommand(['start', containerName], { timeoutMs: 60000 })
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

export function getContainerNameFromSession(session) {
  if (!session?.sandbox_ref || typeof session.sandbox_ref !== 'string') {
    return null
  }
  if (!session.sandbox_ref.startsWith('docker:')) {
    return null
  }
  return session.sandbox_ref.slice('docker:'.length)
}

export async function destroyContainerWorkspace(session) {
  const containerName = getContainerNameFromSession(session)
  if (containerName) {
    await runDockerCommandQuietly(['rm', '-f', containerName], { ignoreExitCodes: [1] })
  }

  if (session?.workspace_path) {
    await fs.rm(session.workspace_path, { recursive: true, force: true })
  }
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
