# OpenCLEW API 文档

> 定制开发（无支付）最新接口请优先参考：
> - `docs/CUSTOM_ORDER_API_V1.md`
> - `docs/CUSTOM_ORDER_WORKFLOW_V1.md`

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

### 5. 获取安装选项（安装向导）

**请求**
```
GET /agents/:id/install-options
```

**认证**
- 需要登录（Bearer Token）

**响应示例**
```json
{
  "success": true,
  "data": {
    "agentId": "uuid",
    "modes": [
      { "key": "full", "label": "全量安装", "defaultFilesCount": 8 },
      { "key": "enhance", "label": "增强安装", "defaultFilesCount": 6 },
      { "key": "custom", "label": "自选文件", "defaultFilesCount": 0 }
    ],
    "availableFiles": [
      { "path": "agent/IDENTITY.md", "basename": "identity.md", "group": "core" }
    ],
    "defaults": {
      "full": ["agent/IDENTITY.md", "agent/RULES.md"],
      "enhance": ["agent/IDENTITY.md", "agent/RULES.md"],
      "custom": []
    },
    "recommendedMode": "enhance"
  }
}
```

### 6. 安装预检（Dry Run）

**请求**
```
POST /agents/:id/install-preview
```

**认证**
- 需要登录（Bearer Token）

**请求体**
```json
{
  "mode": "custom",
  "selectedFiles": ["agent/RULES.md", "agent/SKILLS.md"]
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "mode": "custom",
    "resolvedFiles": ["agent/RULES.md", "agent/SKILLS.md"],
    "planDetails": {
      "willInstall": ["agent/RULES.md", "agent/SKILLS.md"],
      "skippedByMode": ["agent/MEMORY.md", "agent/SOUL.md"]
    },
    "conflicts": [],
    "missingDependencies": {
      "skills": [],
      "mcps": [],
      "packages": []
    },
    "warnings": [],
    "summary": {
      "selectedCount": 2,
      "conflictsCount": 0,
      "skippedCount": 2,
      "missingDependencyCount": 0
    }
  }
}
```

### 7. 生成安装命令

**请求**
```
POST /agents/:id/install-command
```

**认证**
- 需要登录（Bearer Token）

**请求体**
```json
{
  "mode": "enhance",
  "selectedFiles": [],
  "ttlMinutes": 20
}
```

### 8. 提交安装反馈

**请求**
```
POST /agents/:id/install-feedback
```

**认证**
- 需要登录（Bearer Token）

**请求体**
```json
{
  "mode": "enhance",
  "status": "success",
  "includedFiles": ["agent/RULES.md", "agent/SKILLS.md"],
  "errorMessage": null,
  "metadata": {
    "from": "agent_detail_install_wizard",
    "reason_category": "network"
  }
}
```

**说明**
- `status` 必填：`success | failed`
- 失败时可选传 `errorMessage`

### 9. 获取安装历史

**请求**
```
GET /agents/:id/install-history?limit=8
```

**认证**
- 需要登录（Bearer Token）

**响应示例**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "mode": "enhance",
        "status": "success",
        "included_files": ["agent/RULES.md"],
        "error_message": null,
        "created_at": "2026-03-22T14:30:00.000Z"
      }
    ],
    "summary": {
      "total": 1,
      "successCount": 1,
      "failedCount": 0,
      "lastSuccessAt": "2026-03-22T14:30:00.000Z"
    }
  }
}
```

### 10. 管理端：安装统计汇总

**请求**
```
GET /agents/admin/install-events/summary?recentDays=7
```

**认证**
- 需要管理员权限

**响应要点**
- `totals`: 全量成功/失败统计
- `recentWindowTotals`: 窗口统计
- `recentSuccessRate`: 窗口成功率
- `topFailedAgents`: 失败较多 Agent
- `topFailureReasons`: 失败原因 Top（归一分类：`timeout/network/auth/dependency/validation/storage/permission/other/unknown`）
- `suggestedActions`: 针对归一失败分类的自动修复建议

### 11. 管理端：安装事件列表

**请求**
```
GET /agents/admin/install-events?page=1&pageSize=20&status=failed&mode=enhance&reasonCategory=network&keyword=timeout
```

**认证**
- 需要管理员权限

**筛选参数**
- `status`: `success | failed`
- `mode`: `full | enhance | custom`
- `reasonCategory`: `timeout | network | auth | dependency | validation | storage | permission | other | unknown`
- `keyword`: 匹配 Agent 名称/用户名/失败原因

**返回字段补充**
- `normalized_reason`: 归一失败原因分类（便于聚合运营分析）

**说明**
- `mode` 可选：`full | enhance | custom`
- `selectedFiles` 仅 `custom` 模式必填
- 兼容旧调用：不传 `mode` 时默认 `full`

**响应示例**
```json
{
  "success": true,
  "data": {
    "agentId": "uuid",
    "mode": "enhance",
    "includedFiles": ["agent/RULES.md", "agent/SKILLS.md"],
    "publishMode": "open",
    "expiresAt": "2026-03-22T14:00:00.000Z",
    "maxUses": 3,
    "installCommand": "openclew install \"https://example.com/api/agents/install/.../download\" --mode enhance --include \"agent/RULES.md,agent/SKILLS.md\"",
    "downloadUrl": "https://example.com/api/agents/install/.../download",
    "downloadCommand": "curl -fL \"https://example.com/api/agents/install/.../download\" -o \"agent-1.0.0.zip\"",
    "warnings": [],
    "installHint": "建议优先通过安装命令进行标准化安装"
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
