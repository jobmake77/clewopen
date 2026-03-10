# OpenCLEW API 文档

## 基础信息

- **Base URL**: `http://localhost:5000/api`
- **认证方式**: JWT Bearer Token
- **响应格式**: JSON

## 通用响应格式

### 成功响应
```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "message": "错误信息"
  }
}
```

## Agent 相关接口

### 1. 获取 Agent 列表

**请求**
```
GET /agents
```

**查询参数**
- `page` (number, optional): 页码，默认 1
- `pageSize` (number, optional): 每页数量，默认 20
- `category` (string, optional): 分类筛选
- `search` (string, optional): 搜索关键词

**响应示例**
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "1",
        "name": "小红书文案生成器",
        "description": "专业的小红书文案生成 Agent",
        "category": "内容创作",
        "tags": ["小红书", "文案", "营销"],
        "price": {
          "type": "subscription",
          "amount": 29.9,
          "currency": "CNY",
          "billing_period": "monthly"
        },
        "rating": 4.5,
        "downloads": 1234,
        "reviews_count": 56
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 2. 获取 Agent 详情

**请求**
```
GET /agents/:id
```

**路径参数**
- `id` (string): Agent ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "小红书文案生成器",
    "version": "1.0.0",
    "author": "example_seller",
    "description": "专业的小红书文案生成 Agent",
    "category": "内容创作",
    "tags": ["小红书", "文案", "营销"],
    "price": {
      "type": "subscription",
      "amount": 29.9,
      "currency": "CNY",
      "billing_period": "monthly"
    },
    "rating": 4.5,
    "downloads": 1234,
    "reviews_count": 56,
    "metadata": {
      "created_at": "2026-03-01",
      "updated_at": "2026-03-09"
    }
  }
}
```

### 3. 下载 Agent

**请求**
```
POST /agents/:id/download
```

**路径参数**
- `id` (string): Agent ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "/downloads/agent-1.zip",
    "message": "Download started"
  }
}
```

### 4. 评价 Agent

**请求**
```
POST /agents/:id/rate
```

**路径参数**
- `id` (string): Agent ID

**请求体**
```json
{
  "rating": 5,
  "comment": "非常好用的 Agent！"
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "message": "Rating submitted successfully"
  }
}
```

## 用户相关接口

### 1. 用户注册

**请求**
```
POST /users/register
```

**请求体**
```json
{
  "username": "user123",
  "email": "user@example.com",
  "password": "password123"
}
```

### 2. 用户登录

**请求**
```
POST /users/login
```

**请求体**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "1",
      "username": "user123",
      "email": "user@example.com"
    }
  }
}
```

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
