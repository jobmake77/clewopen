# Agent 上传功能演示

## 功能概述

Agent 上传功能已完成开发，允许开发者将自己的 Agent 包上传到平台。

## 完成的功能

### 1. 后端 API

**文件上传处理**:
- 使用 multer 中间件处理文件上传
- 支持 .zip 格式验证
- 文件大小限制 50MB
- 自动生成唯一文件名
- 存储到 `backend/uploads/agents/` 目录

**API 端点**:
```
POST   /api/agents/upload    # 上传 Agent（需要 developer/admin 权限）
PUT    /api/agents/:id       # 更新 Agent（需要作者或 admin 权限）
DELETE /api/agents/:id       # 删除 Agent（需要作者或 admin 权限）
```

**权限控制**:
- 只有开发者和管理员可以上传
- 只有作者和管理员可以更新/删除
- 使用 JWT Token 认证

### 2. 前端页面

**上传表单** (`/upload-agent`):
- Agent 名称输入
- 描述文本框
- 分类选择器
- 版本号输入
- 标签管理（动态添加/删除）
- 定价类型选择（免费/一次性/订阅）
- 价格输入（非免费时显示）
- 文件上传组件

**导航入口**:
- Header 中的"发布 Agent"按钮
- 仅对开发者和管理员显示
- 点击跳转到上传页面

### 3. 文件存储

**目录结构**:
```
backend/
├── uploads/
│   └── agents/
│       ├── .gitkeep
│       └── package-{timestamp}-{random}.zip
```

**静态文件服务**:
- URL: `http://localhost:5000/uploads/agents/xxx.zip`
- 通过 Express static 中间件提供下载

## 使用流程

### 开发者上传流程

1. **登录**
   - 使用开发者账号登录
   - 测试账号：dev1@example.com / password123

2. **进入上传页面**
   - 点击导航栏"发布 Agent"按钮
   - 或直接访问 `/upload-agent`

3. **填写信息**
   ```
   名称: Python 代码审查助手
   描述: 自动审查 Python 代码质量，提供改进建议
   分类: 开发工具
   版本: 1.0.0
   标签: python, code-review, quality
   定价: 订阅制 - ¥49.9/月
   ```

4. **上传文件**
   - 点击"选择文件"
   - 选择 .zip 格式的 Agent 包
   - 文件大小不超过 50MB

5. **提交审核**
   - 点击"提交审核"按钮
   - 系统验证并上传
   - 创建 Agent 记录（状态：pending）
   - 跳转到用户中心

6. **查看状态**
   - 在用户中心"我的 Agent"查看
   - 等待管理员审核

### 管理员审核流程

1. **查看待审核 Agent**
   - 登录管理员账号
   - 查看状态为 pending 的 Agent

2. **审核决策**
   - 通过：状态改为 published，在市场显示
   - 拒绝：状态改为 rejected，通知开发者

## 技术实现

### 后端关键代码

**文件上传配置**:
```javascript
// backend/api/agents/upload.js
const storage = multer.diskStorage({
  destination: 'uploads/agents',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true)
    } else {
      cb(new Error('只支持 .zip 格式的 Agent 包'))
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }
})
```

**上传控制器**:
```javascript
export const uploadAgent = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { name, description, category, version, price, tags } = req.body

    const agent = await AgentModel.create({
      name,
      description,
      category,
      version,
      author_id: userId,
      package_url: `/uploads/agents/${req.file.filename}`,
      price: JSON.parse(price),
      tags: JSON.parse(tags),
      status: 'pending'
    })

    res.status(201).json({
      success: true,
      data: agent,
      message: 'Agent 上传成功，等待审核'
    })
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path)
    next(error)
  }
}
```

### 前端关键代码

**文件上传**:
```javascript
// frontend/src/pages/UploadAgent/index.jsx
const handleSubmit = async (values) => {
  const formData = new FormData()
  formData.append('package', fileList[0].originFileObj)
  formData.append('name', values.name)
  formData.append('description', values.description)
  formData.append('category', values.category)
  formData.append('version', values.version)
  formData.append('price', JSON.stringify(price))
  formData.append('tags', JSON.stringify(tags))

  const response = await uploadAgent(formData)
  if (response.success) {
    message.success('Agent 上传成功，等待审核')
    navigate('/user-center')
  }
}
```

**权限控制**:
```javascript
// frontend/src/components/Header.jsx
{(user?.role === 'developer' || user?.role === 'admin') && (
  <Button
    type="primary"
    icon={<UploadOutlined />}
    onClick={() => navigate('/upload-agent')}
  >
    发布 Agent
  </Button>
)}
```

## 测试方法

### 方法 1: 使用前端界面

1. 启动服务：
```bash
# 终端 1 - 启动数据库
docker-compose -f docker-compose.dev.yml up -d

# 终端 2 - 启动后端
cd backend
npm run dev

# 终端 3 - 启动前端
cd frontend
npm run dev
```

2. 访问 `http://localhost:5173`
3. 登录开发者账号
4. 点击"发布 Agent"
5. 填写表单并上传文件

### 方法 2: 使用 API 测试

```bash
# 1. 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev1@example.com","password":"password123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. 创建测试 zip 文件
mkdir -p /tmp/test-agent
echo '{"name":"Test Agent","version":"1.0.0"}' > /tmp/test-agent/manifest.json
cd /tmp && zip -q test-agent.zip test-agent/manifest.json

# 3. 上传 Agent
curl -X POST http://localhost:5000/api/agents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "package=@/tmp/test-agent.zip" \
  -F "name=测试 Agent" \
  -F "description=这是一个测试 Agent" \
  -F "category=development" \
  -F "version=1.0.0" \
  -F 'price={"type":"free","amount":0}' \
  -F 'tags=["test","demo"]'

# 4. 清理
rm -rf /tmp/test-agent /tmp/test-agent.zip
```

### 方法 3: 使用测试脚本

```bash
cd backend
./scripts/test-upload.sh
```

## 安全考虑

1. **文件类型验证**: 只允许 .zip 文件
2. **文件大小限制**: 最大 50MB
3. **权限检查**: 只有开发者和管理员可以上传
4. **文件名随机化**: 防止文件名冲突和路径遍历
5. **错误处理**: 失败时自动删除已上传文件
6. **Token 认证**: 所有操作需要有效的 JWT Token

## 待优化功能

1. **manifest.json 验证**
   - 解压 zip 文件
   - 验证 manifest.json 格式
   - 提取元数据

2. **病毒扫描**
   - 集成 ClamAV 或其他扫描工具
   - 上传前自动扫描

3. **版本管理**
   - 同一 Agent 的多版本支持
   - 版本回滚功能

4. **自动化测试**
   - 上传后自动运行测试
   - 生成测试报告

5. **审核系统**
   - 管理员审核界面
   - 审核流程管理
   - 审核历史记录

## 相关文档

- [Agent 上传技术文档](./AGENT_UPLOAD.md)
- [Agent 上传使用指南](./UPLOAD_GUIDE.md)
- [数据库设计](./DATABASE_SCHEMA.md)
- [认证系统](./AUTH_IMPLEMENTATION.md)

## 项目进度

**Phase 1 MVP: 90% 完成**

已完成：
- ✅ 项目架构
- ✅ 数据库设计
- ✅ 用户认证
- ✅ Agent 市场
- ✅ 用户中心
- ✅ Agent 上传

待完成：
- ⏳ manifest.json 验证（5%）
- ⏳ 支付系统（5%）
