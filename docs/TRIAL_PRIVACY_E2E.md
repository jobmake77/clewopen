# 试用沙箱隐私与 BYOK 联调脚本

## 目的

快速验证以下关键能力是否正常：

- 高危敏感数据拦截（证件/密钥/私钥）
- 中危敏感数据二次确认
- 试用消息最小留存与会话结束即时清理
- 访问审计写入
- 公开合规接口不暴露具体模型厂商

## 脚本位置

`scripts/trial-privacy-e2e.sh`

## 使用方式

默认参数（本地 5001）直接运行：

```bash
bash scripts/trial-privacy-e2e.sh
```

可选环境变量：

```bash
BASE_URL=http://127.0.0.1:5001 \
TEST_EMAIL=user1@example.com \
TEST_PASSWORD=password123 \
AGENT_ID=ca24eb9c-ac71-4b26-99de-be205ba01b09 \
PG_CONTAINER=clewopen-postgres \
DB_NAME=clewopen \
DB_USER=postgres \
bash scripts/trial-privacy-e2e.sh
```

## 输出说明

- 成功：最后输出 `全部检查通过 ✅`
- 失败：会直接退出，并打印具体失败步骤和响应内容

## 失败排查建议

1. `创建试用会话失败`
检查目标 Agent 是否 `approved`，且包文件存在。

2. `访问审计` 或 `消息清理` 失败
检查是否连接到正确的 Postgres 容器（`PG_CONTAINER`）以及 DB 名称。

3. `合规文案未按要求返回`
确认当前运行的是最新后端镜像/代码，并检查 `api/compliance/public` 响应。
