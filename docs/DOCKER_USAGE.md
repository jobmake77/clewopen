# Docker 在 OpenCLEW 中的作用详解

## 一、当前作用（开发环境）

### 1.1 基础设施容器化
```yaml
# 当前 docker-compose.yml 提供：
- PostgreSQL: 数据库
- Redis: 缓存
- Backend: 后端服务（可选）
- Frontend: 前端服务（可选）
```

**实际价值**：
- ✅ 环境统一：所有开发者使用相同版本的数据库和 Redis
- ✅ 快速启动：`docker-compose up -d` 一键启动所有依赖
- ✅ 数据隔离：数据卷独立，不影响本地环境
- ⚠️ 前后端容器化：可选，本地开发时直接 `npm run dev` 更方便

**是否必需**？
- PostgreSQL/Redis 容器：**推荐**（避免本地安装配置）
- 前后端容器：**可选**（本地开发时不必要）

---

## 二、核心作用（Agent 沙箱隔离）⭐

### 2.1 为什么需要 Agent 沙箱？

用户下载的 Agent 可能包含：
- ❌ 恶意代码（删除文件、窃取数据）
- ❌ 资源滥用（无限循环、内存泄漏）
- ❌ 网络攻击（DDoS、扫描端口）

**Docker 提供的隔离**：
```
┌─────────────────────────────────────┐
│  宿主机（用户电脑/服务器）           │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Docker 容器 1 - Agent A       │ │
│  │ - 独立文件系统                │ │
│  │ - CPU/内存限制                │ │
│  │ - 网络隔离                    │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Docker 容器 2 - Agent B       │ │
│  │ - 完全隔离                    │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 2.2 Agent 运行架构

#### 本地运行模式（用户下载 Agent）
```javascript
// 用户执行：clewopen run xiaohongshu-agent

// 系统做的事：
1. 读取 manifest.json，检查权限
2. 创建 Docker 容器
3. 挂载允许的目录
4. 设置资源限制
5. 在容器内运行 Agent
6. 返回结果，销毁容器
```

**Docker 配置示例**：
```javascript
// agent-runtime/sandbox/docker-runner.js
const Docker = require('dockerode');
const docker = new Docker();

async function runAgentInSandbox(agentId, manifest, input) {
  // 1. 创建容器配置
  const containerConfig = {
    Image: 'clewopen-agent-runtime:latest',
    Cmd: ['node', 'run-agent.js', agentId],
    Env: [`INPUT=${JSON.stringify(input)}`],

    // 资源限制（根据 manifest.json）
    HostConfig: {
      Memory: manifest.system_requirements.min_memory * 1024 * 1024,
      CpuQuota: 50000, // 0.5 CPU

      // 文件系统权限
      Binds: [
        `${workspaceDir}:/workspace:ro`,  // 只读
        `${outputDir}:/output:rw`         // 可写
      ],

      // 网络限制
      NetworkMode: manifest.permissions.network.allowed_domains.length > 0
        ? 'custom-network'
        : 'none',

      // 禁止特权操作
      Privileged: false,
      ReadonlyRootfs: true,
    }
  };

  // 2. 运行容器
  const container = await docker.createContainer(containerConfig);
  await container.start();

  // 3. 等待执行完成（带超时）
  const result = await container.wait({ timeout: 300000 }); // 5分钟超时

  // 4. 获取输出
  const logs = await container.logs({ stdout: true, stderr: true });

  // 5. 清理容器
  await container.remove();

  return { result, logs };
}
```

#### 云端运行模式（API 调用）
```javascript
// 用户通过 API 调用 Agent
POST /api/agents/xiaohongshu-agent/execute
{
  "input": "生成一篇关于春季穿搭的文案"
}

