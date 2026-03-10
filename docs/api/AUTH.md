# 认证 API 文档

## 概述

认证系统使用 JWT (JSON Web Token) 实现，支持用户注册、登录、个人信息管理等功能。

## 认证流程

1. 用户注册或登录
2. 服务器返回 JWT Token
3. 客户端在后续请求中携带 Token
4. 服务器验证 Token 并返回数据

## API 端点

### 1. 用户注册

**POST** `/api/auth/register`

注册新用户账号。

**请求体**:
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "role": "user"  // 可选: user, developer, admin
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "testuser",
      "email": "test@example.com",
      "role": "user",
      "avatar": null,
      "bio": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**错误响应**:
- `400` - 缺少必填字段
- `400` - 邮箱格式无效
- `400` - 密码长度不足（最少 6 位）
- `400` - 用户名已存在
- `400` - 邮箱已存在

### 2. 用户登录

**POST** `/api/auth/login`

使用邮箱和密码登录。

**请求体**:
```json
{
  "email": "test@example.com",
  "password": "password123"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "testuser",
      "email": "test@example.com",
      "role": "user",
      "avatar": null,
      "bio": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**错误响应**:
- `400` - 缺少必填字段
- `401` - 邮箱或密码错误

### 3. 获取当前用户信息

**GET** `/api/auth/me`

获取当前登录用户的信息。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user",
    "avatar": null,
    "bio": null,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**错误响应**:
- `401` - Token 缺失或无效
- `401` - Token 已过期

### 4. 更新用户资料

**PUT** `/api/auth/profile`

更新当前用户的个人资料。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "username": "newusername",  // 可选
  "bio": "这是我的个人简介",  // 可选
  "avatar": "https://example.com/avatar.jpg"  // 可选
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "newusername",
    "email": "test@example.com",
    "role": "user",
    "avatar": "https://example.com/avatar.jpg",
    "bio": "这是我的个人简介"
  }
}
```

**错误响应**:
- `400` - 用户名已存在
- `401` - 未认证

### 5. 修改密码

**PUT** `/api/auth/password`

修改当前用户的密码。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**响应**:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**错误响应**:
- `400` - 缺少必填字段
- `400` - 新密码长度不足
- `401` - 当前密码错误
- `401` - 未认证

## 使用示例

### 注册新用户

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 登录

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 获取当前用户信息

```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 更新资料

```bash
curl -X PUT http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "我是一名开发者"
  }'
```

### 修改密码

```bash
curl -X PUT http://localhost:5000/api/auth/password \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "password123",
    "newPassword": "newpassword456"
  }'
```

## 前端集成

### React 示例

```javascript
// 登录
const login = async (email, password) => {
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (data.success) {
    // 保存 token
    localStorage.setItem('token', data.data.token);
    // 保存用户信息
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }

  return data;
};

// 获取当前用户
const getCurrentUser = async () => {
  const token = localStorage.getItem('token');

  const response = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return await response.json();
};

// 下载 Agent（需要认证）
const downloadAgent = async (agentId) => {
  const token = localStorage.getItem('token');

  const response = await fetch(`http://localhost:5000/api/agents/${agentId}/download`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return await response.json();
};
```

## 安全建议

1. **Token 存储**:
   - 使用 `localStorage` 或 `sessionStorage` 存储 Token
   - 不要在 URL 中传递 Token
   - 考虑使用 HttpOnly Cookie（需要后端配置）

2. **Token 刷新**:
   - Token 默认 7 天过期
   - 可以实现 Token 刷新机制延长会话

3. **密码安全**:
   - 密码使用 bcrypt 加密存储
   - 最少 6 位字符
   - 建议使用强密码策略

4. **HTTPS**:
   - 生产环境必须使用 HTTPS
   - 防止 Token 被中间人攻击窃取

## 错误代码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

## 测试账号

迁移脚本已创建以下测试账号（密码均为 `password123`）：

| 用户名 | 邮箱 | 角色 |
|--------|------|------|
| admin | admin@clewopen.com | admin |
| developer1 | dev1@example.com | developer |
| developer2 | dev2@example.com | developer |
| user1 | user1@example.com | user |
