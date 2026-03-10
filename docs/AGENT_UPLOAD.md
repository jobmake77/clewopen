# Agent 上传功能实现文档

## 功能概述

Agent 上传功能允许开发者和管理员将自己开发的 Agent 包上传到平台，经过审核后发布到市场供其他用户使用。

## 后端实现

### 1. 文件上传配置

使用 `multer` 中间件处理文件上传：

```javascript
// backend/api/agents/upload.js
import multer from 'multer'

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
    // 只允许 .zip 文件
    if (path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true)
    } else {
      cb(new Error('只支持 .zip 格式的 Agent 包'))
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  }
})
```

### 2. API 端点

#### 上传 Agent
```
POST /api/agents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**请求参数**:
- `package` (file): Agent 包文件（.zip 格式）
- `name` (string): Agent 名称
- `description` (string): Agent 描述
- `category` (string): 分类
- `version` (string): 版本号
- `price` (JSON string): 价格信息
- `tags` (JSON string): 标签数组

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Python 代码审查助手",
    "status": "pending",
    ...
  },
  "message": "Agent 上传成功，等待审核"
}
```

#### 更新 Agent
```
PUT /api/agents/:id
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**权限**: 只有 Agent 作者或管理员可以更新

#### 删除 Agent
```
DELETE /api/agents/:id
Authorization: Bearer <token>
```

**权限**: 只有 Agent 作者或管理员可以删除

### 3. 权限控制

使用 `authorize` 中间件限制只有开发者和管理员可以上传：

```javascript
router.post('/upload',
  authenticate,
  authorize('developer', 'admin'),
  upload.single('package'),
  uploadAgent
)
```

### 4. 文件存储

- 上传的文件存储在 `backend/uploads/agents/` 目录
- 文件名格式：`package-{timestamp}-{random}.zip`
- 数据库中存储相对路径：`/uploads/agents/package-xxx.zip`
- 通过静态文件服务提供下载：`http://localhost:5000/uploads/agents/package-xxx.zip`

## 前端实现

### 1. 上传页面

位置：`frontend/src/pages/UploadAgent/index.jsx`

**功能**:
- Agent 基本信息表单
- 文件上传组件
- 标签管理
- 定价设置
- 表单验证

### 2. 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | Input | 是 | Agent 名称 |
| description | TextArea | 是 | Agent 描述 |
| category | Select | 是 | 分类选择 |
| version | Input | 是 | 版本号（如 1.0.0） |
| tags | Tag | 否 | 标签列表 |
| priceType | Select | 是 | 定价类型（免费/一次性/订阅） |
| amount | InputNumber | 条件 | 价格（非免费时必填） |
| package | Upload | 是 | Agent 包文件 |

### 3. 文件上传

```javascript
<Upload
  fileList={fileList}
  onChange={handleFileChange}
  beforeUpload={() => false}  // 阻止自动上传
  accept=".zip"
  maxCount={1}
>
  <Button icon={<UploadOutlined />}>选择文件</Button>
</Upload>
```

### 4. 提交处理

```javascript
const handleSubmit = async (values) => {
  const formData = new FormData()
  formData.append('package', fileList[0].originFileObj)
  formData.append('name', values.name)
  formData.append('description', values.description)
  // ... 其他字段

  const response = await uploadAgent(formData)
  // 处理响应
}
```

## 路由配置

### 前端路由

```javascript
// App.jsx
<Route path="/upload-agent" element={<UploadAgent />} />
```

### 导航入口

在 Header 组件中，开发者和管理员可以看到"发布 Agent"按钮：

```javascript
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

## 审核流程

1. **上传**: 开发者上传 Agent 包，状态设置为 `pending`
2. **审核**: 管理员在后台审核 Agent
3. **发布**: 审核通过后，状态改为 `published`，在市场中显示
4. **拒绝**: 审核不通过，状态改为 `rejected`，通知开发者

## 安全考虑

1. **文件类型验证**: 只允许 .zip 文件
2. **文件大小限制**: 最大 50MB
3. **权限检查**: 只有开发者和管理员可以上传
4. **文件名随机化**: 防止文件名冲突和路径遍历攻击
5. **错误处理**: 上传失败时自动删除已上传的文件

## 待实现功能

1. **manifest.json 验证**: 解压 zip 文件，验证 manifest.json 格式
2. **病毒扫描**: 上传文件的安全扫描
3. **版本管理**: 同一 Agent 的多版本管理
4. **自动化测试**: 上传后自动运行测试
5. **审核系统**: 管理员审核界面

## 使用示例

### 开发者上传流程

1. 登录账号（角色为 developer 或 admin）
2. 点击导航栏的"发布 Agent"按钮
3. 填写 Agent 信息：
   - 名称：Python 代码审查助手
   - 描述：自动审查 Python 代码质量
   - 分类：开发工具
   - 版本：1.0.0
   - 标签：python, code-review, quality
   - 定价：免费
4. 上传 Agent 包文件（.zip 格式）
5. 点击"提交审核"
6. 等待管理员审核

### 测试账号

使用开发者账号测试：
- 邮箱：dev1@example.com
- 密码：password123
- 角色：developer

## 相关文件

**后端**:
- `backend/api/agents/upload.js` - 上传控制器
- `backend/api/agents/routes.js` - 路由配置
- `backend/uploads/agents/` - 文件存储目录

**前端**:
- `frontend/src/pages/UploadAgent/index.jsx` - 上传页面
- `frontend/src/pages/UploadAgent/index.css` - 页面样式
- `frontend/src/services/agentService.js` - API 服务
- `frontend/src/components/Header.jsx` - 导航栏（包含上传入口）

## 依赖包

```json
{
  "multer": "^1.4.5-lts.1"
}
```
