# OpenCLEW 云端试用架构

本文档描述 OpenCLEW 下一阶段推荐采用的云端试用架构。设计目标：

- 每次试用使用独立会话环境
- Agent 配置只读注入
- 会话结束后整体销毁环境
- 与主站 API 解耦，便于后续切换到容器或微虚拟机

## 核心原则

- 不共享可变试用环境
- 不依赖“删几个文件恢复空状态”
- 每次试用创建独立 `trial_session`
- 结束后删除整个工作目录或容器

## 当前推荐阶段

当前 OpenCLEW 的在线试用仍是 LLM Prompt Trial，因此推荐：

- `runtime_type = prompt`
- 每个 session 使用本地临时目录
- 由统一 Runner 读取 `IDENTITY.md / RULES.md / MEMORY.md / TOOLS.md`
- 调用平台配置的 LLM，返回结果

## 目录结构

```text
backend/
  runtime/
    trial/
      orchestrator.js
      promptRunner.js
      sessionBuilder.js
      cleanupWorker.js
      sandbox/
        localWorkspace.js
```

## 运行流程

1. 用户调用 `POST /api/agents/:id/trial-sessions`
2. 平台校验 Agent 状态与试用次数
3. 创建 `trial_sessions` 记录，状态为 `provisioning`
4. 创建工作目录 `/tmp/openclew/trial-sessions/{session_id}`
5. 将 Agent 配置文件写入 `agent/`
6. session 进入 `active`
7. 用户调用 `POST /api/trial-sessions/:id/messages`
8. Runner 读取工作目录中的文件，组装 prompt，调用 LLM
9. 消息写入 `trial_session_messages`
10. 会话结束或超时后由用户主动结束或 cleanup worker 自动清理

## 数据表

- `trial_sessions`
  - 会话状态、TTL、workspace 路径、runtime 类型
- `trial_session_messages`
  - 会话消息、输出、usage

## 后续演进

### 阶段 1：本地工作目录

- 优点：实现简单、与现有试用逻辑兼容
- 缺点：不是强沙盒

### 阶段 2：容器化工作空间

- 抽象 `WorkspaceProvider`
- `localWorkspace` 切换到 `containerWorkspace`
- 每个 session 一个容器
- 配置目录只读挂载，输出目录临时挂载

### 阶段 3：强隔离执行

- 适用于真正多租户 Agent 代码执行
- 方向：Firecracker / Kata / gVisor

## 关键接口

- `POST /api/agents/:id/trial-sessions`
- `GET /api/trial-sessions/:sessionId`
- `POST /api/trial-sessions/:sessionId/messages`
- `DELETE /api/trial-sessions/:sessionId`

## 清理策略

- 请求结束时主动清理
- `finally` 再次清理
- `cleanupWorker` 定时扫描超时 session
- 服务启动后可补做 orphan session 清理
