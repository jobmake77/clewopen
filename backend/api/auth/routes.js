import express from 'express'
import {
  register,
  login,
  sendEmailLoginCode,
  verifyEmailLoginCode,
  getGithubLoginUrl,
  startGithubLogin,
  githubCallback,
  exchangeSupabaseSession,
  getCurrentUser,
  updateProfile,
  changePassword,
} from './controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = express.Router()

// 公开路由
router.post('/register', register)
router.post('/login', login)
router.post('/email/send-code', sendEmailLoginCode)
router.post('/email/verify-code', verifyEmailLoginCode)
router.get('/github/url', getGithubLoginUrl)
router.get('/github/start', startGithubLogin)
router.get('/github/callback', githubCallback)
router.post('/supabase/exchange', exchangeSupabaseSession)

// 需要认证的路由
router.get('/me', authenticate, getCurrentUser)
router.put('/profile', authenticate, updateProfile)
router.put('/password', authenticate, changePassword)

export default router
