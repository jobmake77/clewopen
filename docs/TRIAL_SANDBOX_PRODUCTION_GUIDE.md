# OpenCLEW 生产级 Trial Sandbox 落地指南

本文档对应当前仓库已经落地的容器化 trial sandbox 方案，目标是把线上试用从“prompt 模拟”推进到“session 级真实沙盒容器”。

## 目标架构

- 使用一个预构建的基础镜像，里面预装 OpenCLEW CLI
- 宿主机预热一组长期存活的 warm pool 容器
- 每个 `trial_session` 优先命中 warm slot，未命中时再回退到独立冷启动容器
- 每个 session 创建独立临时 workspace，或复用 warm slot 的临时 workspace
- 容器启动后先安装当前 Agent，再处理用户消息
- 会话结束、超时或失败后销毁整个容器和 workspace

## 已落地能力

- 后端支持 `TRIAL_RUNTIME_MODE=prompt|container`
- `container` 模式下会创建带 label 的 Docker 容器
- session workspace 现在包含：
  - `agent/` 提取后的 Agent 文件
  - `artifacts/agent-package.zip` 原始 Agent 包
  - `state/` 会话输入输出
  - `logs/` install/run 日志
- 创建会话时自动执行一次 Agent 安装命令
- 每条消息通过 `docker exec` 调用容器内运行命令
- cleanup worker 会额外清理 orphan trial 容器
- 已支持 warm pool：
  - pool 命中时秒级进入 `active`
  - pool 忙时自动 fallback 到冷启动容器
  - 会话释放后 slot 会自动 reset 并重新进入 warm 状态
- 已提供管理员可观测接口和前端面板：
  - `GET /api/admin/trial-runtime/pool`
  - 管理后台 `试用沙盒` Tab

## 一步一步部署

### 1. 准备基础镜像

基础镜像 Dockerfile 位于：

- [Dockerfile](/Users/a77/Desktop/clewopen/backend/runtime/trial/docker/Dockerfile)
- [session-runner.sh](/Users/a77/Desktop/clewopen/backend/runtime/trial/docker/session-runner.sh)
- [build-trial-base-image.sh](/Users/a77/Desktop/clewopen/backend/runtime/trial/docker/build-trial-base-image.sh)

构建时最关键的是提供 `OPENCLEW_INSTALL_COMMAND`。这个命令会在镜像构建阶段执行一次，把 CLI 预装进基础镜像。

当前仓库默认会走 OpenClaw 官方 npm 安装链路：

- Node 22 基础镜像
- `npm install -g openclaw@${OPENCLAW_CLI_VERSION}`

示例：

```bash
cd /Users/a77/Desktop/clewopen/backend
sh runtime/trial/docker/build-trial-base-image.sh openclew/trial-base:latest
```

如果你们的 CLI 来自私有二进制、私有 npm、私有 Git 仓库，也只需要替换这一个安装命令。

生产上建议同时打一个不可变 tag，例如：

```bash
docker tag openclew/trial-base:latest openclew/trial-base:openclaw-2026.3.12
```

然后后端优先引用固定 tag，而不是长期使用 `latest`。

### 2. 配置后端运行时

在后端环境变量里至少配置：

```bash
TRIAL_RUNTIME_MODE=container
TRIAL_SANDBOX_IMAGE=openclew/trial-base:latest
TRIAL_SANDBOX_INSTALL_COMMAND=/opt/openclew/bin/session-runner.sh install
TRIAL_SANDBOX_PREWARM_COMMAND=/opt/openclew/bin/session-runner.sh prewarm-gateway
TRIAL_SANDBOX_RUN_COMMAND=/opt/openclew/bin/session-runner.sh run
TRIAL_SANDBOX_NETWORK=bridge
TRIAL_SANDBOX_MEMORY=1536m
TRIAL_SANDBOX_CPUS=1
TRIAL_OPENCLAW_NODE_OPTIONS=--max-old-space-size=1024
```

