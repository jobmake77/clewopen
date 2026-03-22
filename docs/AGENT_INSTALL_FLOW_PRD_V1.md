# Agent 试用后安装流程 PRD（V1）

## 1. 背景与目标

当前 Agent 详情页支持「试用」与「获取安装命令」，但安装路径仍是单一模式。用户在试用后常见诉求是：

- 直接全量安装（最快落地）
- 只增强部分能力（不覆盖已有个人配置）
- 精细选择需要的配置文件（可控迁移）

本 PRD 目标是把“试用 -> 安装”做成一条可决策、可预检、可回滚的标准化链路。

## 2. 目标用户与核心场景

- 买方用户：试用后确认 Agent 能力，选择安装方式导入本地 OpenClaw 环境。
- 开发者用户：希望其 Agent 更容易被采用，减少“下载后不会装”的流失。

核心场景：

1. 用户在 Agent 详情页完成试用。
2. 点击“安装 Agent”进入安装向导。
3. 选择安装模式：
   - 全量安装
   - 增强安装
   - 自选文件
4. 先看预检结果（冲突、缺失、建议）。
5. 复制安装命令或下载安装包执行。

## 3. 产品范围（V1）

### 3.1 安装模式

- `full`（全量）
  - 默认导入 Agent 提供的全部可安装文件。
  - 适合首次部署、空环境。

- `enhance`（增强）
  - 保留用户已有核心个性化文件（如 `MEMORY.md`、`SOUL.md`），优先安装增强能力文件（如 `SKILLS.md`、`RULES.md`、`TOOLS.md`）。
  - 适合已有个人 Agent 基线，想“增量升级”。

- `custom`（自选）
  - 用户手动勾选文件，平台生成对应安装计划。
  - 适合高级用户精细控制。

### 3.2 安装前预检（Dry Run）

预检输出统一结构：

- 将安装文件列表（按类型分组）
- 将覆盖文件列表（潜在冲突）
- 缺失依赖提示（技能/MCP/外部包）
- 风险提示（商业版时效下载、兼容版本提示）
- 推荐模式提示（例如检测到用户已有 MEMORY 时推荐“增强”）

### 3.3 输出形式

- 安装命令（首推）
  - `openclew install <download_url> --mode <mode> --include <paths...>`
- 下载包（备用）
  - 受 token 控制的短期下载 URL（沿用现有机制）

## 4. 非目标（V1 不做）

- 支付与分账
- 许可证激活/心跳/吊销
- 音视频多媒体安装流程差异化
- 本地环境真实文件覆盖确认（仅做“服务端静态预检”）

## 5. 信息架构与交互

Agent 详情页右侧：

- 原“获取安装命令”升级为“安装 Agent（向导）”
- 向导步骤：
  1. 选择模式（全量/增强/自选）
  2. 查看预检结果
  3. 复制命令 / 下载包

`custom` 模式附加：

- 文件勾选区（按分组：核心人格、规则策略、能力扩展、文档）
- 实时显示“将导入 X 个文件”

## 6. 后端设计（API）

在现有 `/api/agents/:id/install-command` 基础上扩展：

### 6.1 新增：获取可安装文件与默认策略

- `GET /api/agents/:id/install-options`
- 返回：
  - 可安装文件列表（来自 manifest + zip 扫描）
  - 三种模式下默认 include 列表
  - 默认推荐模式

### 6.2 新增：安装预检

- `POST /api/agents/:id/install-preview`
- 请求：
  - `mode: "full" | "enhance" | "custom"`
  - `selectedFiles?: string[]`（仅 custom 必填）
- 返回：
  - `resolvedFiles`
  - `conflicts`
  - `missingDependencies`
  - `warnings`
  - `summary`

### 6.3 兼容扩展：生成安装命令

- `POST /api/agents/:id/install-command`
- 新增可选入参：
  - `mode`
  - `selectedFiles`
  - `ttlMinutes`
- 返回保持兼容，新增：
  - `mode`
  - `includedFiles`
  - `installCommand`（带 mode/include 参数）

## 7. 数据与规则

### 7.1 文件分组规则（V1）

- 核心人格：
  - `agent/IDENTITY.md`, `agent/SOUL.md`, `agent/MEMORY.md`
- 行为规则：
  - `agent/RULES.md`, `agent/AGENTS.md`
- 能力扩展：
  - `agent/TOOLS.md`, `agent/SKILLS.md`, `agent/MCP.md`
- 文档说明：
  - `README.md`, `docs/*`

### 7.2 模式默认映射

- `full`: 所有可安装文件
- `enhance`: 默认排除 `SOUL.md`, `MEMORY.md`（可按业务继续调整）
- `custom`: 仅用户勾选

### 7.3 token 元数据扩展

`agent_install_tokens.metadata` 增加：

- `mode`
- `included_files`
- `preview_summary`

用于审计和后续分析，不影响历史记录兼容。

## 8. 安全与合规

- 继续使用短期 token 下载，避免长期裸链路。
- 命令/链接默认时效 5-30 分钟（沿用现有策略）。
- 文件路径严格白名单+规范化，防止路径穿越。
- 不返回敏感密钥，不写入用户私密配置内容。

## 9. 验收标准（V1）

功能验收：

1. Agent 详情页可打开安装向导并切换 3 种模式。
2. `custom` 可勾选文件，预检结果正确反映勾选内容。
3. 预检接口返回冲突/依赖/告警信息且前端可视化展示。
4. 生成安装命令时包含 mode/include 参数，并可复制。
5. 旧调用方式（不传 mode）保持兼容可用。

质量验收：

1. 前端 `npm run lint` 通过。
2. 前端 `npm run build` 通过。
3. 后端新增接口具备基础参数校验与错误码。
4. 不引入破坏现有下载与试用流程的回归。

## 10. 分阶段实施

- Phase 1（本次开发）
  - 新增 `install-options` + `install-preview`
  - 扩展 `install-command` 支持 `mode/selectedFiles`
  - Agent 详情页安装向导（3 模式 + 预检 + 复制命令）

- Phase 2
  - 引入本地 CLI 回传的真实冲突检测（更准确）
  - 安装历史与成功率分析

- Phase 3
  - 安装模板（团队预设）
  - 与商业授权策略深度联动

## 11. 风险与应对

- 风险：zip 内文件命名不规范，导致分组识别不稳定。
  - 应对：增加多候选路径映射与 fallback 分组。

- 风险：用户误解“增强模式”为绝对不覆盖。
  - 应对：预检显式展示“可能覆盖清单”，并文案强调。

- 风险：Agent 包结构差异导致自选文件为空。
  - 应对：回退到全量模式并提示开发者完善 manifest。
