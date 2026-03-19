# 合规基础能力上线说明

更新时间：2026-03-19

## 已上线内容

1. 合规页面（前端可访问）
- 隐私政策：`/legal/privacy`
- 用户协议：`/legal/terms`
- AI 使用说明：`/legal/ai-usage`
- 投诉与封禁流程：`/legal/complaint`

2. 公开合规信息接口
- `GET /api/compliance/public`
- 返回：数据存储地、对象存储地、第三方模型提供方、当前试用模型、投诉邮箱、策略版本等

3. 默认安全基线
- 日志脱敏：`Authorization`、`api_key`、`token`、`password` 等字段自动脱敏
- 默认不采集敏感个人信息（政策与页面声明）
- LLM API Key 支持加密存储（配置 `SECRET_ENCRYPTION_KEY` 后生效）

4. 数据保留自动清理
- 试用消息默认 30 天
- 访问日志默认 90 天
- 通知默认 90 天
- 日志文件默认 30 天
- 试用工作目录默认 30 天

## 关键环境变量

请在 `backend/.env` 中配置：

```env
SECRET_ENCRYPTION_KEY=replace_with_long_random_secret

DATA_STORAGE_REGION=香港
OBJECT_STORAGE_REGION=香港
BACKUP_STORAGE_REGION=香港
THIRD_PARTY_PROVIDERS=OpenAI-compatible API 网关,GitHub,OpenClaw Skills Registry
DOMESTIC_MIGRATION_PLAN=支持切换到中国内地节点（数据库迁移 + 对象存储迁移 + DNS 灰度）
COMPLIANCE_CONTACT_EMAIL=compliance@clewopen.com
COMPLAINT_CONTACT_EMAIL=abuse@clewopen.com
POLICY_VERSION=2026-03-19

DATA_RETENTION_ENABLED=true
DATA_RETENTION_INTERVAL_MS=86400000
TRIAL_MESSAGE_RETENTION_DAYS=30
TRIAL_SESSION_RETENTION_DAYS=30
ACCESS_LOG_RETENTION_DAYS=90
NOTIFICATION_RETENTION_DAYS=90
LOG_FILE_RETENTION_DAYS=30
TRIAL_WORKSPACE_RETENTION_DAYS=30
```

## “可切回内地节点”的技术方案（预留）

当前已通过配置层预留迁移说明字段，建议后续按以下步骤执行：

1. 数据库层：PostgreSQL 逻辑导出 + 增量同步（短时只读切换）
2. 对象存储层：将 `uploads/storage` 迁移到内地对象存储（保留回源）
3. 服务层：双环境部署，网关灰度按用户比例切流
4. DNS 层：完成数据一致性后再切换主域名解析

## 验证命令

```bash
# 前端
cd frontend && npm run lint && npm run build

# 已有 llm_configs 密钥加密（首次启用 SECRET_ENCRYPTION_KEY 后执行一次）
cd backend && npm run llm:encrypt-keys

# 手动执行一次保留期清理
cd backend && npm run data:retention

# 后端接口（服务启动后）
curl -s http://127.0.0.1:5000/api/compliance/public
```
