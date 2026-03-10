# OpenCLEW 快速开始指南

## 项目概述

OpenCLEW 是一个 AI Agent 市场平台，连接 Agent 开发者和使用者。

## 当前状态

✅ **已完成**:
- 项目基础架构
- 前端页面 (Agent 市场、详情页)
- 后端 API (基础版本)
- Docker 开发环境
- Agent 包标准格式

🚧 **进行中**:
- 数据库设计
- 用户认证系统
- Agent 上传下载功能

## 快速启动

### 方式一: 开发模式 (推荐) ⭐

只容器化数据库和 Redis，前后端本地运行（热重载更快）

```bash
# 1. 启动基础设施（数据库和 Redis）
docker-compose -f docker-compose.dev.yml up -d

# 2. 启动后端
cd backend
npm install
cp .env.example .env
npm run dev

# 3. 启动前端（新终端）
cd frontend
npm install
npm run dev

# 4. 访问应用
# 前端: http://localhost:3000
# 后端: http://localhost:5000
```

### 方式二: 完整容器化

所有服务都在容器中运行（适合测试部署）

```bash
# 1. 启动所有服务
docker-compose up -d

# 2. 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 3. 访问应用
# 前端: http://localhost:3000
# 后端: http://localhost:5000
```

**推荐使用方式一**，因为：
- ✅ 热重载更快
- ✅ 调试更方便
- ✅ 资源占用更少

## 项目结构

```
clewopen/
├── frontend/          # React 前端应用
│   ├── src/
│   │   ├── pages/    # 页面组件
│   │   ├── components/ # 通用组件
│   │   ├── services/ # API 服务
│   │   └── store/    # Redux 状态管理
│   └── package.json
│
├── backend/           # Node.js 后端服务
│   ├── src/
│   │   ├── api/      # API 路由
│   │   ├── services/ # 业务逻辑
│   │   ├── models/   # 数据模型
│   │   └── middleware/ # 中间件
│   └── package.json
│
├── agent-packages/    # Agent 包示例
│   └── example-agent/ # 小红书文案生成器示例
│
├── docs/              # 文档
│   ├── api/          # API 文档
│   └── developer-guide/ # 开发者指南
│
└── docker-compose.yml # Docker 配置
```

## 核心功能

### 1. Agent 市场
- 浏览和搜索 Agent
- 按分类筛选
- 查看 Agent 详情
- 下载 Agent 包

### 2. Agent 包格式
每个 Agent 包包含:
- `manifest.json`: 元数据和配置
- `agent/`: Agent 核心文件
  - `IDENTITY.md`: 身份定义
  - `RULES.md`: 行为规则
  - `MEMORY.md`: 记忆系统
  - `TOOLS.md`: 工具配置
- `examples/`: 使用案例
- `tests/`: 测试用例

### 3. 安全机制
- 权限声明和控制
- 沙箱隔离运行
- 代码审查
- 用户反馈和举报

## 开发指南

### 前端开发
```bash
cd frontend
npm run dev  # 启动开发服务器
npm run build  # 构建生产版本
npm run lint  # 代码检查
```

### 后端开发
```bash
cd backend
npm run dev  # 启动开发服务器
npm run test  # 运行测试
```

### 创建新的 Agent
参考 `agent-packages/example-agent/` 示例

## API 文档

详细 API 文档请查看: [docs/api/README.md](./docs/api/README.md)

## 下一步计划

1. **数据库实现**
   - 设计数据库 schema
   - 创建迁移脚本
   - 实现数据模型

2. **用户系统**
   - 用户注册和登录
   - JWT 认证
   - 权限管理

3. **Agent 管理**
   - Agent 上传功能
   - Agent 下载功能
   - 版本管理

4. **评价系统**
   - 星级评分
   - 用户评论
   - 评论审核

## 常见问题

### Q: 如何停止所有服务?
```bash
docker-compose down
```

### Q: 如何重置数据库?
```bash
docker-compose down -v  # 删除所有数据卷
docker-compose up -d
```

### Q: 如何查看日志?
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

## 贡献

欢迎贡献代码！请查看 [开发者指南](./docs/developer-guide/README.md)

## 许可证

MIT License
