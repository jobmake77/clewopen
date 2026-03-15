# Docker Compose 配置说明

## 当前提供两个版本

### 1. docker-compose.yml（完整版）
包含所有服务，适合：
- 完整的容器化开发
- CI/CD 环境
- 演示部署

### 2. docker-compose.dev.yml（开发版，推荐）
只包含基础设施，适合：
- 日常开发
- 快速调试
- 本地测试

### 3. docker-compose.trial.yml（Warm Pool 试用后端）
只启动带 5 个 warm slot 的 trial backend，适合：
- 在线试用环境验证
- 预热池压测
- 管理后台查看 `试用沙盒` 运维面板

## 使用方式

### 推荐：开发版（只运行数据库和 Redis）

```bash
# 启动基础设施
docker-compose -f docker-compose.dev.yml up -d

# 本地运行后端
cd backend
npm install
cp .env.example .env
npm run dev

# 本地运行前端（新终端）
cd frontend
npm install
npm run dev
```

**优点**：
- ✅ 前后端热重载更快
- ✅ 调试更方便
- ✅ 日志更清晰
- ✅ 资源占用更少

### 完整版（全部容器化）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

**适用场景**：
- 测试完整部署
- CI/CD 环境
- 演示给他人

### Warm Pool 试用后端

```bash
# 复制后端配置
cp backend/.env.example backend/.env

# 启动基础设施 + 试用后端（默认 5 个 warm slot）
bash scripts/start-trial-stack.sh
```

这个脚本会自动完成：

- 启动 `docker-compose.dev.yml` 中的 Postgres / Redis
- 检查并构建 `openclew/trial-base:latest`
- 启动 `docker-compose.trial.yml` 中的 trial backend
- 固化以下 warm pool 参数：
  - `TRIAL_POOL_ENABLED=true`
  - `TRIAL_POOL_SIZE=5`
  - `TRIAL_POOL_GATEWAY_HOT_SIZE=2`
  - `TRIAL_POOL_BOOTSTRAP_CONCURRENCY=2`

停止方式：

```bash
# 只停止 trial backend
bash scripts/stop-trial-stack.sh

# trial backend + 基础设施一起停掉
bash scripts/stop-trial-stack.sh --with-infra
```

## 停止服务

```bash
# 停止服务
docker-compose down

# 停止并删除数据卷（重置数据库）
docker-compose down -v
```

## 常见问题

### Q: 为什么推荐开发版？
A: 前后端本地运行时，热重载更快，调试更方便，不需要每次修改代码都重建容器。

### Q: 什么时候用完整版？
A: 测试部署、CI/CD、或者需要完全一致的环境时。

### Q: 数据会丢失吗？
A: 不会，数据存储在 Docker 数据卷中，除非使用 `docker-compose down -v`。

### Q: 如何切换版本？
A: 随时可以切换，只需停止当前版本，启动另一个版本即可。
