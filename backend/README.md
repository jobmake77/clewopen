# OpenCLEW Backend

OpenCLEW 平台的后端服务，基于 Node.js + Express + PostgreSQL 构建。

## 技术栈

- **运行时**: Node.js 20+
- **框架**: Express
- **数据库**: PostgreSQL 15+
- **认证**: JWT (jsonwebtoken)
- **文件上传**: Multer
- **日志**: Winston
- **进程管理**: PM2

## 目录结构

```
backend/
├── api/                    # API 路由和控制器
│   ├── agents/            # Agent 相关 API
│   │   ├── controller.js  # Agent 控制器
│   │   ├── routes.js      # Agent 路由
│   │   └── upload.js      # Agent 上传处理
│   ├── auth/              # 认证相关 API
│   ├── reviews/           # 评价相关 API
│   └── users/             # 用户相关 API
├── middleware/            # 中间件
│   ├── auth.js           # 认证中间件
│   └── errorHandler.js   # 错误处理
├── models/               # 数据模型
│   ├── Agent.js         # Agent 模型
│   ├── Review.js        # 评价模型
│   └── User.js          # 用户模型
├── utils/               # 工具函数
│   ├── manifestValidator.js  # manifest 验证
│   └── logger.js        # 日志工具
├── migrations/          # 数据库迁移
├── uploads/            # 上传文件存储
├── logs/               # 日志文件
├── server.js           # 服务器入口
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=3001
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=openclewopen
DB_USER=postgres
DB_PASSWORD=your_password

# JWT 配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB

# 日志配置
LOG_LEVEL=info
```

### 3. 启动数据库

```bash
# 使用 Docker Compose
cd ..
docker-compose -f docker-compose.dev.yml up -d
```

### 4. 运行数据库迁移

```bash
npm run db:migrate
```

### 5. 启动服务

```bash
# 开发模式（带热重载）
npm run dev

# 生产模式
npm start
```

服务将在 `http://localhost:3001` 启动。

## API 文档

### 认证 API

#### 注册
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "user123",
  "email": "user@example.com",
  "password": "password123"
}
```

#### 登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Agent API

#### 获取 Agent 列表
```http
GET /api/agents?page=1&limit=20&category=development&sort=downloads
```

#### 获取 Agent 详情
```http
GET /api/agents/:id
```

#### 上传 Agent
```http
POST /api/agents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <agent.zip>
```

#### 下载 Agent
```http
GET /api/agents/:id/download
```

### 管理员 API

#### 获取所有 Agent（管理员）
```http
GET /api/agents/admin/all?status=pending&page=1&limit=20
Authorization: Bearer <token>
```

#### 获取待审核 Agent
```http
GET /api/agents/admin/pending
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
  "reason": "拒绝原因"
}
```

### 评价 API

#### 提交评价
```http
POST /api/reviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent_id": "uuid",
  "rating": 5,
  "comment": "很好用的 Agent！"
}
```

#### 获取评价列表
```http
GET /api/reviews?agent_id=uuid&status=approved
```

#### 批准评价（管理员）
```http
PUT /api/reviews/:id/approve
Authorization: Bearer <token>
```

#### 拒绝评价（管理员）
```http
PUT /api/reviews/:id/reject
Authorization: Bearer <token>
```

#### 删除评价（管理员）
```http
DELETE /api/reviews/:id
Authorization: Bearer <token>
```

## 数据库

### 迁移管理

```bash
# 运行所有迁移
npm run db:migrate

# 回滚最后一次迁移
npm run db:rollback

# 创建新迁移
npm run db:create-migration <migration_name>
```

### 数据库架构

主要表：
- `users` - 用户表
- `agents` - Agent 表
- `reviews` - 评价表
- `downloads` - 下载记录表

详见 [数据库设计文档](../docs/DATABASE_SCHEMA.md)

## 中间件

### 认证中间件 (authenticate)
验证 JWT token，提取用户信息。

```javascript
const { authenticate } = require('./middleware/auth');

