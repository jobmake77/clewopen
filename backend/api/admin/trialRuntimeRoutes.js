import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/auth.js'
import { getTrialRuntimeConfig } from '../../runtime/trial/config.js'
import {
  getTrialSandboxPoolSnapshot,
  getTrialSandboxPoolTelemetry,
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

router.get('/trial-runtime/pool', (req, res) => {
  const config = getTrialRuntimeConfig()
  const slots = getTrialSandboxPoolSnapshot()
  const telemetry = getTrialSandboxPoolTelemetry()
  const totalAcquireAttempts =
    Number(telemetry.metrics.warmHits || 0) + Number(telemetry.metrics.coldFallbacks || 0)
  const hitRate =
    totalAcquireAttempts > 0
      ? Number(((Number(telemetry.metrics.warmHits || 0) / totalAcquireAttempts) * 100).toFixed(1))
      : null

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
        recycleAfterSessions: config.poolRecycleAfterSessions,
        workspaceRoot: config.poolWorkspaceRoot,
        summary: buildPoolSummary(slots),
        slots,
        telemetry: {
          metrics: {
            ...telemetry.metrics,
            totalAcquireAttempts,
            hitRate,
          },
          events: telemetry.events,
        },
      },
      timestamp: new Date().toISOString(),
    },
  })
})

export default router
