# 贡献指南

感谢你对 OpenCLEW 的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 报告 Bug

如果你发现了 bug，请：

1. 检查 [Issues](https://github.com/yourusername/openclewopen/issues) 确认问题未被报告
2. 创建新 Issue，包含：
   - 清晰的标题
   - 详细的问题描述
   - 复现步骤
   - 预期行为 vs 实际行为
   - 环境信息（OS、Node 版本等）
   - 截图或错误日志（如有）

### 提出新功能

1. 先在 Issues 中讨论你的想法
2. 说明功能的用途和价值
3. 等待维护者反馈
4. 获得认可后再开始开发

### 提交代码

#### 开发流程

1. **Fork 仓库**
   ```bash
   # 在 GitHub 上 Fork 项目
   git clone https://github.com/your-username/openclewopen.git
   cd openclewopen
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **设置开发环境**
   ```bash
   # 安装依赖
   cd backend && npm install
   cd ../frontend && npm install

   # 启动数据库
   docker-compose -f docker-compose.dev.yml up -d

   # 运行迁移
   cd backend && npm run db:migrate
   ```

4. **开发和测试**
   ```bash
   # 启动后端
   cd backend && npm run dev

   # 启动前端
   cd frontend && npm run dev

   # 运行测试（如有）
   npm test
   ```

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   # 或
   git commit -m "fix: resolve bug"
   ```

6. **推送并创建 PR**
   ```bash
   git push origin feature/your-feature-name
   # 在 GitHub 上创建 Pull Request
   ```

#### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**:
```
feat(agent): add manifest validation

- Add manifestValidator utility
- Integrate validation into upload flow
- Add validation tests

Closes #123
```

#### 代码规范

**JavaScript/React**:
- 使用 ES6+ 语法
- 使用 2 空格缩进
- 使用单引号
- 组件使用函数式组件和 Hooks
- 遵循 ESLint 配置

**命名规范**:
- 文件名：kebab-case（如 `user-profile.js`）
- 组件名：PascalCase（如 `UserProfile`）
- 函数/变量：camelCase（如 `getUserProfile`）
- 常量：UPPER_SNAKE_CASE（如 `MAX_FILE_SIZE`）

**注释**:
- 复杂逻辑添加注释
- 公共 API 添加 JSDoc
- 避免无意义的注释

#### Pull Request 规范

**PR 标题**:
- 清晰描述改动内容
- 使用 Conventional Commits 格式

**PR 描述**:
- 说明改动的目的和背景
- 列出主要改动点
- 添加截图（UI 改动）
- 关联相关 Issue

**PR 模板**:
```markdown
## 改动说明
简要描述这个 PR 做了什么

## 改动类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档更新
- [ ] 代码重构
- [ ] 性能优化

## 测试
- [ ] 本地测试通过
- [ ] 添加了测试用例
- [ ] 更新了文档

## 相关 Issue
Closes #123

## 截图（如有）
```

### 改进文档

文档同样重要！你可以：

- 修正错别字
- 改进表述
- 添加示例
- 翻译文档
- 补充缺失内容

文档位于 `docs/` 目录，直接提交 PR 即可。

### 分享和推广

- 在社交媒体分享项目
- 写博客介绍使用经验
- 在技术社区推荐
- Star 项目支持我们

## 开发指南

### 项目结构

```
openclewopen/
├── frontend/          # React 前端
├── backend/           # Node.js 后端
├── docs/              # 文档
├── agent-packages/    # Agent 示例
└── scripts/           # 工具脚本
```

### 技术栈

**前端**:
- React 18 + Vite
- Ant Design 5
- Redux Toolkit
- React Router 6

**后端**:
- Node.js + Express
- PostgreSQL
- JWT 认证
- Winston 日志

### 常见任务

**添加新 API**:
1. 在 `backend/api/` 创建控制器
2. 添加路由
3. 更新 API 文档
4. 添加测试

**添加新页面**:
1. 在 `frontend/src/pages/` 创建组件
2. 添加路由到 `App.jsx`
3. 更新导航（如需要）
4. 添加样式

**数据库迁移**:
1. 在 `backend/migrations/` 创建 SQL 文件
2. 按序号命名（如 `003_xxx.sql`）
3. 运行 `npm run db:migrate`
4. 更新 schema 文档

## 行为准则

请遵守我们的 [行为准则](CODE_OF_CONDUCT.md)，保持友好和尊重。

## 获取帮助

- 查看 [文档](docs/)
- 搜索 [Issues](https://github.com/yourusername/openclewopen/issues)
- 加入讨论区
- 联系维护者

## 许可证

贡献的代码将采用 [MIT License](LICENSE)。

---

再次感谢你的贡献！🎉
