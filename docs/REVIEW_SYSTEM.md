# 评价系统与评分统计

## 概述

OpenCLEW 的评价系统支持用户对 Agent 进行评分和评论。评价需要经过审核才能显示，并且只有已批准的评价才会计入 Agent 的平均评分和评价数量。

## 数据库设计

### reviews 表

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id),
  user_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(agent_id, user_id)
);
```

### agents 表中的统计字段

```sql
rating_average DECIMAL(3, 2) DEFAULT 0, -- 平均评分 (0.00 - 5.00)
reviews_count INTEGER DEFAULT 0,        -- 评价数量
```

## 自动更新机制

### 数据库触发器

系统使用 PostgreSQL 触发器自动更新 Agent 的评分统计：

```sql
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_agent_id UUID;
BEGIN
  -- 确定要更新的 agent_id
  IF TG_OP = 'DELETE' THEN
    target_agent_id := OLD.agent_id;
  ELSE
    target_agent_id := NEW.agent_id;
  END IF;

  -- 更新 Agent 统计信息
  UPDATE agents
  SET
    rating_average = (
      SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
      FROM reviews
      WHERE agent_id = target_agent_id
        AND status = 'approved'
        AND deleted_at IS NULL
    ),
    reviews_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE agent_id = target_agent_id
        AND status = 'approved'
        AND deleted_at IS NULL
    )
  WHERE id = target_agent_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_rating_on_review
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_agent_rating();
```

### 触发时机

触发器会在以下情况下自动更新 Agent 的评分统计：

1. **新增评价** (INSERT)
2. **更新评价** (UPDATE) - 包括状态变更、评分修改等
3. **删除评价** (DELETE/软删除)

### 统计规则

- **只统计已批准的评价**：`status = 'approved'`
- **排除软删除的评价**：`deleted_at IS NULL`
- **平均评分**：使用 PostgreSQL 的 `AVG()` 函数计算
- **评价数量**：使用 `COUNT()` 函数统计

## API 接口

### 用户接口

#### 1. 提交评价

```http
POST /api/agents/:id/rate
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 5,
  "comment": "非常好用的 Agent！"
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "review": {
      "id": "uuid",
      "agent_id": "uuid",
      "user_id": "uuid",
      "rating": 5,
      "comment": "非常好用的 Agent！",
      "status": "pending",
      "created_at": "2026-03-10T10:00:00Z"
    },
    "message": "Review submitted successfully. It will be visible after approval."
  }
}
```

#### 2. 更新自己的评价（仅限 pending 状态）

```http
PUT /api/reviews/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 4,
  "comment": "更新后的评论"
}
```

#### 3. 查看 Agent 的评价列表

```http
GET /api/agents/:id/reviews?page=1&pageSize=10
```

**响应**：

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "rating": 5,
        "comment": "非常好用！",
        "username": "user123",
        "avatar_url": "https://...",
        "created_at": "2026-03-10T10:00:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 10
  }
}
```

### 管理员接口

#### 1. 获取所有评价（支持筛选）

```http
GET /api/reviews?status=pending&page=1&pageSize=20
Authorization: Bearer <admin-token>
```

**查询参数**：
- `status`: 筛选状态 (pending/approved/rejected)
- `agentId`: 筛选特定 Agent 的评价
- `page`: 页码
- `pageSize`: 每页数量

#### 2. 批准评价

```http
POST /api/reviews/:id/approve
Authorization: Bearer <admin-token>
```

**效果**：
- 评价状态变为 `approved`
- 触发器自动更新 Agent 的 `rating_average` 和 `reviews_count`

#### 3. 拒绝评价

```http
POST /api/reviews/:id/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "违反社区规范"
}
```

**效果**：
- 评价状态变为 `rejected`
- 如果之前是 `approved` 状态，触发器会重新计算评分（排除该评价）

#### 4. 删除评价

```http
DELETE /api/reviews/:id
Authorization: Bearer <admin-token>
```

**效果**：
- 软删除评价（设置 `deleted_at`）
- 触发器自动更新 Agent 的评分统计

## 工作流程

### 用户提交评价流程

```
1. 用户提交评价
   ↓
2. 创建 review 记录 (status='pending')
   ↓
3. 触发器执行，但因为 status='pending'，不影响统计
   ↓
4. 管理员审核
   ↓
5a. 批准 → status='approved' → 触发器更新统计
5b. 拒绝 → status='rejected' → 不影响统计
```

