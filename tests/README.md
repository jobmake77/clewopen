# OpenCLEW 测试文档

本目录包含 OpenCLEW 项目的测试脚本和文档，用于验证文件下载、下载统计、评分统计等核心功能。

## 目录结构

```
tests/
├── README.md                    # 本文件
├── test-plan.md                 # 详细测试计划
├── manual-test-checklist.md     # 手动测试清单
├── run-tests.sh                 # Bash 自动化测试脚本
├── run-tests.js                 # Node.js 自动化测试脚本
└── package.json                 # Node.js 测试依赖
```

## 测试环境要求

### 服务运行
- 后端服务: http://localhost:3001
- 前端服务: http://localhost:5173
- PostgreSQL 数据库 (Docker)

### 工具依赖
- Node.js >= 16
- curl
- psql (PostgreSQL 客户端)
- jq (JSON 处理工具，可选)

## 快速开始

### 方法 1: 使用 Node.js 自动化测试 (推荐)

1. 安装依赖:
```bash
cd tests
npm install
```

2. 确保服务运行:
```bash
# 在项目根目录
docker-compose up -d  # 启动数据库
cd backend && npm run dev  # 启动后端
cd frontend && npm run dev  # 启动前端
```

3. 运行测试:
```bash
npm test
```

### 方法 2: 使用 Bash 脚本测试

1. 给脚本添加执行权限:
```bash
chmod +x run-tests.sh
```

2. 运行测试:
```bash
./run-tests.sh
```

### 方法 3: 手动测试

使用 `manual-test-checklist.md` 文件进行手动测试，逐项检查功能。

## 测试覆盖范围

### 1. 文件下载功能
- ✅ 下载 API 正常响应
- ✅ 下载链接可访问性
- ✅ 响应头验证 (Content-Type, Content-Disposition)
- ✅ 文件不存在错误处理
- ✅ 未认证用户错误处理

### 2. 下载统计功能
- ✅ downloads_count 字段自动增加
- ✅ downloads 表记录创建
- ✅ 多次下载计数累加
- ✅ 数据库触发器验证
- ✅ 下载记录包含完整信息 (version, ip_address, user_agent)

### 3. 评分统计功能
- ✅ 评价提交成功
- ✅ reviews 表记录创建
- ✅ 评价状态为 'pending'
- ✅ 批准评价后 rating_average 更新
- ✅ 批准评价后 reviews_count 更新
- ✅ 多个评价平均分计算正确
- ✅ 重复评价防止
- ✅ 评分范围验证 (1-5)
- ✅ 数据库触发器验证

### 4. 集成测试
- ✅ 完整用户流程
- ✅ 前端数据显示一致性
- ✅ API 和数据库数据一致性
- ✅ 并发下载处理

## 测试数据库配置

测试脚本使用以下默认配置连接数据库:

```javascript
{
  host: 'localhost',
  port: 5432,
  database: 'openclewdb',
  user: 'postgres',
  password: 'postgres'
}
```

如需修改，请编辑 `run-tests.js` 或 `run-tests.sh` 中的配置。

## 测试报告示例

```
=========================================
           测试报告
=========================================
总测试数: 20
通过: 18
失败: 2
成功率: 90.00%
=========================================
```

## 常见问题

### Q: 测试失败 "服务检查失败"
A: 确保后端服务和数据库都在运行。检查端口是否正确。

### Q: 测试失败 "没有可用的测试 Agent"
A: 需要先上传至少一个 Agent 到系统中。

### Q: 数据库连接失败
A: 检查 PostgreSQL 是否运行，以及连接配置是否正确。

### Q: 评价测试失败 "已存在评价"
A: 测试用户已经评价过该 Agent，这是正常的。测试会自动处理这种情况。

## 清理测试数据

测试会创建测试用户和数据，如需清理:

```sql
-- 删除测试用户 (邮箱包含 test_)
DELETE FROM users WHERE email LIKE 'test_%@example.com';

-- 或者重置整个数据库
npm run db:reset
```

## 持续集成

可以将测试集成到 CI/CD 流程中:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      - name: Install dependencies
        run: cd tests && npm install
      - name: Run tests
        run: cd tests && npm test
```

## 贡献

如需添加新的测试用例:

1. 在 `run-tests.js` 中添加测试函数
2. 在 `manual-test-checklist.md` 中添加手动测试步骤
3. 更新 `test-plan.md` 文档
4. 提交 PR

## 联系方式

如有问题或建议，请提交 Issue 或联系开发团队。
