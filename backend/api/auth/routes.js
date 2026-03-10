import express from 'express'
import { register, login, getCurrentUser, updateProfile, changePassword } from './controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = express.Router()

// 公开路由
router.post('/register', register)
router.post('/login', login)

// 需要认证的路由
router.get('/me', authenticate, getCurrentUser)
router.put('/profile', authenticate, updateProfile)
router.put('/password', authenticate, changePassword)

export default router
