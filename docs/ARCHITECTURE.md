# OpenCLEW 架构说明

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ 浏览器   │  │ CLI 工具 │  │ API 客户端│                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
└───────┼─────────────┼─────────────┼────────────────────────┘
        │             │             │
        ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                      前端层 (React)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent 市场  │  Agent 详情  │  用户中心  │  定制开发  │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   后端层 (Node.js + Express)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API Gateway  │  认证中间件  │  日志系统  │  错误处理 │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent 服务  │  用户服务  │  订单服务  │  计费服务   │  │
│  └──────────────────────────────────────────────────────┘  │
└───────┬─────────────────┬─────────────────┬────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │  │  对象存储    │
│   (数据库)   │  │   (缓存)     │  │ (Agent包)    │
└──────────────┘  └──────────────┘  └──────────────┘
```

## 二、Docker 在不同阶段的作用

### Phase 1: 开发阶段（当前）

```
开发者电脑
├── Docker 容器
│   ├── PostgreSQL (容器)  ← Docker 管理
│   └── Redis (容器)       ← Docker 管理
│
└── 本地进程
    ├── Backend (npm run dev)  ← 本地运行
    └── Frontend (npm run dev) ← 本地运行
```

**Docker 作用**：只管理基础设施（数据库、缓存）

### Phase 2: Agent 沙箱（核心功能）

```
用户执行: clewopen run xiaohongshu-agent

系统流程:
┌─────────────────────────────────────────────────┐
│ 1. 读取 manifest.json                           │
│    ├── 检查权限声明                             │
│    ├── 检查资源需求                             │
│    └── 检查依赖                                 │
└─────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ 2. 创建 Docker 容器                             │
│    ├── 设置文件系统权限                         │
│    ├── 设置网络隔离                             │
│    ├── 设置资源限制 (CPU/内存)                  │
│    └── 挂载必要目录                             │
└─────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ 3. 在容器内运行 Agent                           │
│    Docker 容器                                  │
│    ┌─────────────────────────────────────────┐ │
│    │ Agent 代码                              │ │
│    │ ├── 只能读取 /workspace                 │ │
│    │ ├── 只能写入 /output                    │ │
│    │ ├── 只能访问白名单域名                  │ │
│    │ └── CPU/内存受限                        │ │
│    └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ 4. 返回结果并清理                               │
│    ├── 获取输出                                 │
│    ├── 记录日志                                 │
│    └── 销毁容器                                 │
└─────────────────────────────────────────────────┘
```

**Docker 作用**：核心安全机制，隔离运行不可信代码

### Phase 3: 云端部署

```
云端服务器 (Kubernetes)
├── Agent 运行池
│   ├── Agent 容器 1 (Docker)
│   ├── Agent 容器 2 (Docker)
│   ├── Agent 容器 3 (Docker)
│   └── ... (自动扩缩容)
│
├── 后端服务
│   ├── API 服务 Pod 1
│   ├── API 服务 Pod 2
│   └── API 服务 Pod 3
│
└── 基础设施
    ├── PostgreSQL (托管服务)
    ├── Redis (托管服务)
    └── 对象存储 (OSS)
```

**Docker 作用**：容器编排、自动扩缩容、负载均衡

## 三、Agent 沙箱详细设计

### 3.1 安全隔离层次

```
┌─────────────────────────────────────────────────┐
│ 第一层：权限声明检查                            │
│ ├── manifest.json 必须声明所有权限              │
│ ├── 用户审查并授权                              │
│ └── 超出权限的操作被拒绝                        │
└─────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ 第二层：Docker 容器隔离                         │
│ ├── 文件系统隔离（只读根文件系统）             │
│ ├── 网络隔离（自定义网络/DNS）                 │
│ ├── 进程隔离（独立 PID 命名空间）              │
│ └── 资源隔离（CPU/内存限制）                   │
└─────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────┐
│ 第三层：运行时监控                              │
│ ├── 实时监控资源使用                            │
│ ├── 检测异常行为                                │
│ ├── 超时自动终止                                │
│ └── 记录所有操作日志                            │
└─────────────────────────────────────────────────┘
```

### 3.2 文件系统隔离示例

```
用户文件系统:
/Users/user/
├── Documents/
│   ├── secret.txt        ← Agent 无法访问
│   └── work/
│       └── project/      ← Agent 无法访问
└── clewopen/
    ├── workspace/        ← Agent 可读
    │   └── input.txt
    └── output/           ← Agent 可写
        └── result.txt

