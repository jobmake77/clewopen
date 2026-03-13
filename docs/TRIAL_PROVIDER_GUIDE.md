# 在线试用 Provider 切换说明

## 当前结论

OpenCLEW 的在线试用沙盒建议把默认 provider 切到支持“自定义服务端调用”的公开 API 提供商。

当前代码保留了 Kimi 兼容层，但 **不建议** 把 Kimi For Coding 作为 OpenCLEW 云端试用的主 provider。

原因：

- Kimi 已在实际联调中返回平台侧限制：
  - `Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc.`
- 这意味着它更偏向“指定 Coding Agent 生态接入”，而不是任意 Web 应用后端代调。

## 推荐默认方案

默认 trial provider：`OpenAI`

推荐起步配置：

```env
AI_PROVIDER=openai
AI_API_KEY=your_openai_api_key_here
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5-mini
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.7
AI_REQUEST_TIMEOUT_MS=45000
AI_AUTH_TYPE=bearer
AI_ENABLE_STREAM=false
AI_REASONING_EFFORT=
AI_INCLUDE_MAX_COMPLETION_TOKENS=false
AI_INCLUDE_MAX_OUTPUT_TOKENS=false
AI_LEGACY_OPENAI_FORMAT=true
```

## 代码现状

当前后端已经支持：

- OpenAI Compatible base URL 自动补全 `/chat/completions`
- `Bearer` / `x-api-key` / 自定义认证头
- 流式 `SSE` 响应解析
- Kimi 兼容参数：
  - `stream`
  - `reasoning_effort`
  - `max_completion_tokens`
  - 可选 `max_output_tokens`
- 失败会话自动标记 `failed`
- 失败后自动清理临时 workspace

## 切换步骤

1. 在 `backend/.env` 中填入新的 provider 配置
2. 重启 backend 服务
3. 启动时会自动把当前 `.env` 写入并激活到 `llm_configs`
4. 用 `/api/agents/:id/trial-sessions` + `/api/trial-sessions/:sessionId/messages` 验证试用链路

## 保留 Kimi 的方式

如果后续你需要：

- 本地 / 特定 Agent 生态里继续使用 Kimi
- 云端 OpenCLEW 试用继续使用 OpenAI

那么保持当前实现即可，只需要切换 `.env` 即可，不需要再改代码。
