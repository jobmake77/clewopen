# OpenCLEW 手动测试清单

## 测试前准备

### 环境检查
- [ ] 后端服务运行在 http://localhost:3001
- [ ] 前端服务运行在 http://localhost:5173
- [ ] PostgreSQL 数据库运行正常
- [ ] 数据库已执行迁移脚本

### 测试工具准备
- [ ] 安装 curl 或 Postman
- [ ] 安装 psql 或数据库客户端
- [ ] 准备测试用户账号

---

## 1. 文件下载功能测试

### 1.1 正常下载流程

**步骤**:
1. 登录系统获取 token
2. 调用下载 API:
   ```bash
   curl -X POST http://localhost:3001/api/agents/{agent_id}/download \
     -H "Authorization: Bearer {your_token}" \
     -H "Content-Type: application/json"
   ```
3. 检查响应

**预期结果**:
- [ ] 返回状态码 200
- [ ] 响应包含 `success: true`
- [ ] 响应包含 `downloadUrl` 字段
- [ ] `downloadUrl` 不为空

**实际结果**: _______________

---

### 1.2 下载链接可访问性测试

**步骤**:
1. 从上一步获取 `downloadUrl`
2. 使用浏览器或 curl 访问该链接:
   ```bash
   curl -I {downloadUrl}
   ```
3. 检查响应头

**预期结果**:
- [ ] 返回状态码 200
- [ ] Content-Type 正确 (如 application/zip)
- [ ] Content-Disposition 包含文件名
- [ ] 文件可以成功下载

**实际结果**: _______________

---

### 1.3 错误处理测试

#### 测试 A: 不存在的 Agent
```bash
curl -X POST http://localhost:3001/api/agents/00000000-0000-0000-0000-000000000000/download \
  -H "Authorization: Bearer {your_token}"
```

**预期结果**:
- [ ] 返回状态码 404
- [ ] 错误消息: "Agent not found"

**实际结果**: _______________

#### 测试 B: 未认证用户
```bash
curl -X POST http://localhost:3001/api/agents/{agent_id}/download
```

**预期结果**:
- [ ] 返回状态码 401
- [ ] 错误消息提示未授权

**实际结果**: _______________

---

## 2. 下载统计功能测试

### 2.1 下载计数增加测试

**步骤**:
1. 查询 Agent 初始下载数:
   ```sql
   SELECT id, name, downloads_count FROM agents WHERE id = '{agent_id}';
   ```
   初始值: _______________

2. 执行下载操作 (使用 1.1 的 API)

3. 再次查询下载数:
   ```sql
   SELECT id, name, downloads_count FROM agents WHERE id = '{agent_id}';
   ```
   新值: _______________

**预期结果**:
- [ ] downloads_count 增加 1
- [ ] 计数更新及时 (1-2秒内)

**实际结果**: _______________

---

### 2.2 下载记录创建测试

**步骤**:
1. 执行下载操作
2. 查询下载记录:
   ```sql
   SELECT * FROM downloads
   WHERE agent_id = '{agent_id}'
   AND user_id = '{user_id}'
   ORDER BY downloaded_at DESC
   LIMIT 5;
   ```

**预期结果**:
- [ ] 存在对应的下载记录
- [ ] agent_id 正确
- [ ] user_id 正确
- [ ] version 字段正确
- [ ] downloaded_at 时间正确
- [ ] ip_address 和 user_agent 已记录

**实际结果**: _______________

---

### 2.3 多次下载累加测试

**步骤**:
1. 记录初始 downloads_count: _______________
2. 连续执行 3 次下载操作
3. 查询最终 downloads_count: _______________

**预期结果**:
- [ ] downloads_count 增加 3
- [ ] downloads 表中有 3 条新记录
- [ ] 每条记录的时间戳不同

**实际结果**: _______________

---

### 2.4 数据库触发器测试

**步骤**:
1. 记录初始 downloads_count: _______________
2. 直接插入下载记录:
   ```sql
   INSERT INTO downloads (agent_id, user_id, version)
   VALUES ('{agent_id}', '{user_id}', '1.0.0');
   ```
3. 查询 downloads_count: _______________

**预期结果**:
- [ ] downloads_count 自动增加 1
- [ ] 触发器立即生效

**实际结果**: _______________

---

## 3. 评分统计功能测试

### 3.1 评价提交测试

**步骤**:
1. 提交评价:
   ```bash
   curl -X POST http://localhost:3001/api/agents/{agent_id}/rate \
     -H "Authorization: Bearer {your_token}" \
     -H "Content-Type: application/json" \
     -d '{
       "rating": 5,
       "comment": "测试评价内容"
     }'
   ```

**预期结果**:
- [ ] 返回状态码 200
- [ ] success: true
- [ ] 提示评价需要审核
- [ ] 返回评价 ID

**实际结果**: _______________

---

### 3.2 评价记录验证测试

**步骤**:
1. 提交评价后查询记录:
   ```sql
   SELECT * FROM reviews
   WHERE agent_id = '{agent_id}'
   AND user_id = '{user_id}';
   ```

