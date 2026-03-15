import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/auth.js'
import { getTrialRuntimeConfig } from '../../runtime/trial/config.js'
import {
  drainTrialSandboxSlot,
  getTrialSandboxSlotLogs,
  getTrialSandboxPoolSnapshot,
  getTrialSandboxPoolTelemetry,
  recycleTrialSandboxSlot,
} from '../../runtime/trial/sandbox/poolManager.js'

const router = Router()

router.use(authenticate, authorize('admin'))

function buildPoolSummary(slots) {
  const summary = {
    total: slots.length,
    pending: 0,
    creating: 0,
    warming: 0,
    warm: 0,
    leased: 0,
    draining: 0,
    resetting: 0,
    broken: 0,
  }

  for (const slot of slots) {
    if (summary[slot.state] === undefined) {
      continue
    }
    summary[slot.state] += 1
  }

  return summary
}

function buildEventCounts(events) {
  return events.reduce((accumulator, event) => {
    const type = event?.type || 'unknown'
    accumulator[type] = Number(accumulator[type] || 0) + 1
    return accumulator
  }, {})
}

function buildActiveAnomalies(slots) {
  return slots.filter(
    (slot) =>
      ['broken', 'draining'].includes(slot.state) ||
      Boolean(slot.activeIssueCode) ||
      Boolean(slot.lastError?.message)
  )
}

function derivePoolHealth(summary, metrics, anomalies) {
  if (Number(summary.broken || 0) > 0 || anomalies.length >= 2) {
    return 'critical'
  }

  if (
    Number(summary.draining || 0) > 0 ||
    Number(metrics.coldFallbacks || 0) > 0 ||
    anomalies.length > 0
  ) {
    return 'degraded'
  }

  return 'healthy'
}

function getRouteErrorStatus(error) {
  return Number(error?.statusCode || 500)
}

function getRouteErrorPayload(error, fallbackMessage) {
  return {
    message: error?.message || fallbackMessage,
    code: error?.code || 'trial_runtime_error',
  }
}

router.get('/trial-runtime/pool', (req, res) => {
  const config = getTrialRuntimeConfig()
  const slots = getTrialSandboxPoolSnapshot()
  const telemetry = getTrialSandboxPoolTelemetry()
  const summary = buildPoolSummary(slots)
  const totalAcquireAttempts =
    Number(telemetry.metrics.warmHits || 0) + Number(telemetry.metrics.coldFallbacks || 0)
  const hitRate =
    totalAcquireAttempts > 0
      ? Number(((Number(telemetry.metrics.warmHits || 0) / totalAcquireAttempts) * 100).toFixed(1))
      : null
  const eventCounts = buildEventCounts(telemetry.events)
  const activeAnomalies = buildActiveAnomalies(slots)
  const recentFallbacks = telemetry.events.filter((event) => event.type === 'pool-fallback')
  const recentAnomalyEvents = telemetry.events.filter((event) =>
    ['slot-anomaly', 'slot-error', 'slot-stale-lease', 'slot-draining'].includes(event.type)
  )
  const health = derivePoolHealth(summary, telemetry.metrics, activeAnomalies)

  res.json({
    success: true,
    data: {
      runtime: {
        mode: config.mode,
        containerImage: config.containerImage,
        network: config.network,
        workspaceRoot: config.workspaceRoot,
      },
      pool: {
        enabled: config.poolEnabled,
        namespace: config.poolNamespace,
        size: config.poolSize,
        acquireTimeoutMs: config.poolAcquireTimeoutMs,
        maintenanceIntervalMs: config.poolMaintenanceIntervalMs,
        bootstrapConcurrency: config.poolBootstrapConcurrency,
        brokenRetryBaseMs: config.poolBrokenRetryBaseMs,
        brokenRetryMaxMs: config.poolBrokenRetryMaxMs,
        recycleAfterSessions: config.poolRecycleAfterSessions,
        workspaceRoot: config.poolWorkspaceRoot,
        summary,
        health,
        slots,
        anomalies: activeAnomalies,
        telemetry: {
          metrics: {
            ...telemetry.metrics,
            totalAcquireAttempts,
            hitRate,
          },
          eventCounts,
          recentFallbacks,
          recentAnomalyEvents,
          events: telemetry.events,
        },
      },
      timestamp: new Date().toISOString(),
    },
  })
})

router.post('/trial-runtime/pool/slots/:slotId/drain', async (req, res) => {
  try {
    const result = await drainTrialSandboxSlot(req.params.slotId, {
      reason: req.body?.reason,
      requestedBy: req.user?.id || 'admin',
    })

    res.json({
      success: true,
      message: result.message,
      data: result,
    })
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      error: getRouteErrorPayload(error, 'Slot 排空失败'),
    })
  }
})

router.post('/trial-runtime/pool/slots/:slotId/recycle', async (req, res) => {
  try {
    const result = await recycleTrialSandboxSlot(req.params.slotId, {
      reason: req.body?.reason,
      requestedBy: req.user?.id || 'admin',
    })

    res.json({
      success: true,
      message: result.message,
      data: result,
    })
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      error: getRouteErrorPayload(error, 'Slot 重建失败'),
    })
  }
})

router.get('/trial-runtime/pool/slots/:slotId/logs', async (req, res) => {
  try {
    const maxBytes = Number.parseInt(String(req.query?.maxBytes || ''), 10)
    const result = await getTrialSandboxSlotLogs(req.params.slotId, req.query?.type, {
      maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : undefined,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      error: getRouteErrorPayload(error, '读取 Slot 日志失败'),
    })
  }
})

export default router
