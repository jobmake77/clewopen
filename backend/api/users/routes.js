import express from 'express'
import { getUserById, getUserDownloads, getUserAgents } from './controller.js'
import { authenticate } from '../../middleware/auth.js'

const router = express.Router()

// 获取用户信息
router.get('/:id', getUserById)

// 获取用户下载记录（需要认证）
router.get('/:id/downloads', authenticate, getUserDownloads)

// 获取用户发布的 Agent（需要认证）
router.get('/:id/agents', authenticate, getUserAgents)

export default router
