import UserModel from '../../models/User.js'
import AgentModel from '../../models/Agent.js'
import AgentTrialModel from '../../models/AgentTrial.js'

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
