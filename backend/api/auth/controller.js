import bcrypt from 'bcryptjs'
import User from '../../models/User.js'
import { generateToken } from '../../middleware/auth.js'

/**
 * 用户注册
 */
export const register = async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email and password are required'
      })
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      })
    }

    // 验证密码长度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      })
    }

    // 检查用户名是否已存在
    const existingUsername = await User.findByUsername(username)
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      })
    }

    // 检查邮箱是否已存在
    const existingEmail = await User.findByEmail(email)
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      })
    }

    // 创建用户
    const user = await User.create({
      username,
      email,
      password,
      role
    })

    // 生成 token
    const token = generateToken(user.id)

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          bio: user.bio
        },
        token
      }
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    })
  }
}

/**
 * 用户登录
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // 验证必填字段
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      })
    }

    // 查找用户
    const user = await User.findByEmail(email)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      })
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      })
    }

    // 生成 token
    const token = generateToken(user.id)

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          bio: user.bio
        },
        token
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      success: false,
      error: 'Login failed'
    })
  }
}

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (req, res) => {
  try {
    const user = req.user

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        created_at: user.created_at
      }
    })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    })
  }
}

/**
 * 更新用户信息
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id
    const { username, bio, avatar } = req.body

    // 如果更新用户名，检查是否已存在
    if (username && username !== req.user.username) {
      const existingUser = await User.findByUsername(username)
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Username already exists'
        })
      }
    }

    const updatedUser = await User.update(userId, {
      username,
      bio,
      avatar
    })

    res.json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    })
  }
}

/**
 * 修改密码
 */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id
    const { currentPassword, newPassword } = req.body

    // 验证必填字段
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      })
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      })
    }

    // 获取用户信息
    const user = await User.findById(userId)

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      })
    }

    // 更新密码
    await User.updatePassword(userId, newPassword)

    res.json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    })
  }
}
