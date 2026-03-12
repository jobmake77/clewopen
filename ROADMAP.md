# OpenCLEW 开发路线图

## 当前状态: Phase 4 完成 ✅

---

## Phase 1: MVP 基础平台 ✅ (已完成)

### 数据库与用户系统
- ✅ 数据库 Schema 设计（users, agents, reviews, downloads）
- ✅ 数据库迁移脚本
- ✅ 用户注册/登录 API + JWT 认证中间件
- ✅ 密码加密 (bcrypt)
- ✅ 前端登录/注册页面 + 认证状态管理

### Agent 市场
- ✅ Agent 列表/详情/搜索/分类
- ✅ Agent 上传 + manifest.json 验证
- ✅ Agent 文件下载 + 下载统计
- ✅ Agent 评价系统（1-5 星 + 评论 + 审核）

### 管理员系统
- ✅ Agent 审核（单个 + 批量）
- ✅ 评价审核
- ✅ 管理员仪表盘 + 统计数据

### 安全加固
- ✅ SQL 注入修复（参数化查询）
- ✅ API 速率限制 (express-rate-limit)
- ✅ CORS 配置修复
- ✅ 文件上传安全验证（禁止文件类型、路径遍历防护）

### 前端优化
- ✅ ErrorBoundary + loading 状态
- ✅ 确认对话框
- ✅ ProtectedRoute 路由守卫 + 404 页面
- ✅ 审计日志中间件
- ✅ 通知系统（站内信 + Header 铃铛）

---

## Phase 2: 平台丰富 ✅ (已完成)

### Agent 增强
- ✅ Agent 包内容在线预览（zip 中 markdown 渲染）
- ✅ Agent 依赖关联展示（Skill/MCP 卡片跳转）

### Skill 库全栈
- ✅ 数据库迁移（skills 表 + reviews/downloads 支持 resource_type）
- ✅ 通用 Resource Model / Controller / Upload 工厂
- ✅ Skill 市场/详情/上传页面 + Redux slice + service

### MCP 库全栈
- ✅ MCP 数据库表
- ✅ MCP 市场/详情/上传页面 + Redux slice + service

### 定制开发
- ✅ custom_orders 数据库表
- ✅ 后端 CRUD API
- ✅ 前端需求提交表单 + 需求列表

### 导航更新
- ✅ Header 导航菜单：Agent 市场 | Skill 库 | MCP 库 | 定制开发
- ✅ 上传按钮改为下拉菜单：发布 Agent / Skill / MCP

---

## Phase 3: 首页改版 + 数据源 ✅ (已完成)

### 数据源
- ✅ GitHub Search API 数据同步（MCP 6 查询 + Skill 8 查询）
- ✅ OpenClaw/skills 数据源同步
- ✅ DB 迁移 006：github_stars, github_url, author_avatar_url

### 首页改版
- ✅ 平台统计 API（/agents/platform-stats）
- ✅ 首页统计看板 + 分类分布 + Agent/Skill/MCP 三榜单 + 悬赏榜
- ✅ 卡片样式优化（作者头像 + GitHub 星数）

---

## Phase 4: 付费移除 + 试用沙盒 ✅ (已完成)

### 移除付费系统
- ✅ DB 迁移 007：删除 orders 表 + price 列
- ✅ 删除 Order 系统（model/controller/routes）
- ✅ 清理所有 price 相关代码（后端 + 前端）

### Agent 试用沙盒
- ✅ DB 迁移 008：agent_trials + llm_configs 表
- ✅ LLM 服务抽象层（自动识别 Anthropic/OpenAI）
- ✅ Agent 配置文件读取工具（从 zip 包提取 IDENTITY/RULES/MEMORY）
- ✅ 试用 API（POST /:id/trial，每用户每 Agent 限 3 次）
- ✅ Admin LLM 配置管理页面

---

## Phase 5: 待规划

### 自动化测试
- [ ] 单元测试 + 集成测试
- [ ] CI/CD 流水线
- [ ] 测试覆盖率报告

### API 文档
- [ ] Swagger/OpenAPI 规范
- [ ] 自动生成 API 文档

### 国际化
- [ ] 多语言支持（中/英）
- [ ] 时区处理

### 云端 Agent 部署
- [ ] Agent 运行时架构
- [ ] 容器化部署

### 社区功能
- [ ] 开发者激励计划
- [ ] 问答/讨论系统

---

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 前端框架 | React 18 + Vite | 生态成熟、构建速度快 |
| UI 库 | Ant Design 5 | 企业级组件库，开箱即用 |
| 状态管理 | Redux Toolkit | 标准化、DevTools 支持好 |
| 后端框架 | Express | 轻量灵活、中间件丰富 |
| 数据库 | PostgreSQL | 支持 JSONB、数组类型，功能强大 |
| 认证 | JWT | 无状态、适合 SPA |
| LLM 抽象 | 原生 fetch + 自动识别 | 零依赖，支持 Anthropic + OpenAI 兼容 API |
| 付费系统 | 已移除（仅 CustomOrder） | 开源项目不涉及付费 |
