import UserModel from '../../models/User.js'

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
