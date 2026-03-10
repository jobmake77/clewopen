import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

/**
 * 验证 JWT Token 中间件
 */
export const authenticate = async (req, res, next) => {
  try {
    // 从 header 中获取 token
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      })
    }

    const token = authHeader.substring(7) // 移除 'Bearer ' 前缀

    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET)

    // 获取用户信息
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      })
    }

    // 将用户信息附加到请求对象
    req.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      })
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      })
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    })
  }
}

/**
 * 可选认证中间件（token 存在则验证，不存在也继续）
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const decoded = jwt.verify(token, JWT_SECRET)
      const user = await User.findById(decoded.userId)

      if (user) {
        req.user = user
      }
    }

    next()
  } catch (error) {
    // 忽略错误，继续处理请求
    next()
  }
}

/**
 * 角色验证中间件
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      })
    }

    next()
  }
}

/**
 * 生成 JWT Token
 */
export const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '7d' } // Token 7 天后过期
  )
}
