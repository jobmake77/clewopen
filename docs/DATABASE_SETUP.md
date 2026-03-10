# 数据库设置指南

## 快速开始

### 1. 启动 PostgreSQL

使用 Docker（推荐）：

```bash
# 启动 PostgreSQL 和 Redis
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f postgres
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clewopen
DB_USER=postgres
DB_PASSWORD=postgres
```

### 3. 安装依赖

```bash
npm install
```

### 4. 运行数据库迁移

```bash
# 运行所有迁移（创建表结构和种子数据）
npm run db:migrate
```

### 5. 启动后端服务

```bash
npm run dev
```

### 6. 测试 API

```bash
# 获取 Agent 列表
curl http://localhost:5000/api/agents

# 获取特定 Agent
curl http://localhost:5000/api/agents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
```

## 数据库命令

### 运行迁移

```bash
npm run db:migrate
```

这会：
1. 创建所有表
2. 创建索引和触发器
3. 插入种子数据（测试用户和 Agent）

### 重置数据库

```bash
# 警告：这会删除所有数据！
npm run db:reset

# 然后重新运行迁移
npm run db:migrate
```

## 测试数据

迁移脚本会创建以下测试数据：

### 测试用户

| 用户名 | 邮箱 | 密码 | 角色 |
|--------|------|------|------|
| admin | admin@clewopen.com | password123 | admin |
| developer1 | dev1@example.com | password123 | developer |
| developer2 | dev2@example.com | password123 | developer |
| user1 | user1@example.com | password123 | user |

### 测试 Agent

1. **小红书文案生成器** (xiaohongshu-writer)
   - 作者: developer1
   - 价格: ¥29.9/月
   - 分类: 内容创作

2. **Python 代码审查助手** (python-code-reviewer)
   - 作者: developer1
   - 价格: ¥49.9/月
   - 分类: 软件开发

3. **数据可视化大师** (data-viz-master)
   - 作者: developer2
   - 价格: ¥99.0 (一次性)
   - 分类: 数据分析

4. **SEO 优化助手** (seo-optimizer)
   - 作者: developer2
   - 价格: ¥39.9/月
   - 分类: 营销推广

5. **UI 设计规范检查器** (ui-design-checker)
   - 作者: developer1
   - 价格: 免费
   - 分类: 设计工具

6. **会议纪要生成器** (meeting-notes-generator)
   - 作者: developer2
   - 价格: ¥19.9/月
   - 分类: 通用办公

## 数据库结构

### 主要表

- **users**: 用户表
- **agents**: Agent 表
- **reviews**: 评价表
- **downloads**: 下载记录表
- **orders**: 订单表
- **categories**: 分类表

### 关系

```
users (1) ─── (N) agents
users (1) ─── (N) reviews
users (1) ─── (N) downloads
users (1) ─── (N) orders

agents (1) ─── (N) reviews
agents (1) ─── (N) downloads
agents (1) ─── (N) orders
```

详细的 schema 设计请查看 `docs/DATABASE_SCHEMA.md`

## 常见问题

### Q: 连接数据库失败

**A**: 检查以下几点：
1. PostgreSQL 容器是否运行：`docker ps`
2. 端口是否正确：默认 5432
3. 环境变量是否正确配置

### Q: 迁移失败

**A**:
1. 检查数据库是否已存在表：可能需要先运行 `npm run db:reset`
2. 查看错误日志，确认具体问题
3. 确保 PostgreSQL 版本 >= 15

### Q: 如何查看数据库内容？

**A**: 使用 psql 或 GUI 工具：

```bash
# 使用 psql
docker exec -it clewopen-postgres psql -U postgres -d clewopen

# 查看所有表
\dt

# 查看 agents 表
SELECT * FROM agents;

# 退出
\q
```

或使用 GUI 工具：
- [pgAdmin](https://www.pgadmin.org/)
- [DBeaver](https://dbeaver.io/)
- [TablePlus](https://tableplus.com/)

### Q: 如何备份数据库？

**A**:

```bash
# 备份
docker exec clewopen-postgres pg_dump -U postgres clewopen > backup.sql

# 恢复
docker exec -i clewopen-postgres psql -U postgres clewopen < backup.sql
```

## 性能优化

### 1. 索引

数据库已经创建了必要的索引：
- 用户邮箱和用户名
- Agent 分类、状态、标签
- 全文搜索索引

### 2. 连接池

后端使用 pg Pool，配置：
- 最大连接数: 20
- 空闲超时: 30秒
- 连接超时: 2秒

### 3. 查询优化

使用 EXPLAIN ANALYZE 分析慢查询：

```sql
EXPLAIN ANALYZE
SELECT * FROM agents WHERE category = '内容创作';
```

## 下一步

1. ✅ 数据库设计完成
2. ✅ 迁移脚本创建
3. ✅ 数据模型实现
4. ✅ API 更新使用真实数据
5. ⏭️ 实现用户认证系统
6. ⏭️ 实现 Agent 上传功能

查看 `tasks/todo.md` 了解完整的任务列表。
