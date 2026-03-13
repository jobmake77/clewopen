import express from 'express'
import { authenticate } from '../../middleware/auth.js'
import {
  endSession,
  getSession,
  sendSessionMessage,
} from './controller.js'

const router = express.Router()

router.use(authenticate)

router.get('/:sessionId', getSession)
router.post('/:sessionId/messages', sendSessionMessage)
router.delete('/:sessionId', endSession)

export default router
