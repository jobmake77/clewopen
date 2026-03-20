# 定制开发工作流 V1（无支付）

更新时间：2026-03-19

## 目标范围

- 完成买方/卖方在平台内的非支付协作闭环：
  - 发布需求
  - 开发者提交方案
  - 站内消息协作
  - 发起验收与确认验收
  - 质量争议与管理员裁决
- 支付、托管、结算模块暂不接入。
- 交付方式固定为“上传 ZIP -> 平台入库私有仓库”，不允许外链交付。

## 数据库变更

迁移文件：
- `backend/migrations/016_expand_custom_order_workflow.sql`

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
- 争议仅影响任务状态，不进行资金裁决。
- 争议只做状态裁决，不涉及资金退款处理。

## 你需要确认的关键项

1. 验收超时时间是否固定 48 小时？
2. `completed` 到 `closed` 是否自动流转？
3. 争议裁决后默认回到 `in_progress` 还是 `closed`？
4. 是否允许未指派开发者先提交方案（当前允许，提交后会自动指派）？
