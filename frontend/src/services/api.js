import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    // 对于 blob 类型的响应，返回完整的 response 对象
    if (response.config.responseType === 'blob') {
      return response
    }
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除登录状态
      localStorage.removeItem('token')
      localStorage.removeItem('user')

      // 如果不在登录页，跳转到登录页
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    // 统一错误格式，便于前端处理
    if (error.response?.data) {
      // 确保错误信息可以通过多种路径访问
      const errorData = error.response.data
      if (errorData.error && typeof errorData.error === 'object' && !errorData.error.message) {
        // 如果 error 是对象但没有 message，尝试提取有用信息
        error.response.data.error = {
          message: errorData.error.toString(),
          ...errorData.error
        }
      }
    }

    return Promise.reject(error)
  }
)

export default api
