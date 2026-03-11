# 管理员审核指南

## 概述

OpenCLEW 平台提供了完整的管理员审核系统，用于审核用户上传的 Agent 和用户提交的评价。本指南将帮助管理员了解如何使用审核功能。

## 访问管理控制台

### 前置条件
- 拥有管理员权限的账号
- 已登录平台

### 访问方式
1. 登录后，点击右上角用户菜单
2. 选择"管理控制台"选项
3. 进入管理员控制台主页

## Agent 审核

### 审核流程

#### 1. 查看待审核 Agent
- 在管理控制台主页，点击"Agent 审核"卡片
- 或直接访问 `/admin/agents`
- 系统会显示所有状态为 `pending` 的 Agent

#### 2. 审核 Agent 详情
每个待审核 Agent 显示以下信息：
- **基本信息**: 名称、版本、作者
- **描述**: Agent 的功能描述
- **分类和标签**: 所属分类和相关标签
- **上传时间**: Agent 的上传时间
- **文件信息**: 文件大小、下载链接

#### 3. 审核决策

**批准 Agent**
- 点击"批准"按钮
- Agent 状态变更为 `approved`
- 设置 `published_at` 时间戳
- Agent 将在市场中公开展示

**拒绝 Agent**
- 点击"拒绝"按钮
- 输入拒绝原因（可选）
- Agent 状态变更为 `rejected`
- Agent 不会在市场中展示
- 开发者可以修改后重新提交

### 审核标准

#### 必须检查项
1. **文件完整性**
   - 必需文件是否存在（manifest.json, IDENTITY.md, RULES.md）
   - 文件结构是否符合规范

2. **安全性**
   - 是否包含恶意代码
   - 权限声明是否合理
   - 是否存在安全漏洞

3. **内容质量**
   - 描述是否清晰准确
   - 分类和标签是否正确
   - README 是否完整

4. **合规性**
   - 是否违反平台规则
   - 是否侵犯版权
   - 是否包含不当内容

#### 常见拒绝原因
- 缺少必需文件
- 包含可执行文件（.exe, .sh, .bat 等）
- 描述不清晰或误导性
- 分类或标签不正确
- 存在安全风险
- 违反平台规则

## 评价审核

### 审核流程

#### 1. 查看待审核评价
- 在管理控制台主页，点击"评价审核"卡片
- 或直接访问 `/admin/reviews`
- 系统会显示所有状态为 `pending` 的评价

#### 2. 审核评价详情
每个待审核评价显示以下信息：
- **评价者**: 用户名
- **Agent**: 被评价的 Agent 名称
- **评分**: 1-5 星
- **评价内容**: 用户的评价文字
- **提交时间**: 评价的提交时间

#### 3. 审核决策

**批准评价**
- 点击"批准"按钮
- 评价状态变更为 `approved`
- 评价将在 Agent 详情页展示
- 评分将计入 Agent 的平均分

**拒绝评价**
- 点击"拒绝"按钮
- 输入拒绝原因（可选）
- 评价状态变更为 `rejected`
- 评价不会展示
- 用户可以重新提交评价

**删除评价**
- 点击"删除"按钮
- 评价被软删除（设置 `deleted_at`）
- 评价永久不展示

### 审核标准

#### 必须检查项
1. **内容质量**
   - 评价是否真实有效
   - 是否提供有价值的反馈
   - 语言是否文明礼貌

2. **合规性**
   - 是否包含不当内容
   - 是否存在恶意攻击
   - 是否违反平台规则

3. **真实性**
   - 是否为刷分行为
   - 是否为恶意差评
   - 评分与内容是否匹配

#### 常见拒绝原因
- 包含不当言论或侮辱性语言
- 明显的刷分行为
- 评价内容与 Agent 无关
- 恶意差评或攻击
- 违反平台规则

## API 接口

### Agent 审核 API

#### 获取所有 Agent（管理员）
```http
GET /api/agents/admin/all?status=pending&page=1&limit=20
Authorization: Bearer <token>
```

**查询参数**:
- `status`: 筛选状态（pending/approved/rejected）
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）

#### 获取待审核 Agent
```http
GET /api/agents/admin/pending?page=1&limit=20
Authorization: Bearer <token>
```

#### 批准 Agent
```http
POST /api/agents/admin/:id/approve
Authorization: Bearer <token>
```

#### 拒绝 Agent
```http
POST /api/agents/admin/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "拒绝原因（可选）"
}
```

### 评价审核 API

#### 获取所有评价
```http
GET /api/reviews?status=pending&page=1&limit=20
Authorization: Bearer <token>
```

#### 批准评价
```http
PUT /api/reviews/:id/approve
Authorization: Bearer <token>
```

#### 拒绝评价
```http
PUT /api/reviews/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "拒绝原因（可选）"
}
```

#### 删除评价
```http
DELETE /api/reviews/:id
Authorization: Bearer <token>
```

## 权限控制

### 管理员权限
- 所有审核 API 都需要管理员权限
- 使用 `authorize('admin')` 中间件验证
- 非管理员访问会返回 403 Forbidden

### 权限验证流程
1. 用户登录获取 JWT token
2. 请求时携带 token
3. `authenticate` 中间件验证 token
4. `authorize('admin')` 中间件验证角色
5. 通过验证后执行操作

## 最佳实践

### 审核效率
1. **优先级排序**: 先审核上传时间较早的内容
2. **批量处理**: 集中时间处理待审核内容
3. **快速决策**: 对明显违规内容快速拒绝
4. **详细记录**: 拒绝时提供清晰的原因

### 审核质量
1. **仔细检查**: 不要遗漏安全风险
2. **公平公正**: 统一审核标准
3. **及时反馈**: 尽快完成审核
4. **持续改进**: 根据反馈优化审核标准

### 安全注意事项
1. **下载检查**: 下载 Agent 文件前确认安全
2. **隔离环境**: 在隔离环境中测试 Agent
3. **权限审查**: 检查 Agent 请求的权限是否合理
4. **代码审查**: 对可疑代码进行详细审查

## 常见问题

### Q: 如何处理边界情况？
A: 对于不确定的情况，可以：
- 先拒绝，要求开发者提供更多信息
- 咨询其他管理员
- 参考平台规则和社区标准

### Q: 用户对审核结果有异议怎么办？
A:
- 用户可以通过 GitHub Issues 提出申诉
- 管理员重新审核并给出详细解释
- 必要时可以调整审核决策

### Q: 如何处理大量待审核内容？
A:
- 增加管理员人数
- 使用筛选和排序功能
- 优先处理重要或紧急的内容

### Q: 审核后可以修改决策吗？
A:
- 可以通过 API 重新审核
- 批准的可以改为拒绝
- 拒绝的可以改为批准
- 所有操作都会记录在数据库中

## 相关文档

- [API 文档](api/)
- [数据库设计](DATABASE_SCHEMA.md)
- [manifest 验证](MANIFEST_VALIDATION.md)
- [贡献指南](../CONTRIBUTING.md)

## 更新日志

- 2026-03-11: 初始版本，包含 Agent 和评价审核功能
