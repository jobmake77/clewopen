# 定制开发工作流 V1（无支付）

更新时间：2026-03-20

## 目标范围

- 完成买方/卖方在平台内的非支付协作闭环：
  - 发布需求
  - 开发者提交方案
  - 站内消息协作
  - 发起验收与确认验收
  - 质量争议与管理员裁决
- 支付、托管、结算模块暂不接入。
- 交付方式固定为“上传 ZIP -> 平台入库私有仓库”，不允许外链交付。
- 存储策略：`manifest + index` 入仓库文件，ZIP 正文入 GitHub Release Asset。

## 数据库变更

迁移文件：
- `backend/migrations/016_expand_custom_order_workflow.sql`
- `backend/migrations/017_custom_order_artifacts_github_repo.sql`

新增/变更：

1. `custom_orders` 状态扩展：
- `open`
- `in_progress`
- `awaiting_acceptance`
- `accepted`
- `disputed`
- `completed`
- `cancelled`
- `closed`

2. 新增 `custom_order_submissions`
- 存储开发者版本提交（可关联 `agent_id`）。
- 交付模式固定 `repo_artifact`，关联 `artifact_id`。

3. 新增 `custom_order_artifacts`
- 记录提交 ZIP 在私有 GitHub 仓库中的落盘信息（repo/path/sha/hash）。
- `metadata` 记录 release/asset 信息，供平台代理下载。

4. 新增 `custom_order_messages`
- 买方/卖方/管理员站内协作消息。

5. 新增 `custom_order_disputes`
- 买方发起争议，管理员裁决（不涉及退款资金处理）。

## 后端接口（已实现）

基路径：`/api/custom-orders`

公开接口：
- `GET /` 列表
- `GET /:id` 详情

登录后接口：
- `POST /` 创建需求
- `PUT /:id/status` 更新状态（含状态机校验）
- `POST /:id/assign` 指派开发者并进入进行中
- `GET /:id/submissions` 获取方案提交
- `POST /:id/submissions` 开发者提交方案
- `GET /:id/submissions/:submissionId/artifact/download` 平台代理下载交付 ZIP
- `POST /:id/request-acceptance` 开发者发起验收
- `POST /:id/accept` 买方确认验收（仅任务状态，不触发支付）
- `GET /:id/messages` 获取协作消息
- `POST /:id/messages` 发送协作消息
- `GET /:id/disputes` 获取争议记录
- `POST /:id/disputes` 买方发起争议
- `POST /:id/disputes/:disputeId/resolve` 管理员裁决
- `DELETE /:id` 删除需求

## 前端页面（已实现）

1. 列表页：
- `frontend/src/pages/CustomOrder/index.jsx`
- 已增加“查看详情”入口

2. 详情协作页：
- `frontend/src/pages/CustomOrder/Detail.jsx`
- 包含：
  - 需求概览
  - 方案提交 Tab
  - 协作消息 Tab
  - 争议记录 Tab
  - 发起验收、确认验收、发起争议操作

3. 路由：
- `/custom-order`
- `/custom-order/:id`

## 当前边界（待后续支付阶段）

- 暂无支付订单、托管、结算、退款资金流。
- 争议只做任务状态裁决，不涉及资金退款处理。
- 交付物托管于 GitHub 私有仓库，不提供第三方外链直达。

## 已确认策略

1. 验收超时时间固定 48 小时（开发者发起验收后自动设置）。
2. `completed` 不自动流转到 `closed`。
3. 争议裁决后默认流转到 `closed`。
4. 允许未指派开发者先提交方案，由买方手动选择并指派开发者。
5. 禁止外链交付，必须上传 ZIP 后由平台托管。
6. 同时提供 ZIP 下载和安装命令，前端首推安装命令（`openclew install`）。
7. 试用链路强制使用 submission 对应 `artifact`，不允许回退到外链/本地其他包。

> 说明（2026-03-20 更新）：
> - 已改为“未指派阶段允许多人提交方案；由买方手动选择开发者并指派”。
> - 不再采用“首个提交自动指派”。

## 环境变量

在 `backend/.env` 中至少配置：

```env
GITHUB_PUBLISH_TOKEN=your_github_token
CUSTOM_ORDER_ARTIFACT_REPO=jobmake77/clewopen-repo
```

说明：
- `GITHUB_PUBLISH_TOKEN` 由服务端使用，不应暴露到前端。
- `CUSTOM_ORDER_ARTIFACT_REPO` 用于统一托管定制交付 ZIP。

## 下载安装策略

1. 页面同时提供：
- `推荐：一键安装`
- `下载 ZIP（高级/离线）`

2. 安装命令统一形态：

```bash
openclew install "<platform-signed-download-url>"
```

3. 设计目标：
- 优先降低用户门槛，减少手动下载/解压/路径配置错误。
- ZIP 下载作为兜底方案保留。

4. 已实现接口：
- `GET /api/custom-orders/:id/submissions/:submissionId/artifact/install-command`
- `GET /api/custom-orders/install/:token/download`

## 试用一致性策略（交付 = 试用）

1. 创建试用会话必须绑定 `submission_id` 并解析到唯一 `artifact_id`。
2. 沙盒启动前只能从托管 artifact 拉取 ZIP。
3. 会话元数据记录 `artifact_id` + `sha256`，用于审计与争议复现。
4. 禁止回退到外链或本地临时包。

已开发接口：
- `POST /api/custom-orders/:id/submissions/:submissionId/trial-sessions`
