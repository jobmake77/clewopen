import express from 'express'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from './controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = express.Router()

router.get('/', authenticate, getNotifications)
router.get('/unread-count', authenticate, getUnreadCount)
router.post('/:id/read', authenticate, markAsRead)
router.post('/read-all', authenticate, markAllAsRead)

export default router
