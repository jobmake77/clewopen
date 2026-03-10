# 评分统计更新功能 - 部署检查清单

## 📋 部署前检查

### 1. 文件完整性检查

- [x] `/backend/api/reviews/controller.js` - 评价管理控制器
- [x] `/backend/api/reviews/routes.js` - 评价管理路由
- [x] `/backend/migrations/003_improve_review_rating_trigger.sql` - 改进的触发器
- [x] `/backend/scripts/test-rating-update.js` - 测试脚本
- [x] `/backend/scripts/recalculate-ratings.js` - 修复脚本
- [x] `/backend/src/index.js` - 已添加 reviews 路由
- [x] `/docs/REVIEW_SYSTEM.md` - 系统文档
- [x] `/docs/REVIEW_API_REFERENCE.md` - API 参考
- [x] `/docs/IMPLEMENTATION_SUMMARY.md` - 实现总结

### 2. 数据库检查

```bash
# 检查触发器是否存在
psql $DATABASE_URL -c "SELECT tgname FROM pg_trigger WHERE tgname = 'update_agent_rating_on_review';"

# 检查触发器函数是否存在
psql $DATABASE_URL -c "SELECT proname FROM pg_proc WHERE proname = 'update_agent_rating';"

# 检查 agents 表字段
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agents' AND column_name IN ('rating_average', 'reviews_count');"

# 检查 reviews 表字段
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reviews' AND column_name IN ('rating', 'status');"
```

### 3. 依赖检查

```bash
cd backend
npm list express
npm list pg
```

## 🚀 部署步骤

### 步骤 1: 应用数据库迁移

```bash
cd /Users/a77/Desktop/clewopen/backend
psql $DATABASE_URL -f migrations/003_improve_review_rating_trigger.sql
```

**预期输出**：
```
DROP TRIGGER
CREATE FUNCTION
CREATE TRIGGER
COMMENT
```

### 步骤 2: 验证触发器

```bash
psql $DATABASE_URL -c "SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'update_agent_rating_on_review';"
```

**预期输出**：应该显示触发器存在

### 步骤 3: 重启后端服务

```bash
cd /Users/a77/Desktop/clewopen/backend
npm run dev
```

**预期输出**：
```
🚀 Server running on http://localhost:5000
```

### 步骤 4: 运行测试脚本

```bash
cd /Users/a77/Desktop/clewopen/backend
node scripts/test-rating-update.js
```

**预期输出**：
```
✅ Rating update test completed successfully!
```

### 步骤 5: 修复现有数据（可选）

如果数据库中已有评价数据，运行此脚本重新计算统计：

```bash
cd /Users/a77/Desktop/clewopen/backend
node scripts/recalculate-ratings.js
```

## ✅ 功能验证

### 测试 1: 用户提交评价

```bash
# 替换 {agent-id} 和 {user-token}
curl -X POST http://localhost:5000/api/agents/{agent-id}/rate \
  -H "Authorization: Bearer {user-token}" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "测试评价"}'
```

**预期结果**：
- 返回 200 状态码
- 评价状态为 `pending`
- Agent 统计未变化

### 测试 2: 管理员批准评价

```bash
# 替换 {review-id} 和 {admin-token}
curl -X POST http://localhost:5000/api/reviews/{review-id}/approve \
  -H "Authorization: Bearer {admin-token}"
```

**预期结果**：
- 返回 200 状态码
- 评价状态变为 `approved`
- Agent 的 `rating_average` 和 `reviews_count` 自动更新

### 测试 3: 查看 Agent 统计

```bash
curl http://localhost:5000/api/agents/{agent-id}
```

**预期结果**：
- `rating_average` 显示正确的平均评分
- `reviews_count` 显示已批准的评价数量

### 测试 4: 查看评价列表

```bash
curl http://localhost:5000/api/agents/{agent-id}/reviews
```

**预期结果**：
- 只显示 `status = 'approved'` 的评价
- 包含用户信息和评价内容

### 测试 5: 管理员查看所有评价

```bash
curl http://localhost:5000/api/reviews?status=pending \
  -H "Authorization: Bearer {admin-token}"
```

