import express from 'express'
import {
  getUserById,
  getUserDownloads,
  getUserAgents,
  getUsersAdmin,
  getUserAgentTrialQuotasAdmin,
  grantUserAgentTrialQuotaAdmin,
  listMyLlmConfigs,
  createMyLlmConfig,
  updateMyLlmConfig,
  deleteMyLlmConfig,
} from './controller.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = express.Router()

// 管理员路由（固定路径优先）
router.get('/admin/all', authenticate, authorize('admin'), getUsersAdmin)
router.get('/admin/:userId/trial-quotas', authenticate, authorize('admin'), getUserAgentTrialQuotasAdmin)
router.post('/admin/:userId/agents/:agentId/trial-quota/grant', authenticate, authorize('admin'), grantUserAgentTrialQuotaAdmin)

router.get('/me/llm-configs', authenticate, listMyLlmConfigs)
router.post('/me/llm-configs', authenticate, createMyLlmConfig)
router.put('/me/llm-configs/:configId', authenticate, updateMyLlmConfig)
router.delete('/me/llm-configs/:configId', authenticate, deleteMyLlmConfig)

// 获取用户信息
router.get('/:id', getUserById)

// 获取用户下载记录（需要认证）
router.get('/:id/downloads', authenticate, getUserDownloads)

// 获取用户发布的 Agent（需要认证）
router.get('/:id/agents', authenticate, getUserAgents)

export default router
