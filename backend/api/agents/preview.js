import AgentModel from '../../models/Agent.js'
import { extractAgentFiles } from '../../utils/agentPackageReader.js'

/**
 * 获取 Agent 包内容预览
 * 读取 zip 包中的 markdown 文件并返回内容
 */
export const getAgentPreview = async (req, res, next) => {
  try {
    const { id } = req.params

    const agent = await AgentModel.findById(id)
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      })
    }

    const result = await extractAgentFiles(agent.package_url)
    const isPrivileged =
      !!req.user && (req.user.role === 'admin' || req.user.id === agent.author_id)

    if (!isPrivileged) {
      result.memory = null
    }

    res.json({
      success: true,
      data: {
        ...result,
        privacy: {
          memoryVisible: isPrivileged,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}
