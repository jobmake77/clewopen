import TrialSessionModel from '../../models/TrialSession.js'
import { expireTrialSession } from './orchestrator.js'
import { logger } from '../../config/logger.js'
import { cleanupOrphanedTrialContainers } from './sandbox/containerWorkspace.js'

let cleanupTimer = null
const CLEANUP_INTERVAL_MS = 60 * 1000

export async function runTrialSessionCleanup() {
  const expiredSessions = await TrialSessionModel.listExpired()
  const activeContainerSessionIds = await TrialSessionModel.listActiveContainerSessionIds()

  for (const session of expiredSessions) {
    try {
      await expireTrialSession(session)
      logger.info(`Trial session expired and cleaned: ${session.id}`)
    } catch (error) {
      logger.warn(`Failed to cleanup expired trial session ${session.id}: ${error.message}`)
    }
  }

  try {
    await cleanupOrphanedTrialContainers(activeContainerSessionIds)
  } catch (error) {
    logger.warn(`Failed to cleanup orphaned trial containers: ${error.message}`)
  }
}

export function startTrialCleanupWorker() {
  if (cleanupTimer) return

  runTrialSessionCleanup().catch((error) => {
    logger.warn(`Initial trial cleanup failed: ${error.message}`)
  })

  cleanupTimer = setInterval(() => {
    runTrialSessionCleanup().catch((error) => {
      logger.warn(`Trial cleanup worker failed: ${error.message}`)
    })
  }, CLEANUP_INTERVAL_MS)

  logger.info('Trial cleanup worker started')
}

export function stopTrialCleanupWorker() {
  if (!cleanupTimer) return
  clearInterval(cleanupTimer)
  cleanupTimer = null
  logger.info('Trial cleanup worker stopped')
}