Docker 容器内看到的:
/
├── workspace/  (只读)
│   └── input.txt
├── output/     (可写)
│   └── result.txt
└── app/        (Agent 代码)
    └── ...

其他目录完全不可见！
```

### 3.3 网络隔离示例

```javascript
// manifest.json
{
  "permissions": {
    "network": {
      "allowed_domains": ["api.openai.com", "api.anthropic.com"],
      "max_requests_per_minute": 100
    }
  }
}

// Docker 实现
docker run \
  --network=custom-network \
  --dns=10.0.0.1 \  # 自定义 DNS 服务器
  agent-image

// 自定义 DNS 服务器
// 只解析白名单域名，其他返回 NXDOMAIN
```

**效果**：
- ✅ Agent 可以访问 api.openai.com
- ❌ Agent 无法访问 evil.com
- ❌ Agent 无法扫描内网

## 四、为什么不用其他方案？

### 4.1 方案对比

| 方案 | 隔离性 | 性能 | 易用性 | 成本 |
|------|--------|------|--------|------|
| **Docker** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| VM (虚拟机) | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 进程沙箱 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| gVisor | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

### 4.2 为什么选择 Docker？

✅ **隔离性足够**：对于大多数场景，Docker 的隔离性已经足够
✅ **性能可接受**：启动快（秒级），资源开销小
✅ **生态成熟**：工具链完善，社区支持好
✅ **易于部署**：Kubernetes 原生支持
✅ **成本低**：开源免费，学习成本低

## 五、实际代码示例

### 5.1 Agent 运行器（未来实现）

```javascript
// agent-runtime/sandbox/runner.js
import Docker from 'dockerode';
import { validateManifest } from './validator.js';

export async function runAgent(agentId, manifest, input, options = {}) {
  // 1. 验证 manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors}`);
  }

  // 2. 准备容器配置
  const docker = new Docker();
  const containerConfig = {
    Image: 'clewopen-agent-runtime:latest',
    Cmd: ['node', '/app/run.js'],
    Env: [
      `AGENT_ID=${agentId}`,
      `INPUT=${JSON.stringify(input)}`,
    ],

    HostConfig: {
      // 资源限制
      Memory: parseMemory(manifest.system_requirements.min_memory),
      NanoCpus: 500000000, // 0.5 CPU

      // 文件系统
      Binds: [
        `${options.workspaceDir}:/workspace:ro`,
        `${options.outputDir}:/output:rw`,
      ],
      ReadonlyRootfs: true,

      // 网络
      NetworkMode: manifest.permissions.network.allowed_domains.length > 0
        ? 'agent-network'
        : 'none',

      // 安全
      SecurityOpt: ['no-new-privileges'],
      CapDrop: ['ALL'],
    },
  };

  // 3. 创建并启动容器
  const container = await docker.createContainer(containerConfig);
  await container.start();

  // 4. 监控执行
  const timeout = options.timeout || 300000; // 5分钟
  const result = await Promise.race([
    container.wait(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    ),
  ]);

  // 5. 获取输出
  const logs = await container.logs({
    stdout: true,
    stderr: true,
  });

  // 6. 清理
  await container.remove({ force: true });

  return {
    success: result.StatusCode === 0,
    output: logs.toString(),
  };
}
```

### 5.2 使用示例

```javascript
// 用户代码
import { runAgent } from 'clewopen-sdk';

const result = await runAgent('xiaohongshu-agent', {
  topic: '春季穿搭',
  style: '种草',
});

console.log(result.output);
// 输出：生成的小红书文案
```

## 六、总结

### Docker 的三个角色

1. **开发工具**（当前）
   - 作用：统一开发环境
   - 必要性：推荐但非必需
   - 替代方案：本地安装数据库

2. **安全机制**（核心）
   - 作用：隔离运行不可信 Agent
   - 必要性：**必需**
   - 替代方案：VM（更重）、进程沙箱（不够安全）

3. **部署平台**（未来）
   - 作用：容器编排和扩缩容
   - 必要性：生产环境必需
   - 替代方案：传统部署（不够灵活）

### 关键要点

- 📦 **开发阶段**：Docker 是便利工具，用 `docker-compose.dev.yml`
- 🔒 **Agent 沙箱**：Docker 是核心安全机制，必须实现
- 🚀 **生产部署**：Docker + Kubernetes 是标准方案