router.get('/protected', authenticate, (req, res) => {
  // req.user 包含用户信息
});
```

### 授权中间件 (authorize)
验证用户角色权限。

```javascript
const { authenticate, authorize } = require('./middleware/auth');

router.get('/admin', authenticate, authorize('admin'), (req, res) => {
  // 只有管理员可以访问
});
```

### 错误处理中间件
统一处理错误响应。

```javascript
app.use(errorHandler);
```

## manifest 验证

Agent 上传时会自动验证 manifest.json 文件。

### 验证规则

1. **必需字段**
   - name, version, description, author, category

2. **分类白名单**
   - development, productivity, data-analysis, automation,
     communication, content-creation, research, other

3. **标签限制**
   - 1-10 个标签

4. **必需文件**
   - manifest.json
   - agent/IDENTITY.md
   - agent/RULES.md

5. **推荐文件**
   - README.md
   - agent/SKILLS.md

6. **禁止文件**
   - .exe, .sh, .bat, .cmd, .dll, .so, .dylib, .app

7. **路径安全**
   - 禁止 ../, ./, __MACOSX/, .git/, .svn/, .DS_Store

详见 [manifest 验证文档](../docs/MANIFEST_VALIDATION.md)

## 日志

日志文件位于 `logs/` 目录：
- `combined.log` - 所有日志
- `error.log` - 错误日志

日志级别：
- `error` - 错误信息
- `warn` - 警告信息
- `info` - 一般信息
- `debug` - 调试信息

## 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "Agent"

# 生成覆盖率报告
npm run test:coverage
```

## 部署

### 使用 PM2

```bash
# 启动
pm2 start ecosystem.config.js

# 停止
pm2 stop openclewopen-backend

# 重启
pm2 restart openclewopen-backend

# 查看日志
pm2 logs openclewopen-backend
```

### 使用 Docker

```bash
# 构建镜像
docker build -t openclewopen-backend .

# 运行容器
docker run -d \
  -p 3001:3001 \
  --env-file .env \
  --name openclewopen-backend \
  openclewopen-backend
```

## 性能优化

1. **数据库连接池**: 使用 pg 连接池
2. **缓存**: 考虑使用 Redis 缓存热门数据
3. **文件存储**: 生产环境建议使用对象存储（S3/OSS）
4. **日志**: 使用日志轮转避免文件过大
5. **监控**: 使用 PM2 监控进程状态

## 安全

1. **JWT**: 使用强密钥，设置合理过期时间
2. **密码**: 使用 bcrypt 加密存储
3. **文件上传**: 验证文件类型和大小
4. **SQL 注入**: 使用参数化查询
5. **XSS**: 对用户输入进行转义
6. **CORS**: 配置允许的源

## 故障排查

### 数据库连接失败
```bash
# 检查数据库是否运行
docker ps | grep postgres

# 检查连接配置
cat .env | grep DB_
```

### 文件上传失败
```bash
# 检查上传目录权限
ls -la uploads/

# 检查磁盘空间
df -h
```

### JWT 验证失败
```bash
# 检查 JWT 密钥配置
cat .env | grep JWT_SECRET

# 检查 token 是否过期
```

## 相关文档

- [API 文档](../docs/api/)
- [数据库设计](../docs/DATABASE_SCHEMA.md)
- [manifest 验证](../docs/MANIFEST_VALIDATION.md)
- [管理员审核指南](../docs/ADMIN_REVIEW.md)

## 更新日志

### 2026-03-11
- ✅ 修复评价提交错误处理
- ✅ 增强 Agent 上传验证
- ✅ 实现管理员审核系统
- ✅ 修复评价重复提交问题

### 2026-03-10
- ✅ 初始版本发布
- ✅ 基础 API 实现
- ✅ 用户认证系统
- ✅ Agent 上传下载功能
