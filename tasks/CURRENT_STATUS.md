# 当前状态记录

**最后更新**: 2026-03-13
**状态**: Phase 4 完成，文档更新完成

## 📋 已完成的工作

### Phase 4.1: 移除付费系统 ✅ (2026-03-12)

- DB 迁移 007：删除 orders 表 + agents/skills/mcps 的 price 列
- 删除 Order model/controller/routes
- 清理后端所有 price 相关逻辑（Resource.js, Agent.js, resourceUpload.js, manifestValidator.js, syncService.js, fetchExternalData.js）
- 前端移除：购买按钮、价格标签、定价表单

### Phase 4.2: Agent 试用沙盒 ✅ (2026-03-12)

新建文件：
| 文件 | 用途 |
|------|------|
| `backend/migrations/008_create_trial_and_llm_config.sql` | agent_trials + llm_configs 表 |
| `backend/services/llmService.js` | LLM API 调用（自动识别 Anthropic/OpenAI） |
| `backend/utils/agentPackageReader.js` | Agent zip 包文件读取共享工具 |
| `backend/models/AgentTrial.js` | 试用记录 Model |
| `backend/models/LlmConfig.js` | LLM 配置 Model |
| `backend/api/agents/trial.js` | 试用 API endpoint |
| `backend/api/admin/llmConfigRoutes.js` | Admin LLM 配置 CRUD |
| `frontend/src/pages/Admin/LlmSettings.jsx` | Admin LLM 配置页面 |
| `frontend/src/services/trialService.js` | 试用 API 服务 |
| `frontend/src/services/adminLlmService.js` | LLM 配置 API 服务 |

### Phase 3: 首页改版 + 数据源 ✅ (2026-03-12)

- GitHub Search API + OpenClaw 数据自动同步
- 首页统计看板 + Agent/Skill/MCP 三榜单

### Phase 2: 平台丰富 ✅ (2026-03-12)

- Agent 包内容在线预览
- Skill 库 + MCP 库全栈
- Agent 依赖关联
- 定制开发页面

### Phase 1: MVP 基础平台 ✅ (2026-03-11)

- 用户系统（注册/登录/JWT/权限）
- Agent 市场（列表/详情/搜索/下载/评价）
- 管理员审核系统
- 安全加固 + 前端 UX 优化

## 🎯 当前系统状态

### 后端服务
- **地址**: http://localhost:3001
- **启动**: `cd backend && npm run dev`

### 数据库
- **启动**: `docker-compose -f docker-compose.dev.yml up -d`

### 前端应用
- **地址**: http://localhost:5173
- **启动**: `cd frontend && npm run dev`

### Git 状态
- **分支**: main
- **最新提交**: 2dcc17a

## 📝 当前数据库表

| 表名 | 用途 |
|------|------|
| users | 用户（user/developer/admin） |
| agents | Agent 市场 |
| skills | Skill 库 |
| mcps | MCP 库 |
| reviews | 评价（支持 resource_type） |
| downloads | 下载记录 |
| notifications | 通知 |
| custom_orders | 定制开发需求 |
| agent_trials | Agent 试用记录 |
| llm_configs | LLM 服务配置 |

已删除：orders 表、所有 price 相关列

## 🔧 API 路由概览

### 公开路由
- `GET /api/agents` / `GET /api/agents/trending` / `GET /api/agents/platform-stats`
- `GET /api/agents/:id` / `GET /api/agents/:id/preview` / `GET /api/agents/:id/dependencies`
- `GET /api/skills` / `GET /api/mcps` / `GET /api/skills/trending` / `GET /api/mcps/trending`

### 需要认证
- `POST /api/agents/:id/download` / `POST /api/agents/:id/rate`
- `POST /api/agents/:id/trial` / `GET /api/agents/:id/trial/history`
- `POST /api/agents/upload` / `POST /api/skills/upload` / `POST /api/mcps/upload`

### 管理员专用
- `GET/POST /api/admin/llm-configs` + `:id` CRUD
- `GET/POST /api/admin/sync-*`
- `GET/POST /api/agents/admin/*`

## 📚 待完成（后续阶段）

- [ ] 自动化测试系统
- [ ] API 文档 (Swagger)
- [ ] 国际化
- [ ] 云端 Agent 部署
