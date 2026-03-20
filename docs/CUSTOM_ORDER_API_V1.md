# 定制开发 API V1（无支付）

更新时间：2026-03-20

Base URL: `http://localhost:5000/api/custom-orders`

## 认证说明

- 公开接口无需登录。
- 其余接口需 `Authorization: Bearer <token>`。

## 公开接口

### 1. 获取需求列表

`GET /`

查询参数：
- `page`
- `pageSize`
- `status`
- `category`

### 2. 获取需求详情

`GET /:id`

## 需求与协作接口

### 3. 创建需求（买方）

`POST /`

```json
{
  "title": "需要一个支持多语言客服的 Agent",
  "description": "希望支持中文/英文、带 FAQ 检索",
  "budget_min": 2000,
  "budget_max": 5000,
  "deadline": "2026-03-30T10:00:00.000Z",
  "category": "agent"
}
```

### 4. 指派开发者

`POST /:id/assign`

```json
{
  "developer_id": "uuid"
}
```

### 5. 更新任务状态

`PUT /:id/status`

```json
{
  "status": "in_progress"
}
```

支持状态：
- `open`
- `in_progress`
- `awaiting_acceptance`
- `accepted`
- `disputed`
- `completed`
- `cancelled`
- `closed`

## 方案交付（ZIP 托管）

### 6. 提交方案（开发者）

`POST /:id/submissions`

Content-Type: `multipart/form-data`

字段：
- `title` (string, required)
- `summary` (string, required)
- `version_label` (string, optional)
- `agent_id` (string, optional)
- `package` (file, required, `.zip`)

说明：
- 不允许 `package_url` 外链。
- 上传 ZIP 会被解析并托管到 `CUSTOM_ORDER_ARTIFACT_REPO`。
- `manifest + index` 作为仓库文件保存，ZIP 正文作为 Release Asset 保存。
- 当订单尚未指派开发者时，允许多个开发者提交方案；需由买方通过 `/:id/assign` 手动选择。
- 一旦完成指派，仅被指派开发者可继续提交后续迭代版本。

### 7. 获取方案列表

`GET /:id/submissions`

### 8. 下载交付 ZIP（平台代理）

`GET /:id/submissions/:submissionId/artifact/download`

### 8.1 获取推荐安装命令（开发中）

`GET /:id/submissions/:submissionId/artifact/install-command`

响应示例（规划）：

```json
{
  "success": true,
  "data": {
    "recommended": true,
    "command": "openclew install \"https://api.example.com/api/custom-orders/xxx/submissions/yyy/artifact/download?token=...\"",
    "expires_at": "2026-03-20T12:00:00.000Z"
  }
}
```

## 验收与争议

### 9. 发起验收（开发者）

`POST /:id/request-acceptance`

说明：会自动设置 48 小时验收窗口。

### 10. 确认验收（买方）

`POST /:id/accept`

说明：当前仅更新任务状态，不触发支付流程。

### 11. 获取消息

`GET /:id/messages?limit=200`

### 12. 发送消息

`POST /:id/messages`

```json
{
  "content": "请补充一下日志处理和部署说明"
}
```

### 13. 发起争议（买方）

`POST /:id/disputes`

```json
{
  "reason": "交付与需求严重不符，无法通过验收",
  "evidence": [
    "https://example.com/screenshot-1",
    "https://example.com/log-1"
  ]
}
```

### 14. 获取争议列表

`GET /:id/disputes`

### 15. 裁决争议（管理员）

`POST /:id/disputes/:disputeId/resolve`

```json
{
  "status": "resolved_developer",
  "resolution": "已提供复现步骤，要求继续修复"
}
```

说明：
- 可用状态：`resolved_buyer` / `resolved_developer` / `rejected`
- 未显式指定 `next_status` 时，系统默认任务状态流转到 `closed`。

## 已确认但待开发项

1. 前端默认主按钮引导安装命令（`openclew install`），ZIP 作为备用入口。
2. 试用会话将强制绑定 submission 对应 artifact，确保“试用=交付”一致性。
