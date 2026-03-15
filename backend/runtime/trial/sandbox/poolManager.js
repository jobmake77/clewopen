import fs from 'fs/promises'
import path from 'path'
import TrialSessionModel from '../../../models/TrialSession.js'
import {
  installSessionAgent,
  prewarmSessionGateway,
} from '../containerRunner.js'
import { getTrialRuntimeConfig } from '../config.js'
import { logger } from '../../../config/logger.js'
import {
  createPoolContainerWorkspace,
  destroyPoolContainerWorkspace,
  getPoolContainerNameFromSlotId,
  getPoolWorkspacePath,
  listPoolContainerStatuses,
  resetSessionWorkspaceFiles,
} from './containerWorkspace.js'

const ACTIVE_TRIAL_SESSION_STATUSES = new Set(['provisioning', 'active'])
const MAX_POOL_EVENTS = 200
const SLOT_LOG_FILES = {
  install: 'install.log',
  execution: 'execution.log',
  gateway: 'gateway.log',
}
const DEFAULT_SLOT_LOG_MAX_BYTES = 64 * 1024

const slots = new Map()
let maintenanceTimer = null
let maintenancePromise = null
const poolEvents = []
let nextPoolEventId = 1
const poolMetrics = {
  startedAt: null,
  maintenanceRuns: 0,
  warmHits: 0,
  coldFallbacks: 0,
  leases: 0,
  releases: 0,
  slotWarmups: 0,
  slotResets: 0,
  slotRecycles: 0,
  slotRecoveries: 0,
  slotErrors: 0,
  slotDrains: 0,
  slotScaleDowns: 0,
  staleLeaseReclaims: 0,
  brokenRetries: 0,
  slotAnomalies: 0,
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nowIso() {
  return new Date().toISOString()
}

function pushPoolEvent(type, detail = {}) {
  poolEvents.unshift({
    id: `pool-event-${nextPoolEventId++}`,
    type,
    at: nowIso(),
    detail,
  })

  if (poolEvents.length > MAX_POOL_EVENTS) {
    poolEvents.length = MAX_POOL_EVENTS
  }
}

function incrementMetric(name, amount = 1) {
  poolMetrics[name] = Number(poolMetrics[name] || 0) + amount
}

function createPoolManagerError(message, statusCode = 400, code = 'trial_pool_error') {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function isPoolEnabled() {
  const config = getTrialRuntimeConfig()
  return config.mode === 'container' && config.poolEnabled && config.poolSize > 0
}

function buildSlotId(index) {
  return `slot-${String(index).padStart(2, '0')}`
}

function normalizeRuntimeAgentId(value) {
  const normalized = String(value || 'pool-slot')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `trial-${normalized || 'pool-slot'}`
}

function getDesiredSlotIds() {
  const config = getTrialRuntimeConfig()
  return Array.from({ length: config.poolSize }, (_, index) => buildSlotId(index + 1))
}

function getManagedSlot(slotId) {
  const normalizedSlotId = String(slotId || '').trim()
  if (!normalizedSlotId) {
    throw createPoolManagerError('缺少有效的 slotId。', 400, 'invalid_slot_id')
  }

  const desiredSlotIds = new Set(getDesiredSlotIds())
  if (!desiredSlotIds.has(normalizedSlotId) && !slots.has(normalizedSlotId)) {
    throw createPoolManagerError(`未找到 warm pool slot: ${normalizedSlotId}`, 404, 'slot_not_found')
  }

  return getOrCreateSlot(normalizedSlotId)
}

function setSlotState(slot, nextState, reason = null) {
  if (slot.state === nextState && slot.lastStateReason === reason) {
    return
  }

  slot.state = nextState
  slot.lastStateChangedAt = nowIso()
  slot.lastStateReason = reason || null
}

function setSlotIssue(slot, code, message, detail = {}) {
  if (!code || !message) {
    return
  }

  if (slot.activeIssueCode === code && slot.activeIssueMessage === message) {
    return
  }

  slot.activeIssueCode = code
  slot.activeIssueMessage = message
  slot.activeIssueAt = nowIso()
  incrementMetric('slotAnomalies')
  pushPoolEvent('slot-anomaly', {
    slotId: slot.id,
    namespace: slot.namespace,
    containerName: slot.containerName,
    issueCode: code,
    message,
    ...detail,
  })
}

function clearSlotIssue(slot, options = {}) {
  if (!slot.activeIssueCode && !slot.activeIssueMessage) {
    return
  }

  if (options.onlyCodes && !options.onlyCodes.includes(slot.activeIssueCode)) {
    return
  }

  slot.activeIssueCode = null
  slot.activeIssueMessage = null
  slot.activeIssueAt = null
}

function getOrCreateSlot(slotId) {
  const config = getTrialRuntimeConfig()
  if (!slots.has(slotId)) {
    slots.set(slotId, {
      id: slotId,
      namespace: config.poolNamespace,
      state: 'pending',
      containerName: getPoolContainerNameFromSlotId(slotId),
      workspacePath: null,
      leasedSessionId: null,
      runtimeAgentId: normalizeRuntimeAgentId(slotId),
      useCount: 0,
      totalLeaseCount: 0,
      totalSessionsServed: 0,
      task: null,
      lastError: null,
      lastWarmedAt: null,
      lastLeasedAt: null,
      lastReleasedAt: null,
      leaseAcquiredAt: null,
      leaseStatus: null,
      leaseExpiresAt: null,
      gatewayWarmup: null,
      containerState: 'missing',
      containerStatus: '',
      consecutiveFailures: 0,
      recoveryAttempts: 0,
      lastFailureAt: null,
      brokenUntil: null,
      lastDrainReason: null,
      lastStateChangedAt: nowIso(),
      lastStateReason: 'created',
      activeIssueCode: null,
      activeIssueMessage: null,
      activeIssueAt: null,
    })
  }

  return slots.get(slotId)
}

function getPoolInfo(session) {
  return session?.metadata?.sandbox?.pool || session?.sandbox_pool || null
}

function buildSlotSnapshot(slot) {
  return {
    id: slot.id,
    state: slot.state,
    leasedSessionId: slot.leasedSessionId,
    useCount: slot.useCount,
    totalLeaseCount: slot.totalLeaseCount,
    totalSessionsServed: slot.totalSessionsServed,
    namespace: slot.namespace,
    containerName: slot.containerName,
    containerState: slot.containerState,
    containerStatus: slot.containerStatus,
    workspacePath: slot.workspacePath,
    runtimeAgentId: slot.runtimeAgentId,
    gatewayWarmup: slot.gatewayWarmup || null,
    lastError: slot.lastError || null,
    lastWarmedAt: slot.lastWarmedAt || null,
    lastLeasedAt: slot.lastLeasedAt || null,
    lastReleasedAt: slot.lastReleasedAt || null,
    leaseAcquiredAt: slot.leaseAcquiredAt || null,
    leaseStatus: slot.leaseStatus || null,
    leaseExpiresAt: slot.leaseExpiresAt || null,
    consecutiveFailures: Number(slot.consecutiveFailures || 0),
    recoveryAttempts: Number(slot.recoveryAttempts || 0),
    lastFailureAt: slot.lastFailureAt || null,
    brokenUntil: slot.brokenUntil || null,
    lastDrainReason: slot.lastDrainReason || null,
    lastStateChangedAt: slot.lastStateChangedAt || null,
    lastStateReason: slot.lastStateReason || null,
    activeIssueCode: slot.activeIssueCode || null,
    activeIssueMessage: slot.activeIssueMessage || null,
    activeIssueAt: slot.activeIssueAt || null,
    isBusy: Boolean(slot.task),
  }
}

function buildSlotSession(slot, overrides = {}) {
  return {
    id: overrides.id || slot.id,
    agent_id: overrides.agentId || 'trial-pool-slot',
    agent_name: overrides.agentName || `Warm Pool ${slot.id}`,
    agent_description:
      overrides.agentDescription || 'Warm OpenClaw slot kept ready for trial sessions.',
    sandbox_ref: `docker:${slot.containerName}`,
    workspace_path: slot.workspacePath,
    runtime_type: 'container',
    metadata: {
      sandbox: {
        provider: 'container',
        ref: `docker:${slot.containerName}`,
        pool: {
          pooled: true,
          slot_id: slot.id,
          namespace: slot.namespace,
          runtime_agent_id: slot.runtimeAgentId,
        },
      },
    },
  }
}

async function prepareBlankSlot(slot, { poolReuse }) {
  await resetSessionWorkspaceFiles(slot.workspacePath)

  const blankSession = buildSlotSession(slot, {
    id: `${slot.id}-${poolReuse ? 'reset' : 'bootstrap'}`,
  })

  await installSessionAgent(blankSession, {
    poolReuse,
    runtimeAgentId: slot.runtimeAgentId,
  })
}

function computeBrokenRetryDelayMs(slot) {
  const config = getTrialRuntimeConfig()
  const consecutiveFailures = Math.max(1, Number(slot.consecutiveFailures || 1))
  const multiplier = 2 ** Math.max(0, consecutiveFailures - 1)
  return Math.min(
    config.poolBrokenRetryBaseMs * multiplier,
    config.poolBrokenRetryMaxMs
  )
}

function isBrokenBackoffActive(slot, nowMs = Date.now()) {
  if (slot.state !== 'broken' || !slot.brokenUntil) {
    return false
  }

  const retryAtMs = Date.parse(slot.brokenUntil)
  return Number.isFinite(retryAtMs) && retryAtMs > nowMs
}

function markSlotDraining(slot, reason, detail = {}) {
  if (slot.state === 'draining' && slot.lastDrainReason?.reason === reason) {
    return
  }

  slot.lastDrainReason = {
    reason,
    at: nowIso(),
  }
  setSlotState(slot, 'draining', reason)
  incrementMetric('slotDrains')
  pushPoolEvent('slot-draining', {
    slotId: slot.id,
    namespace: slot.namespace,
    containerName: slot.containerName,
    reason,
    ...detail,
  })
}

function ensureSlotCanAcceptAdminAction(slot, actionLabel) {
  if (slot.task) {
    throw createPoolManagerError(
      `Slot ${slot.id} 当前正在执行 ${actionLabel} 以外的任务，请稍后再试。`,
      409,
      'slot_busy'
    )
  }
}

function normalizeAdminReason(action, reason) {
  const normalizedReason = String(reason || '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  return normalizedReason || `admin-${action}`
}

async function readTailFile(filePath, maxBytes = DEFAULT_SLOT_LOG_MAX_BYTES) {
  const stats = await fs.stat(filePath)
  const normalizedMaxBytes =
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
      ? Number(maxBytes)
      : DEFAULT_SLOT_LOG_MAX_BYTES
  const bytesToRead = Math.max(0, Math.min(Number(stats.size || 0), normalizedMaxBytes))

  if (bytesToRead === 0) {
    return {
      sizeBytes: Number(stats.size || 0),
      updatedAt: stats.mtime?.toISOString?.() || null,
      content: '',
      truncated: false,
    }
  }

  const handle = await fs.open(filePath, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const start = Math.max(0, Number(stats.size || 0) - bytesToRead)
    await handle.read(buffer, 0, bytesToRead, start)

    return {
      sizeBytes: Number(stats.size || 0),
      updatedAt: stats.mtime?.toISOString?.() || null,
      content: buffer.toString('utf8'),
      truncated: Number(stats.size || 0) > bytesToRead,
    }
  } finally {
    await handle.close()
  }
}

async function warmFreshSlot(slot) {
  const config = getTrialRuntimeConfig()
  const wasRecovering = slot.state === 'broken' || Number(slot.consecutiveFailures || 0) > 0

  setSlotState(slot, 'creating', 'rebuild-container')
  slot.lastError = null
  slot.lastFailureAt = null
  slot.brokenUntil = null

  await destroyPoolContainerWorkspace(slot.id, slot.workspacePath)

  const workspace = await createPoolContainerWorkspace(slot.id)
  slot.containerName = workspace.containerName
  slot.workspacePath = workspace.workspacePath
  slot.containerState = 'running'
  slot.containerStatus = 'running'

  await prepareBlankSlot(slot, { poolReuse: false })

  let warmup = {
    status: 'skipped',
    duration_ms: 0,
    message: 'Gateway prewarm disabled for warm pool.',
  }

  if (config.poolPrewarmGateway) {
    setSlotState(slot, 'warming', 'gateway-prewarm')
    warmup = await prewarmSessionGateway(buildSlotSession(slot))
    if (warmup.status !== 'ok') {
      throw new Error(
        [warmup.error, warmup.stdout, warmup.stderr].filter(Boolean).join('\n') ||
          'Pool slot gateway warmup failed'
      )
    }
  }

  setSlotState(slot, 'warm', config.poolPrewarmGateway ? 'prewarmed' : 'install-ready')
  slot.lastWarmedAt = nowIso()
  slot.gatewayWarmup = warmup
  slot.consecutiveFailures = 0
  clearSlotIssue(slot)
  incrementMetric('slotWarmups')

  if (wasRecovering) {
    incrementMetric('slotRecoveries')
    pushPoolEvent('slot-recovered', {
      slotId: slot.id,
      namespace: slot.namespace,
      containerName: slot.containerName,
    })
  }

  pushPoolEvent('slot-warmed', {
    slotId: slot.id,
    namespace: slot.namespace,
    containerName: slot.containerName,
    workspacePath: slot.workspacePath,
    gatewayPrewarm: warmup.status,
  })
}

async function recycleSlot(slot, options = {}) {
  const shouldCountRecycle = options.countRecycle !== false
  const recycleReason = options.reason || null

  if (recycleReason) {
    markSlotDraining(slot, recycleReason)
  }

  slot.useCount = 0
  await warmFreshSlot(slot)

  if (shouldCountRecycle) {
    incrementMetric('slotRecycles')
    pushPoolEvent('slot-recycled', {
      slotId: slot.id,
      namespace: slot.namespace,
      containerName: slot.containerName,
      reason: recycleReason || 'rebuild',
    })
  }
}

async function resetLeasedSlot(slot) {
  setSlotState(slot, 'resetting', 'lease-release')
  await prepareBlankSlot(slot, { poolReuse: true })
  setSlotState(slot, 'warm', 'reset-complete')
  slot.lastReleasedAt = nowIso()
  clearSlotIssue(slot, { onlyCodes: ['task-failure', 'container-missing', 'container-not-running'] })
  incrementMetric('slotResets')
  pushPoolEvent('slot-reset', {
    slotId: slot.id,
    namespace: slot.namespace,
    containerName: slot.containerName,
  })
}

function trackSlotTask(slot, runner) {
  if (slot.task) {
    return slot.task
  }

  const stateBeforeTask = slot.state
  slot.task = runner()
    .catch((error) => {
      const consecutiveFailures = Number(slot.consecutiveFailures || 0) + 1
      const retryAfterMs = computeBrokenRetryDelayMs({
        ...slot,
        consecutiveFailures,
      })

      slot.consecutiveFailures = consecutiveFailures
      slot.lastFailureAt = nowIso()
      slot.brokenUntil = new Date(Date.now() + retryAfterMs).toISOString()
      slot.lastError = {
        message: error.message,
        at: nowIso(),
      }
      setSlotState(slot, 'broken', `retry-in-${retryAfterMs}ms`)
      setSlotIssue(slot, 'task-failure', error.message, {
        previousState: stateBeforeTask,
        retryAfterMs,
      })
      incrementMetric('slotErrors')
      pushPoolEvent('slot-error', {
        slotId: slot.id,
        namespace: slot.namespace,
        containerName: slot.containerName,
        message: error.message,
        previousState: stateBeforeTask,
        consecutiveFailures,
        retryAfterMs,
        brokenUntil: slot.brokenUntil,
      })
      logger.warn(`Trial pool slot ${slot.id} failed: ${error.message}`)
      throw error
    })
    .finally(() => {
      slot.task = null
    })

  return slot.task
}

function isSlotEligibleToWarm(slot, nowMs = Date.now()) {
  if (slot.leasedSessionId || slot.task) {
    return false
  }

  if (slot.state === 'warm') {
    return false
  }

  if (isBrokenBackoffActive(slot, nowMs)) {
    return false
  }

  return true
}

async function ensureSlotWarm(slot) {
  if (slot.state === 'warm') {
    return slot
  }

  return trackSlotTask(slot, async () => {
    const wasBroken = slot.state === 'broken'
    if (wasBroken) {
      incrementMetric('brokenRetries')
      slot.recoveryAttempts = Number(slot.recoveryAttempts || 0) + 1
    }

    const shouldCountRecycle = Boolean(slot.lastWarmedAt || Number(slot.useCount || 0) > 0)
    const recycleReason =
      slot.state === 'draining'
        ? slot.lastDrainReason?.reason || 'draining'
        : wasBroken
          ? 'broken-retry'
          : null

    await recycleSlot(slot, { countRecycle: shouldCountRecycle, reason: recycleReason })
    return slot
  })
}

function isSessionLeaseStale(session) {
  if (!session) {
    return {
      stale: true,
      reason: 'session-missing',
    }
  }

  if (!ACTIVE_TRIAL_SESSION_STATUSES.has(session.status)) {
    return {
      stale: true,
      reason: 'session-inactive',
    }
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return {
      stale: true,
      reason: 'session-expired',
    }
  }

  return {
    stale: false,
    reason: null,
  }
}

function applyContainerObservation(slot, observedContainer) {
  slot.containerState = observedContainer?.state || 'missing'
  slot.containerStatus = observedContainer?.status || ''
}

async function reconcileLeasedSlots(sessionHealthById) {
  const leasedSlots = Array.from(slots.values()).filter(
    (slot) => slot.leasedSessionId && !slot.task
  )

  if (leasedSlots.length === 0) {
    return
  }

  const queued = []

  for (const slot of leasedSlots) {
    const session = sessionHealthById.get(slot.leasedSessionId)
    slot.leaseStatus = session?.status || 'missing'
    slot.leaseExpiresAt = session?.expires_at || null

    const leaseHealth = isSessionLeaseStale(session)
    if (!leaseHealth.stale) {
      continue
    }

    const staleSessionId = slot.leasedSessionId
    slot.leasedSessionId = null
    slot.leaseAcquiredAt = null
    incrementMetric('staleLeaseReclaims')
    pushPoolEvent('slot-stale-lease', {
      slotId: slot.id,
      namespace: slot.namespace,
      containerName: slot.containerName,
      staleSessionId,
      staleSessionStatus: session?.status || 'missing',
      staleSessionExpiresAt: session?.expires_at || null,
      reason: leaseHealth.reason,
    })

    queued.push(
      trackSlotTask(slot, async () => {
        await recycleSlot(slot, {
          reason: 'stale-lease',
        })
      }).catch(() => {
        // Failure already recorded by trackSlotTask.
      })
    )
  }

  if (queued.length > 0) {
    await Promise.allSettled(queued)
  }
}

async function reconcileContainerObservations(containerStatusBySlotId) {
  const queued = []

  for (const slot of slots.values()) {
    const observedContainer = containerStatusBySlotId.get(slot.id)
    applyContainerObservation(slot, observedContainer)

    if (observedContainer?.state === 'running') {
      clearSlotIssue(slot, {
        onlyCodes: ['container-missing', 'container-not-running'],
      })
      continue
    }

    if (slot.task || slot.state === 'pending') {
      continue
    }

    if (!observedContainer) {
      setSlotIssue(slot, 'container-missing', 'Warm slot container is missing.', {
        expectedContainerName: slot.containerName,
      })
    } else {
      setSlotIssue(
        slot,
        'container-not-running',
        `Warm slot container is ${observedContainer.state}.`,
        {
          observedState: observedContainer.state,
          observedStatus: observedContainer.status,
        }
      )
    }

    if (slot.leasedSessionId) {
      continue
    }

    if (slot.state === 'warm') {
      markSlotDraining(slot, 'container-observation-mismatch', {
        observedState: observedContainer?.state || 'missing',
      })
    }

    if (isSlotEligibleToWarm(slot)) {
      queued.push(
        ensureSlotWarm(slot).catch(() => {
          // Failure already recorded on the slot.
        })
      )
    }
  }

  if (queued.length > 0) {
    await Promise.allSettled(queued)
  }
}

async function runPoolMaintenance() {
  if (!isPoolEnabled()) {
    return
  }

  incrementMetric('maintenanceRuns')
  const config = getTrialRuntimeConfig()
  const desiredSlotIds = new Set(getDesiredSlotIds())

  for (const slotId of desiredSlotIds) {
    getOrCreateSlot(slotId)
  }

  for (const [slotId, slot] of slots.entries()) {
    if (desiredSlotIds.has(slotId)) {
      continue
    }

    if (slot.leasedSessionId || slot.task) {
      continue
    }

    markSlotDraining(slot, 'scale-down')
    await destroyPoolContainerWorkspace(slot.id, slot.workspacePath)
    incrementMetric('slotScaleDowns')
    pushPoolEvent('slot-scaled-down', {
      slotId: slot.id,
      namespace: slot.namespace,
      containerName: slot.containerName,
    })
    slots.delete(slotId)
  }

  const containerStatuses = await listPoolContainerStatuses().catch((error) => {
    logger.warn(`Failed to inspect trial pool containers: ${error.message}`)
    return null
  })
  const containerStatusBySlotId =
    containerStatuses == null
      ? null
      : new Map(
          containerStatuses
            .filter((item) => item.slotId)
            .map((item) => [item.slotId, item])
        )

  const leasedSessionIds = Array.from(slots.values())
    .map((slot) => slot.leasedSessionId)
    .filter(Boolean)
  const leasedSessions =
    leasedSessionIds.length === 0
      ? []
      : await TrialSessionModel.listLeaseHealth(leasedSessionIds).catch((error) => {
          logger.warn(`Failed to inspect leased trial sessions: ${error.message}`)
          return null
        })
  const sessionHealthById =
    leasedSessions == null ? null : new Map(leasedSessions.map((session) => [session.id, session]))

  if (sessionHealthById) {
    await reconcileLeasedSlots(sessionHealthById)
  }

  if (containerStatusBySlotId) {
    await reconcileContainerObservations(containerStatusBySlotId)
  }

  while (true) {
    const concurrentTasks = Array.from(slots.values()).filter((slot) => slot.task).length
    let remainingConcurrency = Math.max(0, config.poolBootstrapConcurrency - concurrentTasks)
    const warmTargets = Array.from(slots.values()).filter((slot) => isSlotEligibleToWarm(slot))

    if (remainingConcurrency <= 0 || warmTargets.length === 0) {
      break
    }

    const queued = []
    for (const slot of warmTargets) {
      if (remainingConcurrency <= 0) break
      queued.push(
        ensureSlotWarm(slot).catch(() => {
          // Failure already recorded on the slot; maintenance loop can retry later.
        })
      )
      remainingConcurrency -= 1
    }

    if (queued.length === 0) {
      break
    }

    await Promise.allSettled(queued)
  }
}

function triggerPoolMaintenance() {
  if (!isPoolEnabled()) {
    return Promise.resolve()
  }

  if (maintenancePromise) {
    return maintenancePromise
  }

  maintenancePromise = runPoolMaintenance().finally(() => {
    maintenancePromise = null
  })

  return maintenancePromise
}

export function startTrialSandboxPool() {
  if (!isPoolEnabled() || maintenanceTimer) {
    return
  }

  const config = getTrialRuntimeConfig()
  poolMetrics.startedAt = poolMetrics.startedAt || nowIso()
  pushPoolEvent('pool-started', {
    namespace: config.poolNamespace,
    size: config.poolSize,
    bootstrapConcurrency: config.poolBootstrapConcurrency,
  })

  triggerPoolMaintenance().catch((error) => {
    logger.warn(`Initial trial sandbox pool maintenance failed: ${error.message}`)
  })

  maintenanceTimer = setInterval(() => {
    triggerPoolMaintenance().catch((error) => {
      logger.warn(`Trial sandbox pool maintenance failed: ${error.message}`)
    })
  }, config.poolMaintenanceIntervalMs)

  logger.info(`Trial sandbox pool manager started (namespace=${config.poolNamespace})`)
}

export function stopTrialSandboxPool() {
  if (!maintenanceTimer) {
    return
  }

  clearInterval(maintenanceTimer)
  maintenanceTimer = null
  pushPoolEvent('pool-stopped', {
    namespace: getTrialRuntimeConfig().poolNamespace,
  })
  logger.info('Trial sandbox pool manager stopped')
}

export async function acquireTrialSandboxSlot(sessionId) {
  if (!isPoolEnabled()) {
    return null
  }

  const config = getTrialRuntimeConfig()
  const startedAtMs = Date.now()
  const deadline = Date.now() + config.poolAcquireTimeoutMs

  while (Date.now() <= deadline) {
    for (const slot of slots.values()) {
      if (slot.state !== 'warm' || slot.leasedSessionId) {
        continue
      }

      setSlotState(slot, 'leased', 'session-acquired')
      slot.leasedSessionId = sessionId
      slot.leaseAcquiredAt = nowIso()
      slot.lastLeasedAt = slot.leaseAcquiredAt
      slot.totalLeaseCount = Number(slot.totalLeaseCount || 0) + 1
      slot.leaseStatus = 'provisioning'
      slot.leaseExpiresAt = null
      incrementMetric('leases')
      incrementMetric('warmHits')
      pushPoolEvent('pool-hit', {
        sessionId,
        slotId: slot.id,
        namespace: slot.namespace,
        waitedMs: Date.now() - startedAtMs,
      })

      return {
        type: 'container',
        pooled: true,
        sandboxRef: `docker:${slot.containerName}`,
        workspacePath: slot.workspacePath,
        containerName: slot.containerName,
        poolSlotId: slot.id,
        poolNamespace: slot.namespace,
        runtimeAgentId: slot.runtimeAgentId,
      }
    }

    triggerPoolMaintenance().catch(() => {
      // Maintenance failures are already logged.
    })
    await sleep(500)
  }

  incrementMetric('coldFallbacks')
  pushPoolEvent('pool-fallback', {
    sessionId,
    namespace: config.poolNamespace,
    reason: 'acquire-timeout',
    waitedMs: Date.now() - startedAtMs,
  })
  return null
}

export async function releaseTrialSandboxSlot(session) {
  const pool = getPoolInfo(session)
  if (!pool?.slot_id) {
    return false
  }

  const config = getTrialRuntimeConfig()
  if (pool.namespace && pool.namespace !== config.poolNamespace) {
    return false
  }

  const slot = getOrCreateSlot(pool.slot_id)
  slot.containerName = slot.containerName || getPoolContainerNameFromSlotId(slot.id)
  slot.workspacePath = session.workspace_path || slot.workspacePath
  slot.leasedSessionId = null
  slot.leaseAcquiredAt = null
  slot.leaseStatus = session.status || 'completed'
  slot.leaseExpiresAt = session.expires_at || null
  slot.totalSessionsServed = Number(slot.totalSessionsServed || 0) + 1
  incrementMetric('releases')
  pushPoolEvent('slot-released', {
    sessionId: session.id,
    slotId: slot.id,
    namespace: slot.namespace,
  })

  const shouldRecycle =
    config.poolRecycleAfterSessions > 0 &&
    Number(slot.useCount || 0) + 1 >= config.poolRecycleAfterSessions
  const shouldHonorDrain = slot.state === 'draining'

  await trackSlotTask(slot, async () => {
    if (shouldHonorDrain || shouldRecycle) {
      await recycleSlot(slot, {
        reason: shouldHonorDrain
          ? slot.lastDrainReason?.reason || 'draining'
          : 'recycle-threshold',
      })
      return
    }

    await resetLeasedSlot(slot)
    slot.useCount = Number(slot.useCount || 0) + 1
  }).catch(async () => {
    await trackSlotTask(slot, async () => {
      await recycleSlot(slot, {
        reason: 'post-release-rebuild',
      })
    }).catch(() => {
      // Rebuild failure is already logged by trackSlotTask.
    })
  })

  triggerPoolMaintenance().catch(() => {
    // Maintenance failures are already logged.
  })

  return true
}

export function getTrialSandboxPoolSnapshot() {
  return Array.from(slots.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((slot) => buildSlotSnapshot(slot))
}

export function getTrialSandboxPoolTelemetry() {
  return {
    metrics: {
      ...poolMetrics,
    },
    events: poolEvents.map((event) => ({
      ...event,
      detail: {
        ...(event.detail || {}),
      },
    })),
  }
}

export async function drainTrialSandboxSlot(slotId, options = {}) {
  if (!isPoolEnabled()) {
    throw createPoolManagerError('Warm pool 未启用，无法执行排空。', 409, 'pool_disabled')
  }

  const slot = getManagedSlot(slotId)
  ensureSlotCanAcceptAdminAction(slot, '排空')

  const reason = normalizeAdminReason('drain', options.reason)
  markSlotDraining(slot, reason, {
    requestedBy: options.requestedBy || 'admin',
  })

  if (slot.leasedSessionId) {
    return {
      action: 'drain',
      status: 'queued',
      message: `Slot ${slot.id} 正在使用中，已标记为排空，当前会话结束后会自动重建。`,
      slot: buildSlotSnapshot(slot),
    }
  }

  await trackSlotTask(slot, async () => {
    await recycleSlot(slot, {
      reason,
    })
  })

  triggerPoolMaintenance().catch(() => {
    // Maintenance failures are already logged.
  })

  return {
    action: 'drain',
    status: 'completed',
    message: `Slot ${slot.id} 已排空并重建完成。`,
    slot: buildSlotSnapshot(slot),
  }
}

export async function recycleTrialSandboxSlot(slotId, options = {}) {
  if (!isPoolEnabled()) {
    throw createPoolManagerError('Warm pool 未启用，无法执行重建。', 409, 'pool_disabled')
  }

  const slot = getManagedSlot(slotId)
  ensureSlotCanAcceptAdminAction(slot, '重建')

  const reason = normalizeAdminReason('recycle', options.reason)
  markSlotDraining(slot, reason, {
    requestedBy: options.requestedBy || 'admin',
  })

  if (slot.leasedSessionId) {
    return {
      action: 'recycle',
      status: 'queued',
      message: `Slot ${slot.id} 正在使用中，已排队等待当前租约结束后重建。`,
      slot: buildSlotSnapshot(slot),
    }
  }

  await trackSlotTask(slot, async () => {
    await recycleSlot(slot, {
      reason,
    })
  })

  triggerPoolMaintenance().catch(() => {
    // Maintenance failures are already logged.
  })

  return {
    action: 'recycle',
    status: 'completed',
    message: `Slot ${slot.id} 已完成重建。`,
    slot: buildSlotSnapshot(slot),
  }
}

export async function getTrialSandboxSlotLogs(slotId, logType = 'install', options = {}) {
  if (!isPoolEnabled()) {
    throw createPoolManagerError('Warm pool 未启用，无法读取日志。', 409, 'pool_disabled')
  }

  const slot = getManagedSlot(slotId)
  const normalizedType = String(logType || 'install').trim().toLowerCase()
  const fileName = SLOT_LOG_FILES[normalizedType]

  if (!fileName) {
    throw createPoolManagerError(
      `不支持的日志类型: ${normalizedType}`,
      400,
      'invalid_log_type'
    )
  }

  const workspacePath = slot.workspacePath || getPoolWorkspacePath(slot.id)
  const logPath = path.join(workspacePath, 'logs', fileName)

  try {
    const logData = await readTailFile(logPath, options.maxBytes)

    return {
      slotId: slot.id,
      type: normalizedType,
      fileName,
      path: logPath,
      exists: true,
      ...logData,
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        slotId: slot.id,
        type: normalizedType,
        fileName,
        path: logPath,
        exists: false,
        sizeBytes: 0,
        updatedAt: null,
        content: '',
        truncated: false,
      }
    }

    throw error
  }
}