注意：

- 现在默认 run 链路已经切到 `openclaw setup + openclaw agents add + openclaw agent --local`
- 这意味着 trial 容器必须能访问你配置的模型 provider
- `TRIAL_SANDBOX_NETWORK=none` 不再适用于 embedded local agent 模式，生产上应改成受控 egress 网络，而不是完全断网
- 如果 `openclaw setup` / `openclaw agent` 在容器里触发 Node heap OOM，可先提高 `TRIAL_OPENCLAW_NODE_OPTIONS`，再按需上调 `TRIAL_SANDBOX_MEMORY`
- 当前仓库已经实测通过的组合是：`TRIAL_SANDBOX_MEMORY=1536m` + `TRIAL_OPENCLAW_NODE_OPTIONS=--max-old-space-size=1024`

如果你要启用生产可用的 warm pool，至少再加上：

```bash
TRIAL_POOL_ENABLED=true
TRIAL_POOL_SIZE=5
TRIAL_POOL_ACQUIRE_TIMEOUT_MS=15000
TRIAL_POOL_MAINTENANCE_INTERVAL_MS=10000
TRIAL_POOL_BOOTSTRAP_CONCURRENCY=2
TRIAL_POOL_RECYCLE_AFTER_SESSIONS=30
```

补充说明：

- `TRIAL_POOL_SIZE=5` 对应当前建议的首批预热实例数
- `TRIAL_POOL_BOOTSTRAP_CONCURRENCY=2` 表示每次最多并发预热 2 个 slot，但当前实现会在同一轮 maintenance 中持续补满直到 5 个 slot 全部 warm
- `TRIAL_POOL_ACQUIRE_TIMEOUT_MS=15000` 表示会话等待 warm slot 的最大时间，超时后自动回退到冷启动
- `TRIAL_POOL_WORKSPACE_ROOT` 默认会落到项目内的 `backend/.trial-runtime/trial-pool/<namespace>`
- `TRIAL_POOL_NAMESPACE` 默认是 `hostname + port`，多实例共享同一 Docker 宿主机时建议显式设置

默认脚本现在会在容器内自动完成这些步骤：

1. 把只读挂载的 `agent/` 复制到 session 私有的 OpenClaw workspace
2. 执行 `openclaw setup --workspace ...`
3. 写入 trial provider 的 custom provider 配置
4. 执行 `openclaw agents add --non-interactive ...`
5. 每条消息调用 `openclaw agent --local --json`

如果你们后续仍需覆盖默认命令，依然可以通过 `TRIAL_SANDBOX_CUSTOM_INSTALL_CMD` / `TRIAL_SANDBOX_CUSTOM_RUN_CMD` 注入自定义逻辑。

### 3. 启动后端

如果你希望把 5 个 warm slot 固化成一条启动命令，仓库现在已经提供：

```bash
cp /Users/a77/Desktop/clewopen/backend/.env.example /Users/a77/Desktop/clewopen/backend/.env
bash /Users/a77/Desktop/clewopen/scripts/start-trial-stack.sh
```

这条命令会：

- 先启动 `docker-compose.dev.yml` 中的 Postgres / Redis
- 自动检查并构建 `openclew/trial-base:latest`
- 再启动 `docker-compose.trial.yml` 中的 trial backend
- 默认以 5 个 warm slot 启动 warm pool

停止方式：

```bash
bash /Users/a77/Desktop/clewopen/scripts/stop-trial-stack.sh
```

后端启动后：

- 新建 trial session 会生成 `runtime_type=container`
- warm pool 会首先启动 `openclew-trial-pool-{namespace}-slot-01...05`
- 命中 pool 时会复用 warm 容器和 slot workspace
- 未命中 pool 时才会创建 `openclew-trial-{sessionId}` 冷启动容器
- session workspace 默认落在 `/tmp/openclew/trial-sessions/{sessionId}`
- pool workspace 默认落在 `backend/.trial-runtime/trial-pool/{namespace}/slot-xx`