// 后端调度器：
1. 从 Agent 池中选择空闲容器
2. 或创建新容器
3. 执行任务
4. 返回结果
5. 容器回收到池中（或销毁）
```

### 2.3 安全隔离的具体实现

#### 文件系统隔离
```json
// manifest.json 中声明权限
{
  "permissions": {
    "filesystem": {
      "read": ["./workspace/*", "./input/*"],
      "write": ["./output/*"]
    }
  }
}
```

```bash
# Docker 实现
docker run \
  --read-only \  # 根文件系统只读
  -v /user/workspace:/workspace:ro \  # 只读挂载
  -v /user/output:/output:rw \        # 可写挂载
  agent-image
```

**效果**：Agent 无法访问用户的其他文件

#### 网络隔离
```json
{
  "permissions": {
    "network": {
      "allowed_domains": ["api.openai.com"],
      "max_requests_per_minute": 100
    }
  }
}
```

```bash
# Docker 实现
docker run \
  --network=custom-network \  # 自定义网络
  --dns=custom-dns \          # 自定义 DNS（过滤域名）
  agent-image
```

**效果**：Agent 只能访问白名单域名

#### 资源限制
```bash
docker run \
  --memory=512m \      # 内存限制
  --cpus=0.5 \         # CPU 限制
  --pids-limit=100 \   # 进程数限制
  agent-image
```

**效果**：防止资源滥用

---

## 三、生产环境作用（云端部署）

### 3.1 Kubernetes 编排（Phase 3）

```yaml
# agent-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-runner
spec:
  replicas: 10  # 10个 Agent 运行实例
  template:
    spec:
      containers:
      - name: agent-runtime
        image: clewopen-agent-runtime:latest
        resources:
          limits:
            memory: "1Gi"
            cpu: "1"
          requests:
            memory: "512Mi"
            cpu: "0.5"
```

**作用**：
- 自动扩缩容
- 负载均衡
- 故障恢复
- 滚动更新

---

## 四、Docker 的局限性

### 4.1 不能解决的问题

❌ **代码审查**：Docker 不能检测恶意代码
- 需要：静态代码分析工具

❌ **逻辑漏洞**：Docker 不能防止业务逻辑错误
- 需要：测试和人工审核

❌ **性能优化**：Docker 有一定性能开销
- 需要：性能测试和优化

### 4.2 替代方案

**轻量级隔离**：
- **VM (虚拟机)**：更强隔离，但更重
- **gVisor**：Google 的轻量级沙箱
- **Firecracker**：AWS 的微虚拟机

**进程级隔离**：
- **Node.js VM2**：JavaScript 沙箱
- **Python sandbox**：Python 沙箱
- 但安全性不如容器

---

## 五、实际使用建议

### 5.1 开发阶段（现在）

**推荐配置**：
```bash
# 只容器化基础设施
docker-compose up -d postgres redis

# 前后端本地运行（更方便调试）
cd backend && npm run dev
cd frontend && npm run dev
```

**原因**：
- 本地运行更快
- 热重载更方便
- 调试更容易

### 5.2 测试阶段

**推荐配置**：
```bash
# 全部容器化
docker-compose up -d

# 运行集成测试
npm run test:integration
```

### 5.3 生产阶段

**推荐配置**：
- Kubernetes 编排
- Agent 沙箱隔离
- 自动扩缩容
- 监控告警

---

## 六、总结

### Docker 在项目中的三层价值

| 层次 | 作用 | 必要性 | 当前状态 |
|------|------|--------|----------|
| **开发环境** | 统一数据库/Redis | 推荐 | ✅ 已实现 |
| **Agent 沙箱** | 隔离运行用户 Agent | **必需** | ❌ 未实现 |
| **生产部署** | K8s 编排和扩容 | 必需 | ❌ 未实现 |

### 核心结论

1. **开发环境**：Docker 是便利工具，不是必需
2. **Agent 沙箱**：Docker 是核心安全机制，必需
3. **生产部署**：Docker + K8s 是标准方案

### 下一步行动

**Phase 1 (当前)**：
- 保留 docker-compose.yml 用于数据库/Redis
- 前后端可以本地运行

**Phase 2 (安全)**：
- 实现 Agent Docker 沙箱
- 这是项目的核心安全机制

**Phase 3 (云端)**：
- Kubernetes 部署
- 自动扩缩容
