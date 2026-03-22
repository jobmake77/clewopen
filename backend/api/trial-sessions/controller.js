import TrialSessionModel from '../../models/TrialSession.js'
import {
  completeTrialSession,
  createTrialSession,
  sendTrialMessage,
  streamTrialMessage,
} from '../../runtime/trial/orchestrator.js'
import {
  ensureTrialAttachmentCapabilities,
  normalizeTrialAttachments,
} from '../../runtime/trial/mediaAttachments.js'
import { getTrialInputCapabilities } from '../../services/llmService.js'

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  )
}

function ensureValidSessionId(req, res) {
  if (isValidUuid(req.params.sessionId)) {
    return true
  }

  res.status(404).json({
    success: false,
    error: { message: '试用会话不存在' },
  })
  return false
}

export const createSessionForAgent = async (req, res, next) => {
  try {
    const result = await createTrialSession({
      userId: req.user.id,
      agentId: req.params.id,
    })

    res.status(201).json({
      success: true,
      data: {
        sessionId: result.session.id,
        status: result.session.status,
        runtimeType: result.session.runtime_type,
        expiresAt: result.session.expires_at,
        remainingTrials: result.remainingTrials,
        provisioning: result.session.metadata?.provisioning || null,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getSession = async (req, res, next) => {
  try {
    if (!ensureValidSessionId(req, res)) {
      return
    }

    const session = await TrialSessionModel.findById(req.params.sessionId)
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: '试用会话不存在' },
      })
    }

    const messages = await TrialSessionModel.listMessages(session.id)

    res.json({
      success: true,
      data: {
        session,
        messages,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getSessionCapabilities = async (req, res, next) => {
  try {
    if (!ensureValidSessionId(req, res)) {
      return
    }

    const session = await TrialSessionModel.findById(req.params.sessionId)
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: '试用会话不存在' },
      })
    }

    const input = await getTrialInputCapabilities()
    res.json({
      success: true,
      data: {
        sessionId: session.id,
        input,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const sendSessionMessage = async (req, res, next) => {
  try {
    if (!ensureValidSessionId(req, res)) {
      return
    }

    const { message } = req.body
    const attachments = normalizeTrialAttachments(req.body?.attachments)
    ensureTrialAttachmentCapabilities(attachments)
    const result = await sendTrialMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      message,
      attachments,
    })

    res.json({
      success: true,
      data: {
        sessionId: result.session.id,
        status: result.session.status,
        runtimeType: result.session.runtime_type,
        expiresAt: result.session.expires_at,
        response: result.response,
      },
    })
  } catch (error) {
    next(error)
  }
}

function writeSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export const sendSessionMessageStream = async (req, res, next) => {
  if (!ensureValidSessionId(req, res)) {
    return
  }

  const { message } = req.body
  let attachments = []

  try {
    attachments = normalizeTrialAttachments(req.body?.attachments)
    ensureTrialAttachmentCapabilities(attachments)
  } catch (error) {
    if (!res.headersSent) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          message: error.message,
          code: error.code || 'invalid_trial_attachments',
        },
      })
      return
    }
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const heartbeatId = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': ping\n\n')
    }
  }, 15000)

  const closeStream = () => {
    clearInterval(heartbeatId)
    if (!res.writableEnded && !res.destroyed) {
      res.end()
    }
  }

  try {
    await streamTrialMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      message,
      attachments,
      onEvent: (event) => {
        if (res.writableEnded || res.destroyed) return
        writeSseEvent(res, event.type || 'message', {
          ...event,
          at: new Date().toISOString(),
        })
      },
    })
    closeStream()
  } catch (error) {
    clearInterval(heartbeatId)

    if (res.headersSent) {
      if (!res.writableEnded && !res.destroyed) {
        writeSseEvent(res, 'error', {
          message: error.message,
          statusCode: error.statusCode || 500,
        })
        res.end()
      }
      return
    }

    next(error)
  }
}

export const endSession = async (req, res, next) => {
  try {
    if (!ensureValidSessionId(req, res)) {
      return
    }

    const session = await TrialSessionModel.findById(req.params.sessionId)
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        error: { message: '试用会话不存在' },
      })
    }

    const updated = await completeTrialSession(session)

    res.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    next(error)
  }
}