### 评分统计更新流程

```
评价状态变更 (INSERT/UPDATE/DELETE)
   ↓
触发器 update_agent_rating_on_review
   ↓
查询该 Agent 所有 approved 且未删除的评价
   ↓
计算 AVG(rating) 和 COUNT(*)
   ↓
更新 agents 表的 rating_average 和 reviews_count
```

## 测试

### 运行测试脚本

```bash
cd backend
node scripts/test-rating-update.js
```

测试脚本会：
1. 创建一个 pending 评价
2. 验证统计未变化
3. 批准评价
4. 验证统计已更新
5. 拒绝评价
6. 验证统计已回退
7. 删除评价
8. 验证统计已更新

### 手动测试

```sql
-- 1. 查看 Agent 当前统计
SELECT id, name, rating_average, reviews_count
FROM agents
WHERE id = 'your-agent-id';

-- 2. 创建测试评价
INSERT INTO reviews (agent_id, user_id, rating, comment, status)
VALUES ('your-agent-id', 'your-user-id', 5, 'Test', 'pending');

-- 3. 批准评价
UPDATE reviews
SET status = 'approved'
WHERE agent_id = 'your-agent-id' AND user_id = 'your-user-id';

-- 4. 再次查看统计（应该已更新）
SELECT id, name, rating_average, reviews_count
FROM agents
WHERE id = 'your-agent-id';

-- 5. 验证计算是否正确
SELECT
  AVG(rating)::DECIMAL(3,2) as calculated_avg,
  COUNT(*) as calculated_count
FROM reviews
WHERE agent_id = 'your-agent-id'
  AND status = 'approved'
  AND deleted_at IS NULL;
```

## 注意事项

### 1. 性能考虑

- 触发器在每次评价变更时都会执行
- 对于高频更新的场景，可能需要考虑异步更新或缓存
- 当前实现适合中小规模应用

### 2. 数据一致性

- 触发器保证了数据的强一致性
- 评分统计始终反映最新的已批准评价
- 软删除机制保留了历史记录

### 3. 边界情况

- 没有评价时，`rating_average` 为 0
- 所有评价都被拒绝或删除时，统计会归零
- 用户只能对每个 Agent 评价一次（数据库约束）

### 4. 扩展建议

如果需要更高性能，可以考虑：

1. **异步更新**：使用消息队列延迟更新统计
2. **缓存**：使用 Redis 缓存评分统计
3. **定时任务**：定期批量重新计算所有 Agent 的统计
4. **物化视图**：使用 PostgreSQL 物化视图

## 故障排查

### 问题：评分没有自动更新

**检查步骤**：

1. 确认触发器是否存在：
```sql
SELECT * FROM pg_trigger WHERE tgname = 'update_agent_rating_on_review';
```

2. 确认触发器函数是否存在：
```sql
SELECT * FROM pg_proc WHERE proname = 'update_agent_rating';
```

3. 检查评价状态：
```sql
SELECT status, COUNT(*) FROM reviews GROUP BY status;
```

4. 手动触发更新：
```sql
UPDATE reviews SET updated_at = CURRENT_TIMESTAMP WHERE id = 'review-id';
```

### 问题：统计数据不准确

**解决方案**：

运行修复脚本重新计算所有 Agent 的统计：

```sql
UPDATE agents
SET
  rating_average = (
    SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
    FROM reviews
    WHERE agent_id = agents.id
      AND status = 'approved'
      AND deleted_at IS NULL
  ),
  reviews_count = (
    SELECT COUNT(*)
    FROM reviews
    WHERE agent_id = agents.id
      AND status = 'approved'
      AND deleted_at IS NULL
  )
WHERE deleted_at IS NULL;
```

## 相关文件

- `/backend/migrations/001_create_initial_tables.sql` - 初始数据库 schema
- `/backend/migrations/003_improve_review_rating_trigger.sql` - 改进的触发器
- `/backend/models/Review.js` - Review 模型
- `/backend/models/Agent.js` - Agent 模型
- `/backend/api/reviews/controller.js` - 评价管理控制器
- `/backend/api/reviews/routes.js` - 评价管理路由
- `/backend/api/agents/controller.js` - Agent 控制器（包含评价提交）
- `/backend/scripts/test-rating-update.js` - 测试脚本
