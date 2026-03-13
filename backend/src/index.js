import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import agentRoutes from '../api/agents/routes.js'
import skillRoutes from '../api/skills/routes.js'
import mcpRoutes from '../api/mcps/routes.js'
import userRoutes from '../api/users/routes.js'
import authRoutes from '../api/auth/routes.js'
import reviewRoutes from '../api/reviews/routes.js'
import customOrderRoutes from '../api/custom-orders/routes.js'
import notificationRoutes from '../api/notifications/routes.js'
import trialSessionRoutes from '../api/trial-sessions/routes.js'
import adminSyncRoutes from '../api/admin/syncRoutes.js'
import adminLlmRoutes from '../api/admin/llmConfigRoutes.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { logger } from '../config/logger.js'
import { bootstrapActiveLlmConfigFromEnv } from '../services/llmConfigBootstrapService.js'
import { startScheduler, stopScheduler } from '../services/syncService.js'
import { startTrialCleanupWorker, stopTrialCleanupWorker } from '../runtime/trial/cleanupWorker.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// CORS 配置
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000']

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 请求日志
const morganStream = { write: (message) => logger.info(message.trim()) }
app.use(morgan('short', { stream: morganStream }))

// 全局速率限制: 开发环境 10000 req/15min，生产环境 1000 req/15min
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests, please try again later' } }
})
app.use('/api', globalLimiter)

// 登录/注册速率限制: 10 req/15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many auth attempts, please try again later' } }
})

// 评价提交速率限制: 20 req/15min
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many review submissions, please try again later' } }
})

// 静态文件服务 - 提供上传的 Agent 包下载
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Routes
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/agents', agentRoutes)
app.use('/api/skills', skillRoutes)
app.use('/api/mcps', mcpRoutes)
app.use('/api/users', userRoutes)
app.use('/api/reviews', rateLimiter, reviewRoutes)
app.use('/api/custom-orders', customOrderRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/trial-sessions', trialSessionRoutes)
app.use('/api/admin', adminSyncRoutes)
app.use('/api/admin', adminLlmRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use(errorHandler)

let server = null

async function startServer() {
  try {
    await bootstrapActiveLlmConfigFromEnv()
  } catch (error) {
    logger.warn(`Failed to bootstrap llm config from env: ${error.message}`)
  }

  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`)
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    startScheduler()
    startTrialCleanupWorker()
  })
}

// 优雅退出
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`)
  stopScheduler()
  stopTrialCleanupWorker()
  if (!server) {
    process.exit(0)
    return
  }
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

startServer()

export default app
