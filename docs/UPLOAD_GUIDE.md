# Agent 上传功能使用指南

## 功能概述

Agent 上传功能允许开发者将自己开发的 Agent 包上传到 OpenCLEW 平台，经过审核后发布到市场。

## 前置条件

1. 拥有开发者或管理员账号
2. 准备好 Agent 包文件（.zip 格式）
3. Agent 包符合平台规范

## 使用步骤

### 1. 登录账号

使用开发者账号登录平台：
- 测试账号：dev1@example.com
- 密码：password123

### 2. 进入上传页面

点击导航栏的"发布 Agent"按钮，进入上传页面。

### 3. 填写 Agent 信息

**基本信息**:
- Agent 名称：简洁明了的名称
- Agent 描述：详细描述功能和使用场景
- 分类：选择合适的分类
- 版本号：遵循语义化版本（如 1.0.0）

**标签**:
- 添加相关标签，方便用户搜索
- 每个标签用回车键确认

**定价**:
- 免费：完全免费使用
- 一次性购买：用户支付一次即可永久使用
- 订阅制：按月/年订阅

### 4. 上传 Agent 包

点击"选择文件"按钮，选择准备好的 .zip 文件：
- 文件格式：.zip
- 文件大小：不超过 50MB
- 包含 manifest.json 文件

### 5. 提交审核

点击"提交审核"按钮，系统会：
1. 验证文件格式和大小
2. 上传文件到服务器
3. 创建 Agent 记录（状态为 pending）
4. 等待管理员审核

### 6. 查看审核状态

在用户中心的"我的 Agent"页面可以查看：
- Agent 列表
- 审核状态
- 下载量和评分

## Agent 包规范

### 目录结构

```
agent-package.zip
├── manifest.json          # Agent 元数据（必需）
├── agent/
│   ├── IDENTITY.md       # Agent 身份定义
│   ├── RULES.md          # 行为规则
│   └── SKILLS.md         # 技能配置
├── config/
│   └── settings.json     # 配置文件
└── README.md             # 使用说明
```

### manifest.json 示例

```json
{
  "name": "Python 代码审查助手",
  "version": "1.0.0",
  "description": "自动审查 Python 代码质量",
  "author": "OpenCLEW Team",
  "category": "development",
  "tags": ["python", "code-review", "quality"],
  "permissions": {
    "filesystem": ["read"],
    "network": ["http", "https"],
    "system": []
  },
  "dependencies": {
    "skills": ["code-analyzer"],
    "agents": [],
    "packages": ["pylint", "flake8"]
  },
  "price": {
    "type": "subscription",
    "amount": 49.9,
    "currency": "CNY",
    "period": "month"
  }
}
```

## API 使用

### 上传 Agent

```bash
curl -X POST http://localhost:5000/api/agents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "package=@agent-package.zip" \
  -F "name=Python 代码审查助手" \
  -F "description=自动审查 Python 代码质量" \
  -F "category=development" \
  -F "version=1.0.0" \
  -F 'price={"type":"subscription","amount":49.9}' \
  -F 'tags=["python","code-review"]'
```

### 更新 Agent

```bash
curl -X PUT http://localhost:5000/api/agents/:id \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "package=@agent-package-v2.zip" \
  -F "version=2.0.0"
```

### 删除 Agent

```bash
curl -X DELETE http://localhost:5000/api/agents/:id \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 测试脚本

运行测试脚本验证上传功能：

```bash
# 启动后端服务
cd backend
npm run dev

# 运行测试脚本
./scripts/test-upload.sh
```

## 常见问题

### Q: 上传失败，提示"只支持 .zip 格式"
A: 确保文件扩展名为 .zip，不要使用 .rar 或其他压缩格式。

### Q: 上传失败，提示"文件过大"
A: Agent 包大小不能超过 50MB，请优化包内容或移除不必要的文件。

### Q: 上传成功但看不到 Agent
A: 上传后的 Agent 状态为 pending（待审核），需要管理员审核通过后才会在市场显示。

### Q: 如何更新已发布的 Agent
A: 在用户中心的"我的 Agent"页面找到对应的 Agent，点击编辑按钮，上传新版本。

### Q: 可以删除已发布的 Agent 吗
A: 可以，但如果已有用户购买或下载，建议先下架而不是删除。

## 审核标准

管理员会根据以下标准审核 Agent：

1. **功能完整性**: Agent 功能是否完整可用
2. **安全性**: 是否存在安全风险
3. **规范性**: 是否符合平台规范
4. **质量**: 代码质量和文档质量
5. **合法性**: 是否侵犯版权或违反法律

## 下一步

- 查看 [Agent 开发指南](./AGENT_DEVELOPMENT.md)
- 了解 [manifest.json 规范](./MANIFEST_SPEC.md)
- 参考 [Agent 示例](../agent-packages/)
