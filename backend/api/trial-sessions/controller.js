import TrialSessionModel from '../../models/TrialSession.js'
import TrialDataAccessAuditModel from '../../models/TrialDataAccessAudit.js'
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
import { assessTrialInputRisk, summarizeRiskFindings } from '../../utils/trialInputRisk.js'

function normalizeRuntimeOverride(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') return null
  const provider = String(rawValue.provider || rawValue.provider_name || '').trim()
  const apiUrl = String(rawValue.apiUrl || rawValue.base_url || rawValue.api_url || '').trim()
  const apiKey = String(rawValue.apiKey || rawValue.api_key || '').trim()
  const model = String(rawValue.model || rawValue.model_id || rawValue.modelId || '').trim()
  const authType = String(rawValue.authType || rawValue.auth_type || 'bearer').trim().toLowerCase()
  const maxTokens = Number.parseInt(rawValue.maxTokens || rawValue.max_tokens, 10)
  const temperature = Number.parseFloat(rawValue.temperature)

  if (!provider && !apiUrl && !apiKey && !model) return null

  return {
    provider_name: provider || null,
    api_url: apiUrl,
    api_key: apiKey,
    model_id: model,
    auth_type: authType,
    ...(Number.isFinite(maxTokens) ? { max_tokens: maxTokens } : {}),
    ...(Number.isFinite(temperature) ? { temperature } : {}),
  }
}

function readUserLlmConfigId(req) {
  return String(req.body?.userLlmConfigId || req.body?.user_llm_config_id || '').trim() || null
}

function enforceTrialInputRisk(res, payload, mediumRiskConfirmed) {
  const risk = assessTrialInputRisk(payload)
  if (risk.level === 'high') {
    res.status(422).json({
      success: false,
      error: {
        code: 'trial_high_risk_blocked',
        message: '检测到高风险敏感数据（证件/密钥/私钥），已阻断本次试用发送，请先脱敏后重试。',
        findings: risk.findings,
        summary: summarizeRiskFindings(risk.findings),
      },
    })
    return false
  }

  if (risk.level === 'medium' && !mediumRiskConfirmed) {
    res.status(409).json({
      success: false,
      error: {
        code: 'trial_medium_risk_confirmation_required',
        message: '检测到中敏感信息（如姓名/邮箱/手机号）。请确认后再发送。',
        findings: risk.findings,
        summary: summarizeRiskFindings(risk.findings),
      },
    })
    return false
  }

  return true
}

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
    await TrialDataAccessAuditModel.create({
      session_id: session.id,
      viewer_user_id: req.user.id,
      viewer_role: req.user.role,
      access_type: 'read_session',
      metadata: {
        path: req.originalUrl,
        messageCount: messages.length,
      },
    })

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
    if (!enforceTrialInputRisk(res, { message, attachments }, Boolean(req.body?.confirmMediumRisk))) {
      return
    }

    const result = await sendTrialMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      message,
      attachments,
      runtimeOverride: normalizeRuntimeOverride(req.body?.runtimeOverride),
      userLlmConfigId: readUserLlmConfigId(req),
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
    if (!enforceTrialInputRisk(res, { message, attachments }, Boolean(req.body?.confirmMediumRisk))) {
      return
    }
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
      runtimeOverride: normalizeRuntimeOverride(req.body?.runtimeOverride),
      userLlmConfigId: readUserLlmConfigId(req),
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
