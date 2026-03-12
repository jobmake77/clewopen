# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Agent 试用沙盒** - 用户下载前可在线试用 Agent
  - 后端 LLM 服务抽象层（自动识别 Anthropic / OpenAI 兼容 API）
  - Agent 配置文件读取工具（从 zip 包提取 IDENTITY/RULES/MEMORY）
  - 试用 API：`POST /agents/:id/trial`（每用户每 Agent 限 3 次）
  - 试用历史 API：`GET /agents/:id/trial/history`
  - 前端聊天 Modal（消息列表 + 剩余次数 + 历史加载）
- **Admin LLM 配置管理**
  - CRUD API：`/api/admin/llm-configs`（列表/新建/更新/激活/删除）
  - 管理后台 LLM 配置页面（Table + Modal 表单）
  - 支持配置 provider_name、api_url、api_key、model_id、max_tokens、temperature
- DB 迁移 008：agent_trials + llm_configs 表

### Removed
- **付费/订单系统完全移除**（项目开源，仅 CustomOrder 涉及金钱）
  - 删除 orders 表、Order model/controller/routes
  - 移除 agents/skills/mcps 的 price_type/price_amount/price_currency/billing_period 列
  - 移除前端所有价格标签、购买按钮、定价表单
  - 移除 manifest 的 price 校验
  - DB 迁移 007：DROP orders + ALTER TABLE 删 price 列

### Changed
- `backend/api/agents/preview.js` 重构为使用共享 `agentPackageReader` 工具
- `backend/models/Resource.js` / `Agent.js` — create() 去掉 price 字段
- `backend/api/shared/resourceUpload.js` — 去掉 price 解析
- `backend/services/syncService.js` / `scripts/fetchExternalData.js` — INSERT 去掉 price 列

## [0.3.0] - 2026-03-12

### Added
- **首页改版** — 统计看板 + Agent/Skill/MCP 三榜单
- **GitHub / OpenClaw 数据自动同步**
- DB 迁移 006：github_stars, github_url, author_avatar_url

## [0.2.0] - 2026-03-12

### Added
- **Skill 库全栈** — 市场/详情/上传 + 通用 Resource Model
- **MCP 库全栈** — 市场/详情/上传
- **Agent 包内容在线预览**（zip 中 markdown 文件渲染）
- **Agent 依赖关联展示**（Skill/MCP 卡片跳转）
- **定制开发页面**（需求提交与列表）
- DB 迁移 004-005：notifications, skills, mcps 表

## [0.1.1] - 2026-03-11

### Added
- **管理员审核系统** — Agent 和评价审核
- **增强的 Agent 上传验证** — 文件结构 + 安全验证
- 管理员服务层 API 封装

### Fixed
- 评价提交错误处理路径不匹配
- 评价被拒绝后无法重新提交

## [0.1.0] - 2026-03-10

### Added
- Initial MVP release
- Core platform features
- Basic agent marketplace
- User authentication
- Agent upload with validation
- Documentation

[Unreleased]: https://github.com/yourusername/openclewopen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/openclewopen/releases/tag/v0.1.0
