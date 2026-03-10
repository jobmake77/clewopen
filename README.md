# OpenCLEW - 开源 AI Agent 能力平台

<div align="center">

![OpenCLEW Logo](https://via.placeholder.com/200x200?text=OpenCLEW)

**让 AI Agent 的开发、分享和使用变得简单**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](README.md) | [简体中文](README_zh.md)

</div>

## 📖 项目简介

OpenCLEW 是一个开源的 AI Agent 能力平台，旨在：

- 🎯 **标准化 Agent 打包格式** - 统一的 manifest.json 规范
- 🏪 **Agent 市场** - 发现、分享和下载 Agent
- ✅ **自动验证** - 上传时自动验证 Agent 包格式
- 🔐 **权限管理** - 细粒度的权限控制系统
- 📦 **依赖管理** - 清晰的依赖声明和管理

## ✨ 核心特性

### Agent 标准化

- 统一的打包格式（.zip）
- manifest.json 元数据规范
- 语义化版本管理
- 权限和依赖声明

### Agent 市场

- 浏览和搜索 Agent
- 分类和标签系统
- 下载和评价功能
- 开发者主页

### 开发者工具

- Agent 打包脚本
- manifest 验证工具
- 示例 Agent 模板
- 完整的开发文档

## 🚀 快速开始

### 前置要求

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/openclewopen.git
cd openclewopen

# 2. 启动数据库
docker-compose -f docker-compose.dev.yml up -d

# 3. 安装后端依赖
cd backend
npm install
cp .env.example .env

# 4. 运行数据库迁移
npm run db:migrate

# 5. 安装前端依赖
cd ../frontend
npm install
```

### 运行

```bash
# 终端 1 - 启动后端
cd backend
npm run dev

# 终端 2 - 启动前端
cd frontend
npm run dev
```

访问 http://localhost:5173 开始使用！

## 📦 创建你的第一个 Agent

### 1. 创建 Agent 目录

```bash
mkdir my-agent
cd my-agent
```

### 2. 编写 manifest.json

```json
{
  "name": "My First Agent",
  "version": "1.0.0",
  "description": "A simple example agent",
  "author": "Your Name",
  "category": "development",
  "tags": ["example", "demo"],
  "permissions": {
    "filesystem": ["read"],
    "network": ["https"],
    "system": []
  },
  "dependencies": {
    "skills": [],
    "agents": [],
    "packages": []
  },
  "price": {
    "type": "free",
    "amount": 0
  }
}
```

### 3. 添加 README

```bash
echo "# My First Agent" > README.md
echo "This is my first agent!" >> README.md
```

### 4. 打包

```bash
cd ..
bash scripts/pack-agent.sh my-agent
```

### 5. 上传

登录平台，点击"发布 Agent"，上传生成的 .zip 文件。

## 🏗️ 项目结构

```
openclewopen/
├── frontend/              # React 前端应用
│   ├── src/
│   │   ├── components/   # 可复用组件
│   │   ├── pages/        # 页面组件
│   │   ├── services/     # API 服务
│   │   └── store/        # Redux 状态管理
│   └── package.json
├── backend/               # Node.js 后端服务
│   ├── api/              # API 路由和控制器
│   ├── models/           # 数据模型
│   ├── middleware/       # 中间件
│   ├── utils/            # 工具函数
│   └── migrations/       # 数据库迁移
├── agent-packages/        # Agent 示例
│   └── example-agent/    # 示例 Agent
├── scripts/               # 工具脚本
│   ├── pack-agent.sh     # Agent 打包脚本
│   └── test-*.sh         # 测试脚本
├── docs/                  # 文档
│   ├── QUICKSTART.md     # 快速开始
│   ├── MANIFEST_VALIDATION.md  # manifest 验证
│   └── ...
└── docker-compose.dev.yml # 开发环境配置
```

## 🛠️ 技术栈

### 前端
- **框架**: React 18 + Vite
- **UI 库**: Ant Design 5
- **状态管理**: Redux Toolkit
- **路由**: React Router 6
- **HTTP 客户端**: Axios

### 后端
- **运行时**: Node.js 20+
- **框架**: Express
- **数据库**: PostgreSQL 15
- **认证**: JWT
- **日志**: Winston
- **文件上传**: Multer

### 开发工具
- Docker & Docker Compose
- ESLint
- Git

## 📚 文档

- [快速开始](docs/QUICKSTART.md)
- [Agent 开发指南](docs/AGENT_DEVELOPMENT.md)
- [manifest.json 规范](docs/MANIFEST_SPEC.md)
- [manifest 验证](docs/MANIFEST_VALIDATION.md)
- [API 文档](docs/api/)
- [数据库设计](docs/DATABASE_SCHEMA.md)
- [贡献指南](CONTRIBUTING.md)

## 🗺️ 开发路线图

### Phase 1: MVP 基础平台 ✅ (95%)
- ✅ Agent 标准化格式
- ✅ 数据库设计
- ✅ 用户认证系统
- ✅ Agent 市场
- ✅ Agent 上传功能
- ✅ manifest.json 验证
- ⏳ 开源准备

### Phase 2: 增强功能 (计划中)
- Agent 运行时沙箱
- 管理员审核系统
- 搜索优化
- 性能优化
- 单元测试

### Phase 3: 生态建设 (计划中)
- Agent 模板库
- 开发者文档
- 社区功能
- CI/CD 集成

## 🤝 贡献

我们欢迎所有形式的贡献！

- 🐛 [报告 Bug](https://github.com/yourusername/openclewopen/issues/new?template=bug_report.md)
- 💡 [提出新功能](https://github.com/yourusername/openclewopen/issues/new?template=feature_request.md)
- 📖 改进文档
- 🔧 提交代码

请阅读 [贡献指南](CONTRIBUTING.md) 了解详情。

## 👥 贡献者

感谢所有贡献者！

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yourusername/openclewopen&type=Date)](https://star-history.com/#yourusername/openclewopen&Date)

## 💬 社区

- [GitHub Discussions](https://github.com/yourusername/openclewopen/discussions)
- [Discord](https://discord.gg/your-invite)
- [Twitter](https://twitter.com/openclewopen)

## 📧 联系我们

- 问题反馈: [GitHub Issues](https://github.com/yourusername/openclewopen/issues)
- 邮箱: contact@openclewopen.com

---

<div align="center">

**如果这个项目对你有帮助，请给我们一个 ⭐️**

Made with ❤️ by OpenCLEW Contributors

</div>
