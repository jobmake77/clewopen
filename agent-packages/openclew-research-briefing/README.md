# OpenCLEW Research Briefing Agent

面向 OpenCLEW 场景的调研 Agent 案例：强调规划、证据质量分层、可追溯结论。

## 设计依据（公开实践）
- OpenClaw Agent Runtime / Workspace 约定：https://docs.openclaw.ai/concepts/agent
- OpenClaw AGENTS 模板（先读上下文文件，再执行任务）：https://docs.openclaw.ai/reference/templates/AGENTS
- Agent 编排模式（orchestrator-workers）：https://www.anthropic.com/research/building-effective-agents/

## 关键策略
- 先计划后检索，避免“直接搜到什么就写什么”。
- 每个关键结论必须附来源、日期、置信度。
