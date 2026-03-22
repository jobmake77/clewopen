# Agent 上传隐私与安全审核策略（V1）

## 1. 审核目标

- 防止开发者误上传敏感信息（密钥、私钥、证件、个人隐私）
- 在不增加使用者负担的前提下，提升平台审核稳定性与可扩展性
- 审核策略支持“规则引擎 + 平台 Agent 复核”双层机制

## 2. 风险分级

### 高危（自动拒绝）

命中任一规则直接拒绝上传：

- 私钥内容（如 `BEGIN PRIVATE KEY`）
- 明确 API Key / Token（如 `sk-...` / `ghp_...`）
- 云访问密钥（如 `AKIA...`）
- 证件号（如身份证号模式）

用户提示示例：

- 检测到高危敏感信息，上传已拒绝。文件: `agent/MEMORY.md`，类型: `private_key`，位置: 第 42 行。请清理后重试。

### 中危（进入复核）

命中中危规则进入复核链路：

- 邮箱、手机号、银行卡号
- 内部链接、疑似本地/内网地址
- 疑似恶意指令内容（prompt injection）

处理策略：

- 先记录规则命中
- 调用平台 Agent 复核接口（若已配置）
- 平台 Agent 决策支持：`pass/reject/needs_fix/needs_review`

### 低危（通过）

- 无高危与中危命中，进入正常人工审核流转。

## 3. 审核链路

1. 包结构与 manifest 校验
2. 自动审核（文件结构/权限/可疑文件名）
3. 内容级敏感扫描（高危/中危）
4. 中危触发平台 Agent 复核（可选）
5. 汇总结果写入 `auto_review_result`

## 4. 平台 Agent 复核接口（Webhook）

环境变量：

- `AGENT_POLICY_REVIEW_WEBHOOK_URL`
- `AGENT_POLICY_REVIEW_TIMEOUT_MS`（默认 15000）

请求体示例：

```json
{
  "resourceType": "agent",
  "manifest": {
    "name": "demo-agent",
    "version": "1.0.0",
    "category": "内容创作"
  },
  "sensitiveReview": {
    "summary": {
      "scannedFiles": 5,
      "findingsCount": 3,
      "highCount": 0,
      "mediumCount": 3
    },
    "findings": []
  },
  "autoReviewResult": {}
}
```

响应体示例：

```json
{
  "decision": "needs_fix",
  "confidence": 0.82,
  "summary": "检测到可识别个人信息，建议脱敏后重新提交",
  "issues": [
    { "category": "privacy", "message": "手机号未脱敏" }
  ]
}
```

## 5. 展示与下载保护

- `preview` 接口对普通用户默认隐藏 `MEMORY` 内容
- 仅作者和管理员可查看完整 `MEMORY`
- 下载保持短期 token 控制

## 6. 可配置策略文件

策略文件路径：

- `backend/config/agentSensitivePolicy.js`

可调整内容：

- 高危规则 `highRules`
- 中危规则 `mediumRules`
- 扫描阈值：`maxFindings`、`maxFileBytes`
- 可扫描文本后缀白名单 `textExtAllowlist`

## 7. 上传者可见反馈

上传页应向开发者展示：

- 敏感扫描判定（`pass / needs_review / reject`）
- 命中详情（文件、行号、类别、严重级别）
- 自动修复建议（按命中类别生成）
- 平台 Agent 复核结果（状态、判定、问题列表）

目标是“可修复、可重试”，而不是只返回一句失败提示。
