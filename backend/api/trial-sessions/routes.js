import express from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate } from '../../middleware/auth.js'
import {
  endSession,
  getSession,
  getSessionCapabilities,
  sendSessionMessage,
  sendSessionMessageStream,
} from './controller.js'

const router = express.Router()

const trialMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.TRIAL_MESSAGE_RATE_LIMIT_PER_MIN || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'trial_rate_limited',
      message: '试用发送过于频繁，请稍后再试',
    },
  },
})

router.use(authenticate)

router.get('/:sessionId', getSession)
router.get('/:sessionId/capabilities', getSessionCapabilities)
router.post('/:sessionId/messages/stream', trialMessageLimiter, sendSessionMessageStream)
router.post('/:sessionId/messages', trialMessageLimiter, sendSessionMessage)
router.delete('/:sessionId', endSession)

export default router
