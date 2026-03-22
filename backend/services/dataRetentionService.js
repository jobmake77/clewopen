import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { query } from '../config/database.js'
import { logger } from '../config/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')

const RETENTION_ENABLED = String(process.env.DATA_RETENTION_ENABLED || 'true').toLowerCase() !== 'false'
const RETENTION_INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number.parseInt(process.env.DATA_RETENTION_INTERVAL_MS || `${24 * 60 * 60 * 1000}`, 10)
)
const TRIAL_MESSAGE_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_MESSAGE_RETENTION_DAYS || '30', 10))
const ACCESS_LOG_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.ACCESS_LOG_RETENTION_DAYS || '90', 10))
const NOTIFICATION_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '90', 10))
const TRIAL_SESSION_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_SESSION_RETENTION_DAYS || '30', 10))
const LOG_FILE_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.LOG_FILE_RETENTION_DAYS || '30', 10))
const TRIAL_WORKSPACE_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.TRIAL_WORKSPACE_RETENTION_DAYS || '30', 10))

let timer = null

async function safeDeleteFromTable(sql, params, tableLabel) {
  try {
    const result = await query(sql, params)
    return result.rowCount || 0
  } catch (error) {
    if (error?.code === '42P01') {
      logger.warn(`Data retention skipped missing table: ${tableLabel}`)
      return 0
    }
    throw error
  }
}

async function safeDeleteOldFiles(targetPath, olderThanDays) {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true })
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    let removed = 0

    for (const entry of entries) {
      const absolutePath = path.join(targetPath, entry.name)
      const stat = await fs.stat(absolutePath)
      if (stat.mtimeMs >= cutoff) continue
      await fs.rm(absolutePath, { recursive: true, force: true })
      removed += 1
    }

    return removed
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

export async function runDataRetentionSweep() {
  const result = {
    trialSessionMessages: 0,
    trialSessions: 0,
    resourceVisits: 0,
    notifications: 0,
    trialQuotaGrants: 0,
    oldStarSnapshots: 0,
    trialDataAccessAudits: 0,
    deletedLogFiles: 0,
    deletedTrialWorkspaces: 0,
  }

  result.trialSessionMessages = await safeDeleteFromTable(
    `DELETE FROM trial_session_messages
     WHERE created_at < NOW() - make_interval(days => $1)`,
    [TRIAL_MESSAGE_RETENTION_DAYS],
    'trial_session_messages'
  )

  result.trialSessions = await safeDeleteFromTable(
    `DELETE FROM trial_sessions
     WHERE status IN ('completed', 'failed', 'expired')
       AND COALESCE(ended_at, expires_at, updated_at, created_at)
           < NOW() - make_interval(days => $1)`,
    [TRIAL_SESSION_RETENTION_DAYS],
    'trial_sessions'
  )

  result.resourceVisits = await safeDeleteFromTable(
    `DELETE FROM resource_visits
     WHERE visited_at < NOW() - make_interval(days => $1)`,
    [ACCESS_LOG_RETENTION_DAYS],
    'resource_visits'
  )

  result.notifications = await safeDeleteFromTable(
    `DELETE FROM notifications
     WHERE COALESCE(read_at, created_at) < NOW() - make_interval(days => $1)`,
    [NOTIFICATION_RETENTION_DAYS],
    'notifications'
  )

  result.trialQuotaGrants = await safeDeleteFromTable(
    `DELETE FROM agent_trial_quota_grants
     WHERE created_at < NOW() - make_interval(days => $1)`,
    [ACCESS_LOG_RETENTION_DAYS],
    'agent_trial_quota_grants'
  )

  result.oldStarSnapshots = await safeDeleteFromTable(
    `DELETE FROM resource_star_snapshots
     WHERE snapshot_date < (CURRENT_DATE - ($1::int * INTERVAL '1 day'))::date`,
    [ACCESS_LOG_RETENTION_DAYS],
    'resource_star_snapshots'
  )

  result.trialDataAccessAudits = await safeDeleteFromTable(
    `DELETE FROM trial_data_access_audits
     WHERE created_at < NOW() - make_interval(days => $1)`,
    [ACCESS_LOG_RETENTION_DAYS],
    'trial_data_access_audits'
  )

  result.deletedLogFiles = await safeDeleteOldFiles(path.join(backendRoot, 'logs'), LOG_FILE_RETENTION_DAYS)
  result.deletedTrialWorkspaces = await safeDeleteOldFiles(
    path.join(backendRoot, '.trial-runtime', 'trial-sessions'),
    TRIAL_WORKSPACE_RETENTION_DAYS
  )

  logger.info('Data retention sweep finished', result)
  return result
}

export function startDataRetentionWorker() {
  if (timer || !RETENTION_ENABLED) {
    if (!RETENTION_ENABLED) {
      logger.info('Data retention worker disabled by DATA_RETENTION_ENABLED=false')
    }
    return
  }

  runDataRetentionSweep().catch((error) => {
    logger.warn(`Initial data retention sweep failed: ${error.message}`)
  })

  timer = setInterval(() => {
    runDataRetentionSweep().catch((error) => {
      logger.warn(`Data retention sweep failed: ${error.message}`)
    })
  }, RETENTION_INTERVAL_MS)

  logger.info(`Data retention worker started (interval=${RETENTION_INTERVAL_MS}ms)`)
}

export function stopDataRetentionWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  logger.info('Data retention worker stopped')
}
