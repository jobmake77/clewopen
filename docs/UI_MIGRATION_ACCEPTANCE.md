# UI Migration Acceptance Checklist

## Goal
将 `/Users/a77/Desktop/cream-canvas` 的 UI/UX 语言迁移到 `clewopen/frontend`，并保持现有业务能力可用。

## A. Global Visual System
- [x] 全局字体统一（Serif 标题 + Sans 正文）
- [x] Cream 色板与状态色 token（info/success/warning/danger/purple）
- [x] 统一卡片、按钮、输入框、Tag、Alert、Tabs、Modal 样式
- [x] 全局 hover/focus/loading/empty 动效层
- [x] 移动端基础密度规则

## B. Shell & Navigation
- [x] Header 导航胶囊化（含选中态）
- [x] Footer 风格统一
- [x] 小屏导航可溢出且不破版

## C. Marketplace & Resource Flows
- [x] 首页 Hero + 统计 + 榜单视觉迁移
- [x] Skill 市场 / MCP 市场视觉统一
- [x] ResourceCard / RankingBoard 统一主题色与交互

## D. Detail Pages
- [x] Agent 详情页（信息区 + 试用区）迁移
- [x] Skill 详情页迁移
- [x] MCP 详情页迁移
- [x] 评价、安装命令、试用等弹窗样式统一

## E. Auth & Publish Flows
- [x] 登录 / 注册页面迁移
- [x] 上传 Agent / Skill / MCP 页面迁移
- [x] CustomOrder 页面迁移（含移动端布局优化）

## F. Admin Console
- [x] Admin 首页与卡片样式迁移
- [x] AgentReview / ReviewManagement / UserManagement 统一密度
- [x] DataSync / TrialRuntime / PublishOps / LlmSettings 统一视觉
- [x] 表格、Descriptions、筛选区、状态标签风格统一

## G. Acceptance Smoke Checks
- [x] `npm run build` 通过
- [x] 路由可达性验收（桌面端）：`/` `/agent/1` `/skills` `/mcps` `/custom-order` `/admin` 均返回 `200`（2026-03-19）
- [ ] 手工视觉验收（桌面端）：`/` `/agent/:id` `/skills` `/mcps` `/custom-order` `/admin`
- [ ] 手工验收（移动端）：Header、榜单列表、详情页弹窗、上传页表单
- [ ] 深色/浅色策略确认（当前为浅色主视觉）

## Notes
- 当前迁移策略为“保留业务逻辑 + 替换视觉层”，API、Redux、试用链路未被重写。
- 若要做 1:1 像素级还原，下一步建议补充截图对照验收（page-by-page）。
