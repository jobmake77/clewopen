import AgentModel from '../../models/Agent.js'
import AgentTrialModel from '../../models/AgentTrial.js'
import { extractAgentFiles } from '../../utils/agentPackageReader.js'
import { callLLM } from '../../services/llmService.js'
import { logger } from '../../config/logger.js'

/**
 * POST /agents/:id/trial
 * 试用 Agent：发送一条消息，获取 LLM 回复
 */
export const trialAgent = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const { message } = req.body

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: '消息内容不能为空' })
    }

    // 验证 Agent 存在且已审核
    const agent = await AgentModel.findById(id)
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent 不存在' })
    }
    if (agent.status !== 'approved') {
      return res.status(403).json({ success: false, error: 'Agent 尚未通过审核' })
    }

    // 检查今日试用次数（基础 3 次 + 管理员补偿）
    const quota = await AgentTrialModel.getDailyQuotaSummary(userId, id)
    if (quota.remainingTrials <= 0) {
      return res.status(429).json({
        success: false,
        error: '今日试用次数已用完',
        remainingTrials: 0,
      })
    }

    // 读取 Agent 配置文件，拼接 system prompt
    let agentFiles
    try {
      agentFiles = await extractAgentFiles(agent.package_url)
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || '无法读取 Agent 配置文件',
      })
    }

    const systemParts = []
    if (agentFiles.identity) systemParts.push(agentFiles.identity)
    if (agentFiles.rules) systemParts.push(agentFiles.rules)
    if (agentFiles.memory) systemParts.push(agentFiles.memory)
    const systemPrompt = systemParts.join('\n\n---\n\n') || `你是 ${agent.name}。${agent.description}`

    // 调用 LLM
    const responseContent = await callLLM(systemPrompt, message.trim())

    // 保存试用记录
    await AgentTrialModel.create({
      user_id: userId,
      agent_id: id,
      message_content: message.trim(),
      response_content: responseContent,
    })

    res.json({
      success: true,
      data: {
        response: responseContent,
        remainingTrials: Math.max(0, quota.remainingTrials - 1),
      },
    })
  } catch (error) {
    logger.error('Trial agent error:', error)
    next(error)
  }
}

/**
 * GET /agents/:id/trial/history
 * 获取当前用户对该 Agent 的试用历史
 */
export const getTrialHistory = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const history = await AgentTrialModel.getHistory(userId, id)
    const quota = await AgentTrialModel.getDailyQuotaSummary(userId, id)

    res.json({
      success: true,
      data: {
        history,
        usedCount: quota.usedCount,
        maxTrials: quota.maxTrials,
        remainingTrials: quota.remainingTrials,
      },
    })
  } catch (error) {
    next(error)
  }
}
