# 测试指南

## 快速测试流程

### 1. 启动服务

```bash
# 启动数据库
docker-compose -f docker-compose.dev.yml up -d

# 进入后端目录
cd backend

# 运行数据库迁移
npm run db:migrate

# 启动后端服务
npm run dev
```

### 2. 测试 API

#### 获取 Agent 列表

```bash
curl http://localhost:5000/api/agents
```

预期响应：
```json
{
  "success": true,
  "data": {
    "agents": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 6,
      "totalPages": 1
    }
  }
}
```

#### 搜索 Agent

```bash
curl "http://localhost:5000/api/agents?search=小红书"
```

#### 按分类筛选

```bash
curl "http://localhost:5000/api/agents?category=内容创作"
```

#### 获取 Agent 详情

```bash
curl http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
```

#### 下载 Agent

```bash
curl -X POST http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/download \
  -H "Content-Type: application/json" \
  -d '{"userId": "11111111-1111-1111-1111-111111111111"}'
```

#### 评价 Agent

```bash
curl -X POST http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/rate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111",
    "rating": 5,
    "comment": "非常好用的 Agent！"
  }'
```

#### 获取 Agent 评论

```bash
curl http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/reviews
```

### 3. 测试数据库

使用 psql 连接数据库：

```bash
docker exec -it clewopen-postgres psql -U postgres -d clewopen
```

查询示例：

```sql
-- 查看所有 Agent
SELECT id, name, category, price, downloads, rating FROM agents;

-- 查看所有用户
SELECT id, username, email, role FROM users;

-- 查看所有评论
SELECT r.id, a.name as agent_name, u.username, r.rating, r.comment
FROM reviews r
JOIN agents a ON r.agent_id = a.id
JOIN users u ON r.user_id = u.id;

-- 查看下载记录
SELECT d.id, u.username, a.name as agent_name, d.created_at
FROM downloads d
JOIN users u ON d.user_id = u.id
JOIN agents a ON d.agent_id = a.id;
```

### 4. 测试前端

```bash
# 进入前端目录
cd frontend

# 启动开发服务器
npm run dev
```

访问 http://localhost:5173

测试功能：
- ✅ 浏览 Agent 市场
- ✅ 搜索 Agent
- ✅ 查看 Agent 详情
- ⏭️ 下载 Agent（需要登录）
- ⏭️ 评价 Agent（需要登录）

## 自动化测试

### 单元测试（待实现）

```bash
cd backend
npm test
```

### 集成测试（待实现）

```bash
cd backend
npm run test:integration
```

### E2E 测试（待实现）

```bash
cd frontend
npm run test:e2e
```

## 性能测试

### 使用 Apache Bench

```bash
# 测试 Agent 列表 API
ab -n 1000 -c 10 http://localhost:5000/api/agents

# 测试 Agent 详情 API
ab -n 1000 -c 10 http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
```

### 使用 wrk

```bash
# 测试 Agent 列表 API
wrk -t4 -c100 -d30s http://localhost:5000/api/agents
```

## 常见问题

### API 返回 500 错误

检查：
1. 数据库是否运行：`docker ps`
2. 迁移是否完成：`npm run db:migrate`
3. 环境变量是否正确：检查 `.env` 文件
4. 查看后端日志：`npm run dev`

### 数据库连接失败

```bash
# 检查 PostgreSQL 容器状态
docker ps | grep postgres

# 查看容器日志
docker logs clewopen-postgres

# 重启容器
docker-compose -f docker-compose.dev.yml restart postgres
```

### 前端无法连接后端

检查：
1. 后端是否运行在 5000 端口
2. CORS 配置是否正确
3. 前端 API 地址配置：`frontend/src/services/api.js`

## 测试数据

### 测试用户 ID

- Admin: `11111111-1111-1111-1111-111111111111`
- Developer1: `22222222-2222-2222-2222-222222222222`
- Developer2: `33333333-3333-3333-3333-333333333333`
- User1: `44444444-4444-4444-4444-444444444444`

### 测试 Agent ID

- 小红书文案生成器: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
- Python 代码审查助手: `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`
- 数据可视化大师: `cccccccc-cccc-cccc-cccc-cccccccccccc`
- SEO 优化助手: `dddddddd-dddd-dddd-dddd-dddddddddddd`
- UI 设计规范检查器: `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee`
- 会议纪要生成器: `ffffffff-ffff-ffff-ffff-ffffffffffff`

## 下一步

1. 实现用户认证系统
2. 添加前端登录功能
3. 集成下载和评价功能到前端
4. 添加自动化测试
5. 实现 Agent 上传功能
