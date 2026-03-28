import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const DEFAULT_ROOT_DIR = path.join(os.tmpdir(), 'openclew', 'trial-sessions')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_POOL_ROOT_DIR = path.resolve(__dirname, '../../.trial-runtime/trial-pool')

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

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeIdentifier(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function resolvePoolNamespace() {
  return normalizeIdentifier(
    process.env.TRIAL_POOL_NAMESPACE || `${os.hostname()}-${process.env.PORT || 'default'}`,
    'default'
  )
}

export function getTrialRuntimeConfig() {
  const poolNamespace = resolvePoolNamespace()
  const poolSize = parsePositiveInt(process.env.TRIAL_POOL_SIZE, 1)
  const poolPrewarmGateway = parseBoolean(process.env.TRIAL_POOL_PREWARM_GATEWAY, false)
  const poolGatewayHotSize = Math.max(
    0,
    Math.min(
      poolSize,
      process.env.TRIAL_POOL_GATEWAY_HOT_SIZE === undefined ||
        process.env.TRIAL_POOL_GATEWAY_HOT_SIZE === null ||
        process.env.TRIAL_POOL_GATEWAY_HOT_SIZE === ''
        ? poolPrewarmGateway
          ? poolSize
          : 0
        : parseNonNegativeInt(process.env.TRIAL_POOL_GATEWAY_HOT_SIZE, 0)
    )
  )

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
    mountLocalRuntimeFiles: parseBoolean(
      process.env.TRIAL_SANDBOX_MOUNT_LOCAL_RUNTIME,
      process.env.NODE_ENV !== 'production'
    ),
    execTimeoutMs: parsePositiveInt(process.env.TRIAL_SANDBOX_EXEC_TIMEOUT_MS, 180000),
    installCommand:
      process.env.TRIAL_SANDBOX_INSTALL_COMMAND || '/opt/openclew/bin/session-runner.sh install',
    prewarmCommand:
      process.env.TRIAL_SANDBOX_PREWARM_COMMAND ||
      '/opt/openclew/bin/session-runner.sh prewarm-gateway',
    runCommand:
      process.env.TRIAL_SANDBOX_RUN_COMMAND || '/opt/openclew/bin/session-runner.sh run',
    openclawNodeOptions:
      process.env.TRIAL_OPENCLAW_NODE_OPTIONS || '--max-old-space-size=1024',
    openclawGatewayPort: parsePositiveInt(process.env.TRIAL_OPENCLAW_GATEWAY_PORT, 19003),
    openclawGatewayStartupTimeoutSeconds: parsePositiveInt(
      process.env.TRIAL_OPENCLAW_GATEWAY_STARTUP_TIMEOUT_SECONDS,
      60
    ),
    openclawThinkingLevel: process.env.TRIAL_OPENCLAW_THINKING_LEVEL || '',
    openclawVerbose: process.env.TRIAL_OPENCLAW_VERBOSE || 'on',
    shell: process.env.TRIAL_SANDBOX_SHELL || '/bin/sh',
    dockerBin: process.env.TRIAL_SANDBOX_DOCKER_BIN || '/usr/local/bin/docker',
    dockerHelperPath:
      process.env.TRIAL_SANDBOX_DOCKER_HELPER_PATH ||
      '/Applications/Docker.app/Contents/Resources/bin',
    baseImage: process.env.TRIAL_SANDBOX_BASE_IMAGE || 'node:22-bookworm-slim',
    openclewInstallCommand: process.env.OPENCLEW_INSTALL_COMMAND || '',
    poolEnabled: parseBoolean(process.env.TRIAL_POOL_ENABLED, false),
    poolSize,
    poolAcquireTimeoutMs: parsePositiveInt(process.env.TRIAL_POOL_ACQUIRE_TIMEOUT_MS, 15000),
    poolMaintenanceIntervalMs: parsePositiveInt(
      process.env.TRIAL_POOL_MAINTENANCE_INTERVAL_MS,
      10000
    ),
    poolBootstrapConcurrency: parsePositiveInt(
      process.env.TRIAL_POOL_BOOTSTRAP_CONCURRENCY,
      2
    ),
    poolPrewarmGateway,
    poolGatewayHotSize,
    poolBrokenRetryBaseMs: parsePositiveInt(process.env.TRIAL_POOL_BROKEN_RETRY_BASE_MS, 15000),
    poolBrokenRetryMaxMs: parsePositiveInt(process.env.TRIAL_POOL_BROKEN_RETRY_MAX_MS, 120000),
    poolRecycleAfterSessions: parsePositiveInt(
      process.env.TRIAL_POOL_RECYCLE_AFTER_SESSIONS,
      30
    ),
    poolNamespace,
    poolWorkspaceRoot: path.join(
      process.env.TRIAL_POOL_WORKSPACE_ROOT || DEFAULT_POOL_ROOT_DIR,
      poolNamespace
    ),
  }
}
