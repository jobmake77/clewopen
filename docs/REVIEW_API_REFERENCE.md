# 评价系统 API 快速参考

## 用户端点

### 提交评价
```bash
POST /api/agents/:agentId/rate
Authorization: Bearer <token>

{
  "rating": 5,
  "comment": "很棒的 Agent！"
}
```

### 查看 Agent 评价
```bash
GET /api/agents/:agentId/reviews?page=1&pageSize=10
```

### 更新自己的评价
```bash
PUT /api/reviews/:reviewId
Authorization: Bearer <token>

{
  "rating": 4,
  "comment": "更新后的评论"
}
```

## 管理员端点

### 获取所有评价
```bash
GET /api/reviews?status=pending&page=1&pageSize=20
Authorization: Bearer <admin-token>
```

### 批准评价
```bash
POST /api/reviews/:reviewId/approve
Authorization: Bearer <admin-token>
```

### 拒绝评价
```bash
POST /api/reviews/:reviewId/reject
Authorization: Bearer <admin-token>

{
  "reason": "违反规范"
}
```

### 删除评价
```bash
DELETE /api/reviews/:reviewId
Authorization: Bearer <admin-token>
```

### 查看单个评价详情
```bash
GET /api/reviews/:reviewId
Authorization: Bearer <admin-token>
```

## 测试命令

### 测试评分更新
```bash
cd backend
node scripts/test-rating-update.js
```

### 重新计算所有评分
```bash
cd backend
node scripts/recalculate-ratings.js
```

## 数据库迁移

### 应用改进的触发器
```bash
cd backend
psql $DATABASE_URL -f migrations/003_improve_review_rating_trigger.sql
```

## 常见问题

### Q: 评分没有自动更新？
A: 检查评价状态是否为 'approved'，只有已批准的评价才会计入统计。

### Q: 如何手动修复统计数据？
A: 运行 `node scripts/recalculate-ratings.js`

### Q: 用户可以修改已批准的评价吗？
A: 不可以，只能修改 pending 状态的评价。管理员可以修改任何状态的评价。
