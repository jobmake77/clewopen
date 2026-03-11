# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **管理员审核系统** - 完整的 Agent 和评价审核功能
  - 管理员控制台页面（统计数据、Tab 切换）
  - Agent 审核界面（查看详情、批准、拒绝）
  - 评价审核界面（批准、拒绝、删除）
  - 管理员专用 API 路由
  - 权限保护和访问控制
- **增强的 Agent 上传验证**
  - 文件结构验证（必需文件、推荐文件、目录检查）
  - 安全验证（禁止的文件类型、路径遍历防护）
  - 内容验证（分类白名单、标签数量限制）
  - 详细的错误提示信息
- 管理员服务层 API 封装
- Agent 状态管理（pending → approved/rejected）

### Changed
- 优化前端错误处理，支持多层级错误消息访问
- 改进 API 响应拦截器，统一错误格式
- 更新 Header 组件，为管理员添加"管理控制台"入口

### Fixed
- **评价提交功能** - 修复前端错误处理路径不匹配问题
- **评价重复提交** - 允许用户在评价被拒绝后重新提交
- 修复 `findByUserAndAgent` 查询逻辑，只检查 pending 和 approved 状态

### Security
- 所有管理员接口使用 `authorize('admin')` 保护
- 前端管理页面包含权限检查和重定向
- 增强的文件上传安全验证

## [0.1.0] - 2026-03-10

### Added
- Initial MVP release
- Core platform features
- Basic agent marketplace
- User authentication
- Agent upload with validation
- Documentation

[Unreleased]: https://github.com/yourusername/openclewopen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/openclewopen/releases/tag/v0.1.0
