# 认证系统实现总结

## 已完成工作

### 1. 依赖安装
- ✅ bcryptjs - 密码加密
- ✅ jsonwebtoken - JWT Token 生成和验证

### 2. 认证中间件 (`middleware/auth.js`)
- ✅ `authenticate` - 验证 JWT Token
- ✅ `optionalAuth` - 可选认证（Token 存在则验证）
- ✅ `authorize` - 角色权限验证
- ✅ `generateToken` - 生成 JWT Token

### 3. 认证 API (`api/auth/`)
- ✅ `POST /api/auth/register` - 用户注册
- ✅ `POST /api/auth/login` - 用户登录
- ✅ `GET /api/auth/me` - 获取当前用户信息
- ✅ `PUT /api/auth/profile` - 更新用户资料
- ✅ `PUT /api/auth/password` - 修改密码

### 4. User 模型更新
- ✅ `findByEmail` - 通过邮箱查找用户
- ✅ `findByUsername` - 通过用户名查找用户
- ✅ `findById` - 通过 ID 查找用户
- ✅ `create` - 创建用户（自动加密密码）
- ✅ `update` - 更新用户信息
- ✅ `updatePassword` - 更新密码
- ✅ `verifyPassword` - 验证密码

### 5. Agent API 集成认证
- ✅ 下载功能需要登录
- ✅ 评价功能需要登录
- ✅ 自动记录用户 ID

### 6. 文档
- ✅ `docs/api/AUTH.md` - 完整的认证 API 文档

## 功能特性

### 安全性
- 密码使用 bcrypt 加密（10 轮 salt）
- JWT Token 7 天过期
- Token 验证中间件
- 角色权限控制

### 验证
- 邮箱格式验证
- 密码长度验证（最少 6 位）
- 用户名和邮箱唯一性检查
- 当前密码验证（修改密码时）

### 用户角色
- `user` - 普通用户
- `developer` - 开发者（可上传 Agent）
- `admin` - 管理员

## API 使用示例

### 1. 注册新用户

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "testuser",
      "email": "test@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. 登录

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. 获取当前用户信息

```bash
TOKEN="your_token_here"

curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 4. 下载 Agent（需要认证）

```bash
curl -X POST http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/download \
  -H "Authorization: Bearer $TOKEN"
```

### 5. 评价 Agent（需要认证）

```bash
curl -X POST http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/rate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "非常好用！"
  }'
```

## 测试账号

数据库迁移已创建以下测试账号（密码均为 `password123`）：

| 用户名 | 邮箱 | 角色 | 用途 |
|--------|------|------|------|
| admin | admin@clewopen.com | admin | 管理员 |
| developer1 | dev1@example.com | developer | 开发者 1 |
| developer2 | dev2@example.com | developer | 开发者 2 |
| user1 | user1@example.com | user | 普通用户 |

## 前端集成指南

### 1. 创建认证服务

```javascript
// src/services/authService.js
import api from './api'

export const authService = {
  // 注册
  async register(username, email, password) {
    const response = await api.post('/auth/register', {
      username,
      email,
      password
    })

    if (response.data.success) {
      // 保存 token 和用户信息
      localStorage.setItem('token', response.data.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.data.user))
    }

    return response.data
  },

  // 登录
  async login(email, password) {
    const response = await api.post('/auth/login', {
      email,
      password
    })

    if (response.data.success) {
      localStorage.setItem('token', response.data.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.data.user))
    }

    return response.data
  },

  // 登出
  logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },

  // 获取当前用户
  async getCurrentUser() {
    const response = await api.get('/auth/me')
    return response.data
  },

  // 获取 token
  getToken() {
    return localStorage.getItem('token')
  },

  // 获取用户信息
  getUser() {
    const user = localStorage.getItem('user')
    return user ? JSON.parse(user) : null
  },

  // 检查是否登录
  isAuthenticated() {
    return !!this.getToken()
  }
}
```

### 2. 配置 Axios 拦截器

```javascript
// src/services/api.js
import axios from 'axios'
import { authService } from './authService'

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 10000
})

// 请求拦截器 - 自动添加 token
api.interceptors.request.use(
  (config) => {
    const token = authService.getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理 401 错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除登录状态
      authService.logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
```

### 3. 创建 Redux Slice

```javascript
// src/store/slices/authSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authService } from '../../services/authService'

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }) => {
    const response = await authService.login(email, password)
    return response.data
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async ({ username, email, password }) => {
    const response = await authService.register(username, email, password)
    return response.data
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: authService.getUser(),
    token: authService.getToken(),
    isAuthenticated: authService.isAuthenticated(),
    loading: false,
    error: null
  },
  reducers: {
    logout: (state) => {
      authService.logout()
      state.user = null
      state.token = null
      state.isAuthenticated = false
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
        state.isAuthenticated = true
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  }
})

export const { logout } = authSlice.actions
export default authSlice.reducer
```

### 4. 创建登录页面

```jsx
// src/pages/Login.jsx
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, message } from 'antd'
import { login } from '../store/slices/authSlice'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await dispatch(login(values)).unwrap()
      message.success('登录成功')
      navigate('/')
    } catch (error) {
      message.error('登录失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <h1>登录</h1>
      <Form onFinish={onFinish}>
        <Form.Item
          name="email"
          rules={[{ required: true, type: 'email', message: '请输入有效的邮箱' }]}
        >
          <Input placeholder="邮箱" />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password placeholder="密码" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
```

## 环境变量配置

确保 `.env` 文件包含以下配置：

```env
# JWT
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clewopen
DB_USER=postgres
DB_PASSWORD=postgres
```

## 下一步工作

1. ✅ 认证系统实现完成
2. ⏭️ 前端集成登录和注册页面
3. ⏭️ 前端集成下载和评价功能
4. ⏭️ 实现 Agent 上传功能
5. ⏭️ 添加用户中心页面

## 相关文档

- [认证 API 文档](./api/AUTH.md)
- [数据库设置指南](./DATABASE_SETUP.md)
- [测试指南](./TESTING_GUIDE.md)