**预期结果**:
- [ ] 记录存在
- [ ] rating 值正确 (5)
- [ ] comment 内容正确
- [ ] status = 'pending'
- [ ] created_at 时间正确
- [ ] deleted_at 为 NULL

**实际结果**: _______________

---

### 3.3 评价批准后评分更新测试

**步骤**:
1. 查询 Agent 初始评分:
   ```sql
   SELECT rating_average, reviews_count FROM agents WHERE id = '{agent_id}';
   ```
   初始值: rating_average = ___, reviews_count = ___

2. 批准评价:
   ```sql
   UPDATE reviews SET status = 'approved' WHERE id = '{review_id}';
   ```

3. 等待 1-2 秒后查询新评分:
   ```sql
   SELECT rating_average, reviews_count FROM agents WHERE id = '{agent_id}';
   ```
   新值: rating_average = ___, reviews_count = ___

**预期结果**:
- [ ] rating_average 已更新
- [ ] reviews_count 增加 1
- [ ] 评分计算正确

**实际结果**: _______________

---

### 3.4 多个评价平均分计算测试

**步骤**:
1. 使用不同用户提交 3 个评价:
   - 用户 A: rating = 5
   - 用户 B: rating = 4
   - 用户 C: rating = 3

2. 批准所有评价

3. 查询最终评分:
   ```sql
   SELECT rating_average, reviews_count FROM agents WHERE id = '{agent_id}';
   ```

**预期结果**:
- [ ] rating_average = 4.00 (或接近)
- [ ] reviews_count = 3
- [ ] 平均分计算正确: (5+4+3)/3 = 4.00

**实际结果**: _______________

---

### 3.5 重复评价防止测试

**步骤**:
1. 提交第一次评价 (应成功)
2. 使用同一用户再次提交评价

**预期结果**:
- [ ] 第二次提交返回 400 错误
- [ ] 错误消息: "You have already reviewed this agent"
- [ ] 数据库中只有一条评价记录

**实际结果**: _______________

---

### 3.6 评分范围验证测试

**步骤**:
1. 尝试提交 rating = 0
2. 尝试提交 rating = 6
3. 尝试提交 rating = -1

**预期结果**:
- [ ] 所有请求返回 400 错误
- [ ] 错误消息: "Rating must be between 1 and 5"
- [ ] 数据库中没有创建记录

**实际结果**: _______________

---

### 3.7 评价触发器测试

**步骤**:
1. 查询初始评分: _______________
2. 直接更新评价状态:
   ```sql
   UPDATE reviews SET status = 'approved' WHERE id = '{review_id}';
   ```
3. 查询新评分: _______________

**预期结果**:
- [ ] rating_average 自动更新
- [ ] reviews_count 自动更新
- [ ] 触发器立即生效

**实际结果**: _______________

---

## 4. 集成测试

### 4.1 完整用户流程测试

**步骤**:
1. [ ] 用户注册
2. [ ] 用户登录
3. [ ] 浏览 Agent 列表
4. [ ] 查看 Agent 详情
5. [ ] 下载 Agent
6. [ ] 提交评价
7. [ ] 查看评价列表

**预期结果**:
- [ ] 所有步骤顺利完成
- [ ] 数据在各个页面一致
- [ ] 没有错误或异常

**实际结果**: _______________

---

### 4.2 前端数据显示测试

**步骤**:
1. 在前端查看 Agent 卡片
2. 记录显示的数据:
   - downloads_count: _______________
   - rating_average: _______________
   - reviews_count: _______________

3. 在数据库查询相同数据:
   ```sql
   SELECT downloads_count, rating_average, reviews_count
   FROM agents WHERE id = '{agent_id}';
   ```
   - downloads_count: _______________
   - rating_average: _______________
   - reviews_count: _______________

**预期结果**:
- [ ] 前端和数据库数据完全一致
- [ ] 数据格式正确显示

**实际结果**: _______________

---

### 4.3 并发下载测试

**步骤**:
1. 记录初始 downloads_count: _______________
2. 使用 3 个不同用户同时下载
3. 查询最终 downloads_count: _______________

**预期结果**:
- [ ] downloads_count 正确增加 3
- [ ] 没有数据竞争或丢失
- [ ] 所有下载记录都已创建

**实际结果**: _______________

---

## 5. 性能测试

### 5.1 下载响应时间测试

**步骤**:
1. 使用 curl 测试响应时间:
   ```bash
   curl -w "@curl-format.txt" -o /dev/null -s \
     -X POST http://localhost:3001/api/agents/{agent_id}/download \
     -H "Authorization: Bearer {your_token}"
   ```

**预期结果**:
- [ ] 响应时间 < 500ms
- [ ] 数据库操作高效

**实际结果**: _______________

---

### 5.2 评价提交响应时间测试

**步骤**:
1. 测试评价提交响应时间

**预期结果**:
- [ ] 响应时间 < 300ms

**实际结果**: _______________

---

## 测试总结

### 测试统计
- 总测试项: _______________
- 通过: _______________
- 失败: _______________
- 成功率: _______________%

### 发现的问题
1. _______________
2. _______________
3. _______________

### 改进建议
1. _______________
2. _______________
3. _______________

### 测试人员
- 姓名: _______________
- 日期: _______________
- 签名: _______________
