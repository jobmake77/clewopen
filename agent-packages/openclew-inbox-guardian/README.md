# OpenCLEW Inbox Guardian

OpenCLEW/OpenClaw 风格的安全执行 Agent 配置案例。

适用场景：任务收件箱自动化、日常巡检、轻量运维动作。

## 设计依据（公开实践）
- OpenClaw Agent Runtime / Workspace 文件约定（AGENTS/SOUL/TOOLS/USER）：https://docs.openclaw.ai/concepts/agent
- AGENTS 模板（会话启动、红线、heartbeat 思路）：https://docs.openclaw.ai/reference/templates/AGENTS
- X 讨论：邮箱误删事故，强调“confirm before acting”不足以替代强约束：https://x.com/MichelIvan92347/status/2025995154306281488

## 关键策略
- 危险动作双重门禁（先 dry-run，再显式确认）。
- 记录每次执行的审计日志，保证可追踪。
