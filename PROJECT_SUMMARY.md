# OpenCLEW 项目实施总结

## 项目概述

OpenCLEW 是一个开源的 AI Agent 能力平台，提供 Agent 的标准化打包、市场分发和在线试用能力，同时提供 Skill/MCP 的生态目录聚合、上传和发现服务。

## 已完成的工作

### 1. 项目架构 ✅

#### 前端 (React 18 + Vite)
- ✅ Ant Design UI 框架
- ✅ Redux Toolkit 状态管理
- ✅ React Router 路由
- ✅ Axios HTTP 客户端
- ✅ 页面组件：
  - 首页（统计看板 + 三榜单）
  - Agent 市场/详情/上传
  - Skill 市场/详情/上传
  - MCP 市场/详情/上传
  - 定制开发页面
  - 用户中心
  - 管理员控制台（审核、数据同步、LLM 配置）
  - 登录/注册

#### 后端 (Node.js + Express)
- ✅ PostgreSQL + Redis（Docker 容器）
- ✅ JWT 认证 + 角色权限控制
- ✅ Winston 日志 + Morgan 请求日志
- ✅ Multer 文件上传
- ✅ express-rate-limit 速率限制
- ✅ 审计日志中间件

### 2. 核心功能 ✅

| 功能 | 状态 | 说明 |
|------|------|------|
| Agent 市场 | ✅ | 列表、搜索、分类、详情、下载、评价 |
| Agent 试用沙盒 | ✅ | LLM 驱动，每用户每 Agent 3 次 |
| Agent 包预览 | ✅ | 在线预览 zip 包中的 markdown |
| Agent 依赖关联 | ✅ | Skill/MCP 依赖卡片跳转 |
| Skill 库 | ✅ | 市场/详情/上传 + 管理员审核 + 外部目录模型 |
| MCP 库 | ✅ | 市场/详情/上传 + 管理员审核 + 外部目录模型 |
| 定制开发 | ✅ | 需求提交与列表 |
| 管理员审核 | ✅ | Agent/评价审核（单个 + 批量） |
| LLM 配置管理 | ✅ | CRUD + 激活（支持 Anthropic/OpenAI） |
| 数据同步 | ✅ | GitHub + OpenClaw 自动同步 |
| 通知系统 | ✅ | 站内信 + Header 铃铛 |

### 3. 数据库 ✅

当前 10 张表：
- `users` — 用户（user/developer/admin）
- `agents` — Agent 市场
- `skills` — Skill 库
- `mcps` — MCP 库
- `reviews` — 评价（支持 resource_type）
- `downloads` — 下载记录
- `notifications` — 通知
- `custom_orders` — 定制开发需求
- `agent_trials` — Agent 试用记录
- `llm_configs` — LLM 服务配置
- `resource_visits` — Skill/MCP 外部资源访问记录

已删除：orders 表、所有 price 相关列（项目开源，不涉及付费）

## 项目结构

```
clewopen/
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── pages/           # 页面组件（12+ 页面）
│   │   ├── components/      # 通用组件
│   │   ├── services/        # API 服务
│   │   ├── store/           # Redux 状态管理
│   │   └── utils/           # 工具函数
│   └── package.json
├── backend/                  # Node.js 后端
│   ├── src/index.js         # 入口文件
│   ├── api/                 # API 路由
│   │   ├── agents/          # Agent API
│   │   ├── skills/          # Skill API
│   │   ├── mcps/            # MCP API
│   │   ├── admin/           # 管理员 API
│   │   ├── notifications/   # 通知 API
│   │   ├── custom-orders/   # 定制开发 API
│   │   └── shared/          # 共享逻辑
│   ├── models/              # 数据模型
│   ├── services/            # 业务逻辑（LLM、同步）
│   ├── middleware/          # 中间件
│   ├── utils/               # 工具函数
│   └── migrations/          # 数据库迁移（001-009）
├── agent-packages/           # Agent 示例
├── scripts/                  # 工具脚本
├── docs/                     # 文档
└── docker-compose.dev.yml    # 开发环境配置
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18 + Vite |
| UI 库 | Ant Design 5 |
| 状态管理 | Redux Toolkit |
| 路由 | React Router 6 |
| HTTP 客户端 | Axios |
| 后端运行时 | Node.js 20+ |
| Web 框架 | Express |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis |
| 认证 | JWT |
| 日志 | Winston + Morgan |
| 文件上传 | Multer |
| 容器 | Docker & Docker Compose |

## 如何启动

```bash
# 1. 启动数据库
docker-compose -f docker-compose.dev.yml up -d

# 2. 运行迁移
docker exec -i clewopen-postgres psql -U postgres -d clewopen < backend/migrations/008_create_trial_and_llm_config.sql

# 3. 启动后端
cd backend && npm install && npm run dev

# 4. 启动前端
cd frontend && npm install && npm run dev
```

访问：
- 前端: http://localhost:5173
- 后端: http://localhost:3001

## 下一步工作

### Phase 5: 待规划
- 自动化测试系统
- API 文档 (Swagger)
- 国际化
- 云端 Agent 部署

## Skill / MCP 新语义

- `uploaded`：开发者上传到平台的本地资源，支持平台内下载
- `external`：从 GitHub/OpenClaw 等外部来源同步的目录资源，详情页展示并跳转原始链接
- 所有 Skill/MCP 列表项统一先进入平台详情页，再根据来源显示“下载资源”或“查看源码”
