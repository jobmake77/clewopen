import os from 'os'
import path from 'path'

const DEFAULT_ROOT_DIR = path.join(os.tmpdir(), 'openclew', 'trial-sessions')

function normalizeRuntimeMode(value) {
  return value === 'container' ? 'container' : 'prompt'
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getTrialRuntimeConfig() {
  return {
    mode: normalizeRuntimeMode(process.env.TRIAL_RUNTIME_MODE),
    workspaceRoot: process.env.TRIAL_WORKSPACE_ROOT || DEFAULT_ROOT_DIR,
    containerImage: process.env.TRIAL_SANDBOX_IMAGE || 'openclew/trial-base:latest',
    workspaceMountPath: process.env.TRIAL_SANDBOX_MOUNT_PATH || '/workspace',
    network: process.env.TRIAL_SANDBOX_NETWORK || 'bridge',
    memory: process.env.TRIAL_SANDBOX_MEMORY || '1536m',
    cpus: process.env.TRIAL_SANDBOX_CPUS || '1',
    pidsLimit: process.env.TRIAL_SANDBOX_PIDS_LIMIT || '256',
    readonlyRootfs: parseBoolean(process.env.TRIAL_SANDBOX_READONLY_ROOTFS, false),
    keepFailedSessions: parseBoolean(process.env.TRIAL_SANDBOX_KEEP_FAILED_SESSIONS, false),
    execTimeoutMs: parsePositiveInt(process.env.TRIAL_SANDBOX_EXEC_TIMEOUT_MS, 180000),
    installCommand:
      process.env.TRIAL_SANDBOX_INSTALL_COMMAND || '/opt/openclew/bin/session-runner.sh install',
    runCommand:
      process.env.TRIAL_SANDBOX_RUN_COMMAND || '/opt/openclew/bin/session-runner.sh run',
    openclawNodeOptions:
      process.env.TRIAL_OPENCLAW_NODE_OPTIONS || '--max-old-space-size=1024',
    shell: process.env.TRIAL_SANDBOX_SHELL || '/bin/sh',
    dockerBin: process.env.TRIAL_SANDBOX_DOCKER_BIN || '/usr/local/bin/docker',
    dockerHelperPath:
      process.env.TRIAL_SANDBOX_DOCKER_HELPER_PATH ||
      '/Applications/Docker.app/Contents/Resources/bin',
    baseImage: process.env.TRIAL_SANDBOX_BASE_IMAGE || 'node:22-bookworm-slim',
    openclewInstallCommand: process.env.OPENCLEW_INSTALL_COMMAND || '',
  }
}
