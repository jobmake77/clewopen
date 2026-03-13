import express from 'express'
import SkillModel from '../../models/Skill.js'
import { createResourceController } from '../shared/resourceController.js'
import { createResourceUpload } from '../shared/resourceUpload.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { auditLog } from '../../middleware/auditLog.js'

const router = express.Router()
const ctrl = createResourceController(SkillModel, 'skill', 'Skill')
const { upload, uploadItem, updateItem, deleteItem } = createResourceUpload(SkillModel, 'skills', 'Skill', 'skill')

// 公开路由
router.get('/', ctrl.getItems)
router.get('/trending', ctrl.getTrendingItems)

// 管理员路由
router.get('/admin/all', authenticate, authorize('admin'), ctrl.getAllAdmin)
router.get('/admin/pending', authenticate, authorize('admin'), ctrl.getPendingItems)
router.post('/admin/batch', authenticate, authorize('admin'), auditLog('skill_batch'), ctrl.batchAction)
router.post('/admin/:id/approve', authenticate, authorize('admin'), auditLog('skill_approve'), ctrl.approveItem)
router.post('/admin/:id/reject', authenticate, authorize('admin'), auditLog('skill_reject'), ctrl.rejectItem)

// 上传
router.post('/upload', authenticate, authorize('developer', 'admin'), upload.single('package'), uploadItem)

// 动态路由
router.get('/:id', ctrl.getItemById)
router.post('/:id/visit', ctrl.visitExternalItem)
router.get('/:id/reviews', ctrl.getItemReviews)
router.post('/:id/download', authenticate, ctrl.downloadItem)
router.post('/:id/rate', authenticate, ctrl.rateItem)
router.put('/:id', authenticate, authorize('developer', 'admin'), upload.single('package'), updateItem)
router.delete('/:id', authenticate, authorize('developer', 'admin'), deleteItem)

export default router
