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
  resetSessionWorkspaceFiles,
} from './containerWorkspace.js'

const slots = new Map()
let maintenanceTimer = null
let maintenancePromise = null
const MAX_POOL_EVENTS = 100
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
  slotErrors: 0,
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pushPoolEvent(type, detail = {}) {
  poolEvents.unshift({
    id: `pool-event-${nextPoolEventId++}`,
    type,
    at: new Date().toISOString(),
    detail,
  })

  if (poolEvents.length > MAX_POOL_EVENTS) {
    poolEvents.length = MAX_POOL_EVENTS
  }
}

function incrementMetric(name, amount = 1) {
  poolMetrics[name] = Number(poolMetrics[name] || 0) + amount
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
      task: null,
      lastError: null,
      lastWarmedAt: null,
      lastLeasedAt: null,
      lastReleasedAt: null,
    })
  }

  return slots.get(slotId)
}

function getPoolInfo(session) {
  return session?.metadata?.sandbox?.pool || session?.sandbox_pool || null
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

async function warmFreshSlot(slot) {
  const config = getTrialRuntimeConfig()
  slot.state = 'creating'
  slot.lastError = null

  await destroyPoolContainerWorkspace(slot.id, slot.workspacePath)

  const workspace = await createPoolContainerWorkspace(slot.id)
  slot.containerName = workspace.containerName
  slot.workspacePath = workspace.workspacePath

  await prepareBlankSlot(slot, { poolReuse: false })

  let warmup = {
    status: 'skipped',
    duration_ms: 0,
    message: 'Gateway prewarm disabled for warm pool.',
  }

  if (config.poolPrewarmGateway) {
    slot.state = 'warming'
    warmup = await prewarmSessionGateway(buildSlotSession(slot))
    if (warmup.status !== 'ok') {
      throw new Error(
        [warmup.error, warmup.stdout, warmup.stderr].filter(Boolean).join('\n') ||
          'Pool slot gateway warmup failed'
      )
    }
  }

  slot.state = 'warm'
  slot.lastWarmedAt = new Date().toISOString()
  slot.gatewayWarmup = warmup
  incrementMetric('slotWarmups')
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
  slot.useCount = 0
  await warmFreshSlot(slot)

  if (shouldCountRecycle) {
    incrementMetric('slotRecycles')
    pushPoolEvent('slot-recycled', {
      slotId: slot.id,
      namespace: slot.namespace,
      containerName: slot.containerName,
    })
  }
}

async function resetLeasedSlot(slot) {
  slot.state = 'resetting'
  await prepareBlankSlot(slot, { poolReuse: true })
  slot.state = 'warm'
  slot.lastReleasedAt = new Date().toISOString()
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

  slot.task = runner()
    .catch((error) => {
      slot.state = 'broken'
      slot.lastError = {
        message: error.message,
        at: new Date().toISOString(),
      }
      incrementMetric('slotErrors')
      pushPoolEvent('slot-error', {
        slotId: slot.id,
        namespace: slot.namespace,
        containerName: slot.containerName,
        message: error.message,
      })
      logger.warn(`Trial pool slot ${slot.id} failed: ${error.message}`)
      throw error
    })
    .finally(() => {
      slot.task = null
    })

  return slot.task
}

async function ensureSlotWarm(slot) {
  if (slot.state === 'warm') {
    return slot
  }

  return trackSlotTask(slot, async () => {
    const shouldCountRecycle = Boolean(slot.lastWarmedAt || Number(slot.useCount || 0) > 0)
    await recycleSlot(slot, { countRecycle: shouldCountRecycle })
    return slot
  })
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

    await destroyPoolContainerWorkspace(slot.id, slot.workspacePath)
    slots.delete(slotId)
  }

  while (true) {
    const concurrentTasks = Array.from(slots.values()).filter((slot) => slot.task).length
    let remainingConcurrency = Math.max(0, config.poolBootstrapConcurrency - concurrentTasks)
    const warmTargets = Array.from(slots.values()).filter(
      (slot) => !slot.leasedSessionId && !slot.task && slot.state !== 'warm'
    )

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
  poolMetrics.startedAt = poolMetrics.startedAt || new Date().toISOString()
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

      slot.state = 'leased'
      slot.leasedSessionId = sessionId
      slot.lastLeasedAt = new Date().toISOString()
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
  incrementMetric('releases')
  pushPoolEvent('slot-released', {
    sessionId: session.id,
    slotId: slot.id,
    namespace: slot.namespace,
  })

  const shouldRecycle =
    config.poolRecycleAfterSessions > 0 &&
    Number(slot.useCount || 0) + 1 >= config.poolRecycleAfterSessions

  await trackSlotTask(slot, async () => {
    if (shouldRecycle) {
      await recycleSlot(slot)
      return
    }

    await resetLeasedSlot(slot)
    slot.useCount = Number(slot.useCount || 0) + 1
  }).catch(async () => {
    await trackSlotTask(slot, async () => {
      await recycleSlot(slot)
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
  return Array.from(slots.values()).map((slot) => ({
    id: slot.id,
    state: slot.state,
    leasedSessionId: slot.leasedSessionId,
    useCount: slot.useCount,
    namespace: slot.namespace,
    containerName: slot.containerName,
    workspacePath: slot.workspacePath,
    runtimeAgentId: slot.runtimeAgentId,
    lastError: slot.lastError || null,
    lastWarmedAt: slot.lastWarmedAt || null,
    lastLeasedAt: slot.lastLeasedAt || null,
    lastReleasedAt: slot.lastReleasedAt || null,
  }))
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
