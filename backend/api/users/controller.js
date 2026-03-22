import UserModel from '../../models/User.js'
import AgentModel from '../../models/Agent.js'
import AgentTrialModel from '../../models/AgentTrial.js'
import UserLlmConfigModel from '../../models/UserLlmConfig.js'
import { maskSecret } from '../../utils/redaction.js'

function sanitizeUserLlmConfigPayload(record) {
  if (!record) return null
  return {
    ...record,
    apiKeyMasked: record.api_key ? maskSecret(record.api_key) : '已保存（不回显）',
  }
}

/**
 * 获取用户信息
 */
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params

    const user = await UserModel.findById(id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      })
    }

    // 不返回密码
    delete user.password_hash

    res.json({
      success: true,
      data: user
    })
  } catch (error) {
    next(error)
  }
}

/**
 * 获取用户的下载记录
 */
export const getUserDownloads = async (req, res, next) => {
  try {
    const { id } = req.params
    const { page = 1, pageSize = 20 } = req.query

    const result = await UserModel.getDownloads(id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * 获取用户发布的 Agent
 */
export const getUserAgents = async (req, res, next) => {
  try {
    const { id } = req.params
    const { page = 1, pageSize = 20 } = req.query

    const result = await UserModel.getAgents(id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * 管理员：获取用户列表
 */
export const getUsersAdmin = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, search = '', role } = req.query

    const result = await UserModel.findAllAdmin({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      search: search || '',
      role,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * 管理员：获取用户今日 Agent 试用配额状态
 */
export const getUserAgentTrialQuotasAdmin = async (req, res, next) => {
  try {
    const { userId } = req.params

    const user = await UserModel.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      })
    }

    const quotas = await AgentTrialModel.listDailyQuotaByUser(userId)

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        quotas,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * 管理员：为用户某 Agent 重置/补偿试用次数（默认 +3）
 */
export const grantUserAgentTrialQuotaAdmin = async (req, res, next) => {
  try {
    const { userId, agentId } = req.params
    const { grantedCount = 3, reason = 'admin-reset' } = req.body || {}
    const normalizedGrantedCount = Math.max(1, parseInt(grantedCount, 10) || 3)

    const [user, agent] = await Promise.all([
      UserModel.findById(userId),
      AgentModel.findById(agentId),
    ])

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      })
    }

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      })
    }

    const grant = await AgentTrialModel.grantDailyTrials({
      userId,
      agentId,
      grantedBy: req.user?.id || null,
      grantedCount: normalizedGrantedCount,
      reason: reason || null,
    })

    const quota = await AgentTrialModel.getDailyQuotaSummary(userId, agentId)

    res.json({
      success: true,
      data: {
        grant,
        quota,
      },
      message: `已为用户 ${user.username} 增加 ${normalizedGrantedCount} 次今日试用机会`,
    })
  } catch (error) {
    next(error)
  }
}

export const listMyLlmConfigs = async (req, res, next) => {
  try {
    const list = await UserLlmConfigModel.findByUser(req.user.id)
    res.json({
      success: true,
      data: {
        configs: list.map(sanitizeUserLlmConfigPayload),
      },
    })
  } catch (error) {
    next(error)
  }
}

export const createMyLlmConfig = async (req, res, next) => {
  try {
    const { provider_name, provider, api_url, apiUrl, model_id, model, api_key, apiKey } = req.body || {}
    if (!(provider_name || provider) || !(api_url || apiUrl) || !(model_id || model) || !(api_key || apiKey)) {
      return res.status(400).json({
        success: false,
        error: { message: '请完整填写厂商、Base URL、模型和 API Key' },
      })
    }

    const created = await UserLlmConfigModel.create({
      user_id: req.user.id,
      provider_name: String(provider_name || provider).trim().toLowerCase(),
      api_url: String(api_url || apiUrl).trim(),
      model_id: String(model_id || model).trim(),
      api_key: String(api_key || apiKey).trim(),
      auth_type: String(req.body?.auth_type || req.body?.authType || 'bearer').trim().toLowerCase(),
      is_default: Boolean(req.body?.is_default ?? req.body?.isDefault ?? false),
      is_enabled: req.body?.is_enabled ?? req.body?.isEnabled ?? true,
    })

    res.status(201).json({
      success: true,
      data: {
        config: sanitizeUserLlmConfigPayload(created),
      },
    })
  } catch (error) {
    next(error)
  }
}

export const updateMyLlmConfig = async (req, res, next) => {
  try {
    const patch = {}
    const body = req.body || {}

    if (body.provider_name !== undefined || body.provider !== undefined) {
      patch.provider_name = String(body.provider_name || body.provider).trim().toLowerCase()
    }
    if (body.api_url !== undefined || body.apiUrl !== undefined) {
      patch.api_url = String(body.api_url || body.apiUrl).trim()
    }
    if (body.model_id !== undefined || body.model !== undefined) {
      patch.model_id = String(body.model_id || body.model).trim()
    }
    if (body.api_key !== undefined || body.apiKey !== undefined) {
      patch.api_key = String(body.api_key || body.apiKey).trim()
    }
    if (body.auth_type !== undefined || body.authType !== undefined) {
      patch.auth_type = String(body.auth_type || body.authType).trim().toLowerCase()
    }
    if (body.is_default !== undefined || body.isDefault !== undefined) {
      patch.is_default = Boolean(body.is_default ?? body.isDefault)
    }
    if (body.is_enabled !== undefined || body.isEnabled !== undefined) {
      patch.is_enabled = Boolean(body.is_enabled ?? body.isEnabled)
    }

    const updated = await UserLlmConfigModel.update(req.user.id, req.params.configId, patch)
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { message: '配置不存在' },
      })
    }

    res.json({
      success: true,
      data: {
        config: sanitizeUserLlmConfigPayload(updated),
      },
    })
  } catch (error) {
    next(error)
  }
}

export const deleteMyLlmConfig = async (req, res, next) => {
  try {
    const deleted = await UserLlmConfigModel.remove(req.user.id, req.params.configId)
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { message: '配置不存在' },
      })
    }

    res.json({
      success: true,
      data: { id: deleted.id },
    })
  } catch (error) {
    next(error)
  }
}
