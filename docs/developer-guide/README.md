# OpenCLEW 开发者指南

## 目录
1. [快速开始](#快速开始)
2. [Agent 开发](#agent-开发)
3. [API 集成](#api-集成)
4. [测试](#测试)
5. [部署](#部署)

## 快速开始

### 环境要求
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### 本地开发

1. **克隆项目**
```bash
git clone https://github.com/yourusername/clewopen.git
cd clewopen
```

2. **启动开发环境**
```bash
# 使用 Docker Compose 启动所有服务
docker-compose up -d

# 或者手动启动各个服务
# 启动数据库和 Redis
docker-compose up -d postgres redis

# 启动后端
cd backend
npm install
cp .env.example .env
npm run dev

# 启动前端
cd ../frontend
npm install
npm run dev
```

3. **访问应用**
- 前端: http://localhost:3000
- 后端 API: http://localhost:5000
- API 文档: http://localhost:5000/api-docs

## Agent 开发

### Agent 包结构

一个标准的 Agent 包包含以下文件：

```
agent-package/
├── manifest.json          # 元数据
├── agent/                 # Agent 核心文件
│   ├── IDENTITY.md       # 身份定义
│   ├── RULES.md          # 行为规则
│   ├── MEMORY.md         # 记忆系统
│   └── TOOLS.md          # 工具配置
├── examples/              # 使用案例
└── tests/                 # 测试用例
```

### manifest.json 规范

```json
{
  "name": "Agent 名称",
  "version": "1.0.0",
  "author": "作者 ID",
  "description": "Agent 描述",
  "category": "分类",
  "tags": ["标签1", "标签2"],
  "price": {
    "type": "subscription",
    "amount": 29.9,
    "currency": "CNY",
    "billing_period": "monthly"
  },
  "permissions": {
    "filesystem": {
      "read": ["./workspace/*"],
      "write": ["./output/*"]
    },
    "network": {
      "allowed_domains": ["api.example.com"],
      "max_requests_per_minute": 100
    },
    "tools": ["bash", "python"],
    "dangerous_operations": []
  }
}
```

### 开发流程

1. **创建 Agent 包**
```bash
mkdir my-agent
cd my-agent
```

2. **编写 manifest.json**
按照规范定义 Agent 的元数据和权限

3. **编写 Agent 核心文件**
- IDENTITY.md: 定义 Agent 的角色和特质
- RULES.md: 定义 Agent 的行为规则
- MEMORY.md: 定义记忆系统
- TOOLS.md: 定义可用工具

4. **添加使用案例**
在 examples/ 目录下添加实际使用案例

5. **编写测试**
在 tests/ 目录下编写测试用例

6. **本地测试**
```bash
# 使用测试工具验证 Agent
clewopen test my-agent
```

7. **打包上传**
```bash
# 打包 Agent
clewopen package my-agent

# 上传到平台
clewopen upload my-agent.zip
```

## API 集成

### 认证

所有需要认证的 API 请求都需要在 Header 中包含 JWT Token：

```javascript
const token = localStorage.getItem('token')
const response = await fetch('/api/agents', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### 错误处理

```javascript
try {
  const response = await fetch('/api/agents')
  const data = await response.json()

  if (!data.success) {
    throw new Error(data.error.message)
  }

  return data.data
} catch (error) {
  console.error('API Error:', error)
}
```

## 测试

### 前端测试
```bash
cd frontend
npm run test
```

### 后端测试
```bash
cd backend
npm run test
```

### E2E 测试
```bash
npm run test:e2e
```

## 部署

### 生产环境部署

1. **构建前端**
```bash
cd frontend
npm run build
```

2. **构建后端**
```bash
cd backend
npm run build
```

3. **使用 Docker 部署**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 环境变量配置

生产环境需要配置以下环境变量：

```bash
NODE_ENV=production
PORT=5000
DB_HOST=your-db-host
DB_PASSWORD=your-secure-password
JWT_SECRET=your-secure-jwt-secret
REDIS_HOST=your-redis-host
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

MIT License
