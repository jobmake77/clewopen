# OpenCLEW Release Steward

适合 OpenCLEW 的发布治理场景：上线前检查、上线后验证、回滚路径留痕。

## 设计依据（公开实践）
- OpenClaw Agent Runtime / Workspace 操作约定：https://docs.openclaw.ai/concepts/agent
- OpenClaw AGENTS 模板（任务节奏与边界约束）：https://docs.openclaw.ai/reference/templates/AGENTS
- OpenAI Agents 指南（工具驱动执行与可控工作流）：https://platform.openai.com/docs/guides/agents

## 关键策略
- 预检查未通过即阻断上线。
- 每次发布都输出回滚命令与发布后健康验证步骤。
