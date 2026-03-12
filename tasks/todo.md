# OpenCLEW 垂直化能力平台 - 任务清单

## Phase 1: 基础平台 (MVP) - ✅ 已完成

### 项目初始化
- [x] 创建项目目录结构
- [x] 设置前端项目 (React + Vite)
- [x] 设置后端项目 (Node.js + Express)
- [x] 配置 Docker 开发环境
- [x] 配置数据库 (PostgreSQL)
- [x] 配置 Redis 缓存

### 用户系统
- [x] 用户注册和登录 API
- [x] JWT 认证中间件
- [x] 用户权限管理
- [x] 用户资料管理 API
- [x] 前端登录注册页面
- [x] 前端认证状态管理
- [x] 前端用户中心页面

### Agent 市场
- [x] Agent 列表展示
- [x] Agent 搜索功能
- [x] Agent 分类浏览（中英映射修复）
- [x] Agent 详情页面
- [x] Agent 下载功能
- [x] Agent 评价功能

### 管理员系统
- [x] Agent 审核（单个 + 批量）
- [x] 评价审核
- [x] 管理员仪表盘

## 项目完善 - ✅ 已完成 (2026-03-12)

### Phase A: P0 - 关键 Bug 修复与安全加固 ✅
- [x] A1. 修复后端路由顺序 Bug - admin 路由移到 /:id 之前
- [x] A2. 修复 SQL 注入 - getTrending 改用参数化查询
- [x] A3. 修复前端导航路由 Bug
- [x] A4. 修复下载功能 Blob 处理
- [x] A5. 添加 API 速率限制 (express-rate-limit)
- [x] A6. 修复 CORS 配置
- [x] A7. 修复前端分类名映射

### Phase B: P1 - 前端 UX 优化 ✅
- [x] B1. ErrorBoundary + 各页面 loading 状态 + 文件大小验证
- [x] B2. 确认对话框（React state 替代 document.getElementById）
- [x] B3. Agent 状态标签 + 拒绝原因显示 + 重新提交入口
- [x] B4. 404 页面 + ProtectedRoute 路由守卫
- [x] B5. 移除冗余 userSlice

### Phase C: P1 - 后端优化 ✅
- [x] C1. 审计日志中间件
- [x] C2. 完善 .env 配置
- [x] C3. 请求日志 (morgan + winston)
- [x] C4. Review 更新逻辑确认

### Phase D: P2 - 新功能开发 ✅
- [x] D1. 模拟支付系统 (Order model + API + 前端购买按钮)
- [x] D2. 批量审核功能 (后端 + 前端批量选择 UI)
- [x] D3. 通知系统（站内信 + Header 通知铃铛 + 自动通知）
- [x] D4. 管理员统计仪表盘

### 额外修复
- [x] MarketPlace/AgentDetail 字段名修正 (rating_average, downloads_count, price_amount)
- [x] Admin 页面冗余 import 清理
- [x] ProtectedRoute 统一权限管理

