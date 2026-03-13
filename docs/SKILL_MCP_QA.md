# Skill / MCP 验收清单

本文档用于人工验收新的 Skill / MCP 目录模型。当前模型区分两类资源：

- `uploaded`：平台上传资源，支持平台内下载
- `external`：从 GitHub / OpenClaw 同步的外部资源，详情页显示“查看源码”

## 环境准备

- 前端运行在 `http://localhost:5173`
- 后端运行在 `http://localhost:3001`
- PostgreSQL 已执行 `009_refactor_skill_mcp_source_model.sql`

## 1. 列表页验收

### Skill 列表

访问 `http://localhost:5173/skills`

检查项：
- [ ] 卡片点击后进入 `/skills/:id`，而不是直接跳出站外
- [ ] 顶部可按来源筛选：`全部来源 / GitHub / OpenClaw / 平台上传`
- [ ] 外部资源卡片显示来源标签
- [ ] 外部资源卡片显示 `Stars` 和访问次数
- [ ] 平台上传资源卡片显示评分和下载量

### MCP 列表

访问 `http://localhost:5173/mcps`

检查项：
- [ ] 卡片点击后进入 `/mcps/:id`
- [ ] 顶部可按来源筛选：`全部来源 / GitHub / 平台上传`
- [ ] 外部资源卡片显示来源标签
- [ ] 外部资源卡片显示 `Stars` 和访问次数
- [ ] 平台上传资源卡片显示评分和下载量

## 2. 详情页验收

### 外部 Skill / MCP

选择一个 `source_type=external` 的资源进入详情页

检查项：
- [ ] 页面顶部显示来源标签，例如 `GitHub` 或 `OpenClaw`
- [ ] 详情页主按钮为“查看源码”
- [ ] 页面显示外部链接地址
- [ ] 点击“查看源码”会打开外部链接
- [ ] 再次刷新详情页，访问次数会增加
- [ ] 页面不显示本地下载行为

### 平台上传 Skill / MCP

选择一个 `source_type=uploaded` 的资源进入详情页

检查项：
- [ ] 页面顶部显示“平台上传”
- [ ] 主按钮为“下载 Skill”或“下载 MCP”
- [ ] 点击下载会触发平台内下载
- [ ] 不显示外部资源链接文案

## 3. 接口验收

### 列表接口

```bash
curl -s 'http://localhost:3001/api/skills?pageSize=1'
curl -s 'http://localhost:3001/api/mcps?pageSize=1'
```

检查项：
- [ ] 返回包含 `source_type`
- [ ] 返回包含 `source_platform`
- [ ] external 资源的 `external_url` 不为空
- [ ] external 资源的 `package_url` 为 `null`

### 外部访问接口

```bash
curl -X POST 'http://localhost:3001/api/skills/{id}/visit'
curl -X POST 'http://localhost:3001/api/mcps/{id}/visit'
```

检查项：
- [ ] 返回 `success: true`
- [ ] 返回 `external_url`
- [ ] 对应详情接口的 `visits_count` 递增

### 外部下载拦截

```bash
curl -X POST 'http://localhost:3001/api/skills/{id}/download' -H 'Authorization: Bearer {token}'
curl -X POST 'http://localhost:3001/api/mcps/{id}/download' -H 'Authorization: Bearer {token}'
```

检查项：
- [ ] 返回 `EXTERNAL_RESOURCE`
- [ ] 返回 `external_url`
- [ ] 错误信息提示前往原始链接访问

## 4. 后台同步页验收

访问管理员后台的数据同步页

检查项：
- [ ] 展示 Skill 来源拆分
- [ ] 展示 MCP 来源拆分
- [ ] 显示 external / uploaded 统计
- [ ] Skill 页显示 GitHub / OpenClaw 拆分
- [ ] 若当前 OpenClaw 是分批同步，页面会提示本轮处理区间
