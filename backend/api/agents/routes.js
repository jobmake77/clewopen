import express from 'express'
import { getAgents, getAgentById, downloadAgent, rateAgent, getAgentReviews, getAgentStats, getTrendingAgents, getAllAgentsAdmin, getPendingAgents, approveAgent, rejectAgent } from './controller.js'
import { uploadAgent, updateAgent, deleteAgent, upload } from './upload.js'
import { authenticate, authorize } from '../../middleware/auth.js'

const router = express.Router()

// 公开路由
router.get('/', getAgents)
router.get('/trending', getTrendingAgents)
router.get('/:id', getAgentById)
router.get('/:id/reviews', getAgentReviews)
router.get('/:id/stats', getAgentStats)

// 需要认证的路由
router.post('/:id/download', authenticate, downloadAgent)
router.post('/:id/rate', authenticate, rateAgent)

// 开发者和管理员路由
router.post('/upload', authenticate, authorize('developer', 'admin'), upload.single('package'), uploadAgent)
router.put('/:id', authenticate, authorize('developer', 'admin'), upload.single('package'), updateAgent)
router.delete('/:id', authenticate, authorize('developer', 'admin'), deleteAgent)

// 管理员专用路由
router.get('/admin/all', authenticate, authorize('admin'), getAllAgentsAdmin)
router.get('/admin/pending', authenticate, authorize('admin'), getPendingAgents)
router.post('/admin/:id/approve', authenticate, authorize('admin'), approveAgent)
router.post('/admin/:id/reject', authenticate, authorize('admin'), rejectAgent)

export default router