## 新增文件
- `frontend/src/components/ErrorBoundary.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `backend/middleware/auditLog.js`
- `backend/models/Order.js`
- `backend/models/Notification.js`
- `backend/api/orders/routes.js` + `controller.js`
- `backend/api/notifications/routes.js` + `controller.js`
- `backend/migrations/004_create_notifications_table.sql`

## 新增依赖
- `express-rate-limit` - API 速率限制
- `morgan` - HTTP 请求日志

## Phase 2: 平台丰富 - ✅ 已完成 (2026-03-12)

### Phase 2.1: Agent 包内容在线预览 ✅
- [x] 后端 preview API（读取 zip 包中的 markdown 文件）
- [x] 前端 AgentDetail 新增 "包内容" Tab（Collapse + react-markdown）

### Phase 2.2: Skill 库（全栈）✅
- [x] 数据库迁移（skills 表 + 更新 reviews/downloads 表支持 resource_type）
- [x] 通用 Resource Model / Controller / Upload 工厂
- [x] Skill 后端路由（CRUD + 管理员审核）
- [x] Skill 前端（市场/详情/上传页 + Redux slice + service）

### Phase 2.3: MCP 库（全栈）✅
- [x] MCP 数据库表（与 Skill 共用迁移文件）
- [x] MCP 后端路由
- [x] MCP 前端（市场/详情/上传页 + Redux slice + service）

### Phase 2.4: 依赖关联 ✅
- [x] 后端 getAgentDependencies API
- [x] 前端 AgentDetail 新增 "依赖" Tab（Skill/MCP 卡片跳转）

### Phase 2.5: 定制开发页 ✅
- [x] custom_orders 数据库表
- [x] 后端 CRUD API
- [x] 前端需求提交表单 + 需求列表展示

### Phase 2.6: 导航更新 ✅
- [x] Header 导航菜单：Agent 市场 | Skill 库 | MCP 库 | 定制开发
- [x] 上传按钮改为下拉菜单：发布 Agent / Skill / MCP
- [x] App.jsx 路由注册

## 新增文件（Phase 2）
- `backend/models/Resource.js` — 通用资源 Model 工厂
- `backend/models/Skill.js` / `Mcp.js` / `CustomOrder.js`
- `backend/api/shared/resourceController.js` / `resourceUpload.js`
- `backend/api/skills/routes.js` / `mcps/routes.js` / `custom-orders/routes.js`
- `backend/api/agents/preview.js`
- `backend/migrations/005_create_skills_and_mcps.sql`
- `backend/utils/manifestValidator.js` — 新增 validateResourcePackage()
- `frontend/src/pages/SkillMarket/` / `SkillDetail/` / `UploadSkill/`
- `frontend/src/pages/McpMarket/` / `McpDetail/` / `UploadMcp/`
- `frontend/src/services/skillService.js` / `mcpService.js` / `customOrderService.js`
- `frontend/src/store/slices/skillSlice.js` / `mcpSlice.js`

## 新增依赖（Phase 2）
- `react-markdown` — Agent 包内容 markdown 渲染

## Phase 3: 首页改版 + 数据源优化 - ✅ 已完成 (2026-03-12)

### Phase 3.1: 数据源切换 — GitHub Search API ✅
- [x] DB 迁移 006_add_github_fields.sql（github_stars, github_url, author_avatar_url）
- [x] 重写 syncService.js — 切换到 GitHub Search API（MCP 6 查询 + Skill 8 查询）
- [x] Resource.js — 增加 stars 排序、getTrending 按 github_stars DESC

### Phase 3.2: 首页改版 ✅
- [x] 新增 /agents/platform-stats API（统计 Agent/User/Skill/MCP 数量 + 分类分布）
- [x] agentService.js + agentSlice.js — 新增 trending + stats state/thunks
- [x] 重写 MarketPlace/index.jsx — 统计看板 + 分类分布 + Agent/Skill/MCP 三个榜单 + 悬赏榜
- [x] SkillMarket / McpMarket — 移除榜单（已迁至首页），新增 stars 排序选项

### Phase 3.3: 卡片样式优化 ✅
- [x] ResourceCard.jsx — Skill/MCP 显示作者头像+GitHub 星数，去掉"免费"/"by system"
- [x] RankingBoard.jsx — Skill/MCP 显示作者头像+GitHub 星数（替代 ScoreBadge+评分）

## Phase 3.4: 新增 openclaw/skills 数据源 ✅
- [x] 新增 fetchOpenclawSkills() — 从 openclaw/skills 仓库获取 skill 数据
- [x] 新增 upsertOpenclawSkills() — 写入 DB（slug 前缀 openclaw-，source: openclaw）
- [x] runSync() 集成 openclaw 同步，记录 openclawFetched/Inserted/Updated
- [x] 分页策略：每次同步 50 个用户目录，内存偏移量跨同步推进
- [x] 速率限制：1 次 Contents API 取用户列表 + 50 次取子目录 + raw URL 取文件（不消耗配额）

## Phase 4: 移除付费系统 + Agent 试用沙盒 - ✅ 已完成 (2026-03-12)

### Phase 4.1: 移除付费系统 ✅
- [x] DB 迁移 007 — 删除 orders 表 + agents/skills/mcps 的 price 列
- [x] 删除 Order 系统（model/controller/routes）
- [x] Agent.js / Resource.js — create() 去掉 price 字段
- [x] resourceUpload.js — 去掉 price 解析
- [x] manifestValidator.js — 删除 validatePrice()，去掉 price 校验
- [x] syncService.js / fetchExternalData.js — INSERT 语句去掉 price 列
- [x] 前端：ResourceCard 删价格标签，AgentDetail 删购买按钮
- [x] 前端：UploadAgent 删定价表单，UploadMcp/UploadSkill 删 price append
- [x] 前端：SkillDetail/McpDetail 删价格显示，AgentReview 删价格 Descriptions.Item

### Phase 4.2: Agent 试用沙盒 ✅
- [x] DB 迁移 008 — 创建 agent_trials + llm_configs 表
- [x] backend/services/llmService.js — LLM API 调用（自动识别 Anthropic/OpenAI）
- [x] backend/utils/agentPackageReader.js — Agent zip 文件读取共享工具
- [x] backend/models/AgentTrial.js + LlmConfig.js
- [x] backend/api/agents/trial.js — POST /:id/trial + GET /:id/trial/history
- [x] backend/api/admin/llmConfigRoutes.js — LLM 配置 CRUD API
- [x] backend/api/agents/preview.js — 重构为使用 agentPackageReader
- [x] backend/src/index.js — 注册 LLM 配置路由
- [x] frontend/src/pages/Admin/LlmSettings.jsx — Admin LLM 配置页面
- [x] frontend/src/pages/Admin/index.jsx — 添加 LLM 配置 Tab
- [x] frontend/src/pages/AgentDetail/index.jsx — 试用 Agent 按钮 + 聊天 Modal
- [x] frontend/src/services/trialService.js + adminLlmService.js

## 待完成（后续阶段）
- [ ] 自动化测试系统
- [ ] API 文档 (Swagger)
- [ ] 云端 Agent 部署
- [ ] 国际化
