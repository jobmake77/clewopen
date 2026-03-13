import TrialSessionModel from '../../models/TrialSession.js'
import {
  completeTrialSession,
  createTrialSession,
  sendTrialMessage,
} from '../../runtime/trial/orchestrator.js'

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
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getSession = async (req, res, next) => {
  try {
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

export const sendSessionMessage = async (req, res, next) => {
  try {
    const { message } = req.body
    const result = await sendTrialMessage({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      message,
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

export const endSession = async (req, res, next) => {
  try {
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
