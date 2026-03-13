# OpenCLEW 当前状态文档

**更新时间**: 2026-03-13
**Git 分支**: main

---

## 系统架构概览

```
Frontend (React 18 + Vite)  →  Backend (Express + Node.js)  →  PostgreSQL + Redis
    :5173                          :3001                         Docker containers
```

## 最近完成的工作

### Phase 4.3: Skill / MCP 目录模型重构 ✅ (2026-03-13)

**改动概要**：Skill / MCP 不再统一视为平台本地可下载包，而是区分为 `uploaded`（平台上传）和 `external`（GitHub/OpenClaw 外部资源）两类。

- DB 迁移 009：新增 `source_type`、`external_url`、`source_platform`、`source_id`、`last_synced_at`
- 新建 `resource_visits` 表，用于记录外部资源访问次数
- Skill / MCP 同步逻辑改为写入 `external_url`，不再把外链塞入 `package_url`
- Skill / MCP 下载接口：外部资源返回 `EXTERNAL_RESOURCE`
- 新增 `POST /api/skills/:id/visit`、`POST /api/mcps/:id/visit`
- 前端新增 `/skills/:id` 和 `/mcps/:id` 详情页路由
- 列表页与首页榜单统一先进入详情页，再按来源显示“查看源码”或“下载资源”
- Admin 同步页新增来源拆分统计

### Phase 4.1: 移除付费系统 ✅ (2026-03-12)

**改动概要**：项目开源，只有 CustomOrder 涉及金钱，其他所有价格/购买相关代码完全移除。

- DB 迁移 007：删除 orders 表 + agents/skills/mcps 的 price 列
- 删除 Order model/controller/routes
- 清理 Agent.js、Resource.js、resourceUpload.js、manifestValidator.js 中的 price 逻辑
- 清理 syncService.js、fetchExternalData.js 中的 INSERT price 列
- 前端移除：购买按钮、价格标签、定价表单、ShoppingCartOutlined 等

### Phase 4.2: Agent 试用沙盒 ✅ (2026-03-12)

**改动概要**：用户可在下载前"试用" Agent，系统加载 Agent 配置文件作为 system prompt，调用管理员配置的 LLM API 生成回复，每用户每 Agent 限 3 次。

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

---

## 当前数据库表

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
| agent_trials | Agent 试用记录（新） |
| llm_configs | LLM 服务配置（新） |
| resource_visits | Skill/MCP 外部资源访问记录（新） |

已删除：orders 表、所有 price 相关列

---

## API 路由概览

### 公开路由
- `GET /api/agents` — Agent 列表
- `GET /api/agents/trending` — 热门 Agent
- `GET /api/agents/platform-stats` — 平台统计
- `GET /api/agents/:id` — Agent 详情
- `GET /api/agents/:id/preview` — Agent 包内容预览
- `GET /api/agents/:id/dependencies` — Agent 依赖
- `GET /api/skills` / `GET /api/mcps` — Skill/MCP 列表
- `GET /api/skills/:id` / `GET /api/mcps/:id` — Skill/MCP 详情
- `POST /api/skills/:id/visit` / `POST /api/mcps/:id/visit` — 记录外部资源访问

### 需要认证
- `POST /api/agents/:id/download` — 下载
- `POST /api/agents/:id/rate` — 评价
- `POST /api/agents/:id/trial` — 试用 Agent（新）
- `GET /api/agents/:id/trial/history` — 试用历史（新）
- `POST /api/agents/upload` — 上传 Agent
- `POST /api/skills/:id/download` / `POST /api/mcps/:id/download` — 仅平台上传资源可下载

### 管理员专用
- `GET /api/admin/llm-configs` — LLM 配置列表（新）
- `POST /api/admin/llm-configs` — 新建 LLM 配置（新）
- `PUT /api/admin/llm-configs/:id` — 更新（新）
- `POST /api/admin/llm-configs/:id/activate` — 激活（新）
- `DELETE /api/admin/llm-configs/:id` — 删除（新）
- `GET/POST /api/admin/sync-*` — 数据同步
- `GET/POST /api/agents/admin/*` — Agent 审核

---

## 快速启动

```bash
# 1. 启动数据库
docker-compose -f docker-compose.dev.yml up -d

# 2. 运行新迁移（如果还没运行）
docker exec -i clewopen-postgres psql -U postgres -d clewopen < backend/migrations/007_remove_pricing_and_orders.sql
docker exec -i clewopen-postgres psql -U postgres -d clewopen < backend/migrations/008_create_trial_and_llm_config.sql
docker exec -i clewopen-postgres psql -U postgres -d clewopen < backend/migrations/009_refactor_skill_mcp_source_model.sql

# 3. 启动后端
cd backend && npm run dev

# 4. 启动前端
cd frontend && npm run dev
```

## 使用 Agent 试用功能

1. 管理员登录 → 管理控制台 → LLM 配置 Tab
2. 新增 LLM 配置（填写 provider、API URL、API Key、Model ID）→ 点击"激活"
3. 用户访问已审核 Agent 详情页 → 点击"试用 Agent" → 发送消息
4. 每用户每 Agent 限 3 次试用

## Skill / MCP 当前产品语义

- `uploaded`：平台托管的资源包，详情页显示“下载 Skill/MCP”
- `external`：平台聚合的外部资源目录项，详情页显示“查看源码”
- 首页榜单、列表页和详情页已统一使用内部详情路由