### 4. 验证一次完整流程

1. 访问创建 trial session 接口
2. 确认数据库 `trial_sessions.runtime_type = 'container'`
3. 如果开启了 pool，先检查 Docker 中存在 `openclew-trial-pool-{namespace}-slot-xx`
4. 创建一条 trial session，确认 session 元数据里：
   - `metadata.sandbox.pool.pooled = true` 或 `false`
   - `metadata.gateway_warmup.status = reused` 表示命中 warm slot
5. 发送一条试用消息，确认页面持续收到 SSE `status / delta / done`
6. 检查 `logs/install.log`、`logs/execution.log`、`logs/gateway.log`
7. 结束会话，确认 warm slot 进入 reset 后重新变成 `warm`

如果你要在宿主机上直接验证这条链路，也可以运行：

```bash
cd /Users/a77/Desktop/clewopen/backend
npm run trial:smoke
```

这个 smoke test 会：

- 读取当前激活的 `trial` LLM 配置
- 创建临时 session workspace 与调试容器
- 执行真实 `install` / `run`
- 输出 install 和回复结果

## 推荐的生产参数

- `TRIAL_SANDBOX_NETWORK=bridge` 或独立 egress 网络
- `TRIAL_SANDBOX_READONLY_ROOTFS=true`
- 单独开放 `/tmp` tmpfs
- `TRIAL_SANDBOX_MEMORY=1536m` 或 `2048m`
- `TRIAL_SANDBOX_CPUS=0.5` 或 `1`
- `TRIAL_SANDBOX_PIDS_LIMIT=128` 或 `256`
- `TRIAL_OPENCLAW_NODE_OPTIONS=--max-old-space-size=1024` 或更高
- 使用独立宿主机目录承载 `TRIAL_WORKSPACE_ROOT`
- `TRIAL_POOL_ENABLED=true`
- `TRIAL_POOL_SIZE=5`
- `TRIAL_POOL_BOOTSTRAP_CONCURRENCY=2`
- `TRIAL_POOL_ACQUIRE_TIMEOUT_MS=15000`
- `TRIAL_POOL_RECYCLE_AFTER_SESSIONS=30`
- 进一步生产化时，把 `bridge` 替换成只允许访问模型网关/代理的专用 Docker network

## 管理和排障

### 后台面板

管理后台已经增加 `试用沙盒` Tab，可以直接看到：

- 当前 warm / warming / leased / broken 数量
- Docker 运行镜像、network、namespace
- 每个 slot 的最近预热时间、最近租用时间、复用次数
- 最近错误信息

### 管理接口

管理员接口：

```bash
GET /api/admin/trial-runtime/pool
```

返回内容包括：

- `runtime`: 当前 trial runtime 的镜像、network、workspaceRoot
- `pool.summary`: 各状态 slot 数量
- `pool.slots`: 每个 slot 的实时状态

### 现阶段最稳的挂载方式

当前实现已经从“4 个子目录分别 bind mount”切换为：

- 宿主机整个 slot workspace 一次性挂载到容器内 `/workspace`

这样做的原因是：

- 在 macOS Docker Desktop 上，并发创建多个子目录 bind mount 时，偶发会出现 `bind source path does not exist`
- 单一 workspace 根挂载更稳定，也更适合 warm pool 并发预热场景

## 现阶段边界

- 现在已经具备真实 session 容器生命周期
- 但真正的生产隔离仍建议补上 egress allowlist / provider proxy，而不是直接开放全量外网
- 默认 `session-runner.sh` 现在兼容 `openclaw`、`openclew-cli`、`clewopen`
- 如果后续要进一步收敛权限，下一步建议是：
  - 为不同 Agent 能力引入不同基础镜像
  - 引入镜像签名和 registry allowlist
  - 将 Docker 换成 Firecracker / Kata / gVisor 作为高隔离层
