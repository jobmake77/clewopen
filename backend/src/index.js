import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import agentRoutes from '../api/agents/routes.js'
import userRoutes from '../api/users/routes.js'
import authRoutes from '../api/auth/routes.js'
import reviewRoutes from '../api/reviews/routes.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { logger } from '../config/logger.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件服务 - 提供上传的 Agent 包下载
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/agents', agentRoutes)
app.use('/api/users', userRoutes)
app.use('/api/reviews', reviewRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})

export default app
