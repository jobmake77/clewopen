import express from 'express'
import {
  getAgents,
  getAgentById,
  downloadAgent,
  rateAgent,
  getAgentReviews,
  getAgentStats,
  getTrendingAgents,
  getPlatformStats,
  getAllAgentsAdmin,
  getPendingAgents,
  approveAgent,
  rejectAgent,
  batchApproveAgents,
  getAgentDependencies,
  publishAgent,
  getAgentPublishJobs,
  getGlobalPublishJobsAdmin,
  getGlobalPublishJobsSummaryAdmin,
  triggerGlobalPublishJobsAlertAdmin,
  retryAgentPublishJob,
  createAgentInstallCommand,
  downloadAgentByInstallToken,
} from './controller.js'
import { uploadAgent, updateAgent, deleteAgent, upload } from './upload.js'
import { getAgentPreview } from './preview.js'
import { trialAgent, getTrialHistory } from './trial.js'
import { createSessionForAgent } from '../trial-sessions/controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { auditLog } from '../../middleware/auditLog.js'

const router = express.Router()

// 公开路由（固定路径优先）
router.get('/', getAgents)
router.get('/trending', getTrendingAgents)
router.get('/platform-stats', getPlatformStats)
router.get('/install/:token/download', downloadAgentByInstallToken)

// 管理员专用路由（必须在 /:id 之前）
router.get('/admin/all', authenticate, authorize('admin'), getAllAgentsAdmin)
router.get('/admin/pending', authenticate, authorize('admin'), getPendingAgents)
router.post('/admin/batch', authenticate, authorize('admin'), auditLog('agent_batch'), batchApproveAgents)
router.post('/admin/:id/approve', authenticate, authorize('admin'), auditLog('agent_approve'), approveAgent)
router.post('/admin/:id/reject', authenticate, authorize('admin'), auditLog('agent_reject'), rejectAgent)
router.post('/admin/:id/publish', authenticate, authorize('admin'), auditLog('agent_publish'), publishAgent)
router.get('/admin/publish-jobs/summary', authenticate, authorize('admin'), getGlobalPublishJobsSummaryAdmin)
router.post('/admin/publish-jobs/alerts/trigger', authenticate, authorize('admin'), auditLog('agent_publish_alert'), triggerGlobalPublishJobsAlertAdmin)
router.get('/admin/publish-jobs', authenticate, authorize('admin'), getGlobalPublishJobsAdmin)
router.get('/admin/:id/publish-jobs', authenticate, authorize('admin'), getAgentPublishJobs)
router.post('/admin/publish-jobs/:jobId/retry', authenticate, authorize('admin'), auditLog('agent_publish_retry'), retryAgentPublishJob)

// 开发者和管理员路由（固定路径优先）
router.post('/upload', authenticate, authorize('developer', 'admin'), upload.single('package'), uploadAgent)

// 动态路由（/:id 参数路由放在最后）
router.get('/:id', getAgentById)
router.get('/:id/preview', getAgentPreview)
router.get('/:id/dependencies', getAgentDependencies)
router.get('/:id/trial/history', authenticate, getTrialHistory)
router.post('/:id/trial', authenticate, trialAgent)
router.post('/:id/trial-sessions', authenticate, createSessionForAgent)
router.get('/:id/reviews', getAgentReviews)
router.get('/:id/stats', getAgentStats)
router.post('/:id/install-command', authenticate, createAgentInstallCommand)
router.post('/:id/download', authenticate, downloadAgent)
router.post('/:id/rate', authenticate, rateAgent)
router.put('/:id', authenticate, authorize('developer', 'admin'), upload.single('package'), updateAgent)
router.delete('/:id', authenticate, authorize('developer', 'admin'), deleteAgent)

export default router
