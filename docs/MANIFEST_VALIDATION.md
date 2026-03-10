# manifest.json 验证功能文档

## 功能概述

manifest.json 验证功能会在 Agent 包上传时自动执行，确保 Agent 包符合平台规范。

## 验证流程

1. **文件上传**: 用户上传 .zip 格式的 Agent 包
2. **解压检查**: 系统解压 zip 文件，查找 manifest.json
3. **格式验证**: 验证 JSON 格式是否正确
4. **字段验证**: 检查必填字段和字段类型
5. **内容验证**: 验证版本号、权限、依赖等配置
6. **结果返回**: 返回验证结果和详细错误信息

## manifest.json 规范

### 必填字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| name | string | Agent 名称 | "Python 代码审查助手" |
| version | string | 版本号（语义化版本） | "1.0.0" |
| description | string | Agent 描述 | "自动审查 Python 代码质量" |
| author | string | 作者 | "OpenCLEW Team" |

### 可选字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| category | string | 分类 | "development" |
| tags | array | 标签列表 | ["python", "code-review"] |
| permissions | object | 权限配置 | 见下文 |
| dependencies | object | 依赖配置 | 见下文 |
| price | object | 价格配置 | 见下文 |
| icon | string | 图标 URL | "https://example.com/icon.png" |
| homepage | string | 主页 URL | "https://github.com/..." |
| repository | string | 仓库 URL | "https://github.com/..." |

### 版本号规范

遵循语义化版本规范（Semantic Versioning）：

```
主版本号.次版本号.修订号[-预发布版本][+构建元数据]
```

**有效示例**:
- `1.0.0`
- `2.1.3`
- `1.0.0-alpha`
- `1.0.0-beta.1`
- `1.0.0+20230101`

**无效示例**:
- `1.0` (缺少修订号)
- `v1.0.0` (不应包含 v 前缀)
- `1.0.0.0` (版本号过长)

### 权限配置

```json
{
  "permissions": {
    "filesystem": ["read", "write"],
    "network": ["http", "https"],
    "system": ["exec"]
  }
}
```

**可用权限**:
- `filesystem`: `read`, `write`, `delete`
- `network`: `http`, `https`, `websocket`
- `system`: `exec`, `env`, `process`

### 依赖配置

```json
{
  "dependencies": {
    "skills": ["code-analyzer", "python-parser"],
    "agents": ["base-agent"],
    "packages": ["pylint", "flake8", "black"]
  }
}
```

**依赖类型**:
- `skills`: 平台提供的技能包
- `agents`: 依赖的其他 Agent
- `packages`: npm/pip 等包管理器的包

### 价格配置

```json
{
  "price": {
    "type": "free",
    "amount": 0
  }
}
```

**价格类型**:
- `free`: 免费
- `one-time`: 一次性购买
- `subscription`: 订阅制

## 完整示例

```json
{
  "name": "Python 代码审查助手",
  "version": "1.0.0",
  "description": "自动审查 Python 代码质量，提供改进建议和最佳实践指导",
  "author": "OpenCLEW Team",
  "category": "development",
  "tags": ["python", "code-review", "quality", "linting"],
  "icon": "https://example.com/icon.png",
  "homepage": "https://github.com/openclewopen/python-reviewer",
  "repository": "https://github.com/openclewopen/python-reviewer",
  "permissions": {
    "filesystem": ["read"],
    "network": ["https"],
    "system": []
  },
  "dependencies": {
    "skills": ["code-analyzer", "python-parser"],
    "agents": [],
    "packages": ["pylint", "flake8", "black"]
  },
  "price": {
    "type": "free",
    "amount": 0
  }
}
```

## 验证错误示例

### 错误 1: 缺少必填字段

**错误信息**:
```json
{
  "success": false,
  "error": "Agent 包验证失败",
  "details": [
    "缺少必填字段: name",
    "缺少必填字段: version"
  ]
}
```

**解决方法**: 在 manifest.json 中添加缺少的字段

