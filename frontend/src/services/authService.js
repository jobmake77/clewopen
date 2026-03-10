import api from './api'

/**
 * 认证服务
 */
const authService = {
  /**
   * 用户注册
   */
  async register(username, email, password, role = 'user') {
    const response = await api.post('/auth/register', {
      username,
      email,
      password,
      role
    })

    if (response.success) {
      // 保存 token 和用户信息
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
    }

    return response
  },

  /**
   * 用户登录
   */
  async login(email, password) {
    const response = await api.post('/auth/login', {
      email,
      password
    })

    if (response.success) {
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
    }

    return response
  },

  /**
   * 用户登出
   */
  logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    const response = await api.get('/auth/me')
    return response
  },

  /**
   * 更新用户资料
   */
  async updateProfile(data) {
    const response = await api.put('/auth/profile', data)

    if (response.success) {
      // 更新本地存储的用户信息
      localStorage.setItem('user', JSON.stringify(response.data))
    }

    return response
  },

  /**
   * 修改密码
   */
  async changePassword(currentPassword, newPassword) {
    const response = await api.put('/auth/password', {
      currentPassword,
      newPassword
    })

    return response
  },

  /**
   * 获取 token
   */
  getToken() {
    return localStorage.getItem('token')
  },

  /**
   * 获取用户信息
   */
  getUser() {
    const user = localStorage.getItem('user')
    return user ? JSON.parse(user) : null
  },

  /**
   * 检查是否已登录
   */
  isAuthenticated() {
    return !!this.getToken()
  }
}

export default authService