**预期结果**：
- 显示所有 pending 状态的评价
- 包含 Agent 和用户信息

## 🔍 故障排查

### 问题 1: 触发器未执行

**症状**：批准评价后，Agent 统计未更新

**检查步骤**：
```bash
# 1. 检查触发器是否存在
psql $DATABASE_URL -c "SELECT * FROM pg_trigger WHERE tgname = 'update_agent_rating_on_review';"

# 2. 检查触发器函数
psql $DATABASE_URL -c "SELECT prosrc FROM pg_proc WHERE proname = 'update_agent_rating';"

# 3. 手动触发更新
psql $DATABASE_URL -c "UPDATE reviews SET updated_at = CURRENT_TIMESTAMP WHERE id = '{review-id}';"
```

**解决方案**：
```bash
# 重新应用迁移
psql $DATABASE_URL -f migrations/003_improve_review_rating_trigger.sql
```

### 问题 2: 统计数据不准确

**症状**：`rating_average` 或 `reviews_count` 与实际不符

**解决方案**：
```bash
# 运行修复脚本
node scripts/recalculate-ratings.js
```

### 问题 3: API 返回 404

**症状**：访问 `/api/reviews` 返回 404

**检查步骤**：
```bash
# 1. 检查路由是否注册
grep -n "reviewRoutes" backend/src/index.js

# 2. 检查文件是否存在
ls -la backend/api/reviews/
```

**解决方案**：
- 确保 `/backend/src/index.js` 中导入并注册了 `reviewRoutes`
- 重启服务器

### 问题 4: 权限错误

**症状**：管理员端点返回 403

**检查步骤**：
```bash
# 检查用户角色
psql $DATABASE_URL -c "SELECT id, username, role FROM users WHERE id = '{user-id}';"
```

**解决方案**：
- 确保用户角色为 `admin`
- 检查 JWT token 是否有效

## 📊 监控指标

### 关键指标

1. **评价提交成功率**
   - 监控 `POST /api/agents/:id/rate` 的成功率

2. **评价批准延迟**
   - 监控从 `pending` 到 `approved` 的平均时间

3. **统计更新延迟**
   - 监控触发器执行时间（应该 < 100ms）

4. **数据一致性**
   - 定期运行 `recalculate-ratings.js` 检查不一致

### 监控查询

```sql
-- 各状态评价数量
SELECT status, COUNT(*) FROM reviews GROUP BY status;

-- 平均评分分布
SELECT
  CASE
    WHEN rating_average >= 4.5 THEN '4.5-5.0'
    WHEN rating_average >= 4.0 THEN '4.0-4.5'
    WHEN rating_average >= 3.0 THEN '3.0-4.0'
    ELSE '< 3.0'
  END as rating_range,
  COUNT(*) as agent_count
FROM agents
WHERE reviews_count > 0
GROUP BY rating_range;

-- 待审核评价数量
SELECT COUNT(*) as pending_reviews
FROM reviews
WHERE status = 'pending' AND deleted_at IS NULL;
```

## 📝 维护任务

### 每日任务
- [ ] 检查待审核评价数量
- [ ] 处理待审核评价

### 每周任务
- [ ] 运行 `recalculate-ratings.js` 验证数据一致性
- [ ] 检查异常评分（如全是 1 星或 5 星）

### 每月任务
- [ ] 分析评价趋势
- [ ] 优化触发器性能（如果需要）
- [ ] 清理被拒绝的评价（可选）

## 🎯 成功标准

部署成功的标志：

- ✅ 所有测试通过
- ✅ 用户可以提交评价
- ✅ 管理员可以批准/拒绝评价
- ✅ 批准后统计自动更新
- ✅ 统计数据准确无误
- ✅ API 响应时间 < 200ms
- ✅ 无数据库错误日志

## 📞 支持

如有问题，请参考：
- `/docs/REVIEW_SYSTEM.md` - 完整系统文档
- `/docs/REVIEW_API_REFERENCE.md` - API 参考
- `/docs/IMPLEMENTATION_SUMMARY.md` - 实现总结

或运行测试脚本诊断：
```bash
node scripts/test-rating-update.js
```