### 错误 2: 版本号格式错误

**错误信息**:
```json
{
  "success": false,
  "error": "Agent 包验证失败",
  "details": [
    "版本号格式错误，应符合语义化版本规范 (如 1.0.0)"
  ]
}
```

**解决方法**: 使用正确的版本号格式，如 `1.0.0`

### 错误 3: 无效的权限

**错误信息**:
```json
{
  "success": false,
  "error": "Agent 包验证失败",
  "details": [
    "无效的权限: filesystem.execute"
  ]
}
```

**解决方法**: 使用平台支持的权限类型

### 错误 4: 未找到 manifest.json

**错误信息**:
```json
{
  "success": false,
  "error": "Agent 包验证失败",
  "details": [
    "Agent 包中未找到 manifest.json 文件"
  ]
}
```

**解决方法**: 确保 zip 包根目录包含 manifest.json 文件

## 使用示例

### 创建 Agent 包

1. 创建目录结构：
```bash
my-agent/
├── manifest.json
├── agent/
│   ├── IDENTITY.md
│   └── RULES.md
├── config/
│   └── settings.json
└── README.md
```

2. 编写 manifest.json

3. 打包：
```bash
cd my-agent
zip -r ../my-agent-1.0.0.zip .
```

### 上传和验证

使用前端界面上传，系统会自动验证。

或使用 API：
```bash
curl -X POST http://localhost:5000/api/agents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "package=@my-agent-1.0.0.zip" \
  -F "name=My Agent" \
  -F "description=Agent description" \
  -F "category=development" \
  -F "version=1.0.0"
```

### 验证成功响应

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Python 代码审查助手",
    "version": "1.0.0",
    "status": "pending"
  },
  "message": "Agent 上传成功，等待审核",
  "validation": {
    "manifest": {
      "name": "Python 代码审查助手",
      "version": "1.0.0",
      "author": "OpenCLEW Team",
      ...
    },
    "files": [
      "manifest.json",
      "README.md",
      "agent/IDENTITY.md",
      "agent/RULES.md"
    ]
  }
}
```

## 技术实现

### 验证工具

位置: `backend/utils/manifestValidator.js`

**主要函数**:
- `extractManifest(zipPath)`: 解压并提取 manifest.json
- `validateManifest(manifest)`: 验证 manifest 内容
- `validateAgentPackage(zipPath)`: 完整验证流程

### 集成到上传流程

```javascript
// backend/api/agents/upload.js
import { validateAgentPackage } from '../../utils/manifestValidator.js'

export const uploadAgent = async (req, res, next) => {
  // 验证 Agent 包
  const validationResult = validateAgentPackage(req.file.path)

  if (!validationResult.valid) {
    fs.unlinkSync(req.file.path)
    return res.status(400).json({
      success: false,
      error: 'Agent 包验证失败',
      details: validationResult.errors
    })
  }

  // 使用 manifest 中的信息创建 Agent
  const manifest = validationResult.manifest
  // ...
}
```

## 测试

### 运行测试脚本

```bash
# 1. 打包示例 Agent
bash scripts/pack-agent.sh agent-packages/example-agent

# 2. 启动后端服务
cd backend && npm run dev

# 3. 运行验证测试
bash scripts/test-manifest-validation.sh
```

### 手动测试

1. 创建一个包含 manifest.json 的 zip 文件
2. 登录开发者账号
3. 访问上传页面
4. 上传 zip 文件
5. 查看验证结果

## 最佳实践

1. **版本管理**: 使用语义化版本，每次更新递增版本号
2. **权限最小化**: 只申请必要的权限
3. **依赖明确**: 清晰列出所有依赖
4. **文档完整**: 提供详细的 README 和使用说明
5. **测试验证**: 上传前本地测试 manifest 格式

## 相关文档

- [Agent 上传功能](./AGENT_UPLOAD.md)
- [Agent 开发指南](./AGENT_DEVELOPMENT.md)
- [manifest.json 规范](./MANIFEST_SPEC.md)
