# OpenCLEW Frontend

OpenCLEW 平台的前端应用，基于 React + Vite + Ant Design 构建。

## 技术栈

- **框架**: React 18
- **构建工具**: Vite 5
- **UI 库**: Ant Design 5
- **状态管理**: Redux Toolkit
- **路由**: React Router 6
- **HTTP 客户端**: Axios
- **样式**: CSS Modules + Ant Design

## 目录结构

```
frontend/
├── src/
│   ├── components/        # 可复用组件
│   │   ├── Header.jsx    # 顶部导航栏
│   │   ├── Footer.jsx    # 底部信息
│   │   └── ...
│   ├── pages/            # 页面组件
│   │   ├── Home/         # 首页
│   │   ├── AgentList/    # Agent 列表
│   │   ├── AgentDetail/  # Agent 详情
│   │   ├── Upload/       # Agent 上传
│   │   ├── Admin/        # 管理员控制台
│   │   │   ├── index.jsx           # 控制台主页
│   │   │   ├── AgentReview.jsx     # Agent 审核
│   │   │   ├── ReviewManagement.jsx # 评价审核
│   │   │   └── index.css
│   │   └── ...
│   ├── services/         # API 服务
│   │   ├── api.js       # API 配置和拦截器
│   │   ├── adminService.js  # 管理员 API
│   │   └── ...
│   ├── store/           # Redux 状态管理
│   │   ├── slices/      # Redux slices
│   │   └── store.js     # Store 配置
│   ├── utils/           # 工具函数
│   ├── App.jsx          # 应用根组件
│   ├── main.jsx         # 应用入口
│   └── index.css        # 全局样式
├── public/              # 静态资源
├── index.html           # HTML 模板
├── vite.config.js       # Vite 配置
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:3001/api
```

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### 4. 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

## 主要功能

### 用户功能

#### 1. 首页
- 展示热门 Agent
- 平台统计信息
- 快速搜索

#### 2. Agent 列表
- 浏览所有 Agent
- 分类筛选
- 标签筛选
- 排序（下载量、评分、最新）
- 分页加载

#### 3. Agent 详情
- 查看 Agent 详细信息
- 下载 Agent
- 提交评价
- 查看其他用户评价

#### 4. Agent 上传
- 上传 Agent ZIP 文件
- 自动验证 manifest.json
- 显示验证结果和警告
- 提交审核

### 管理员功能

#### 1. 管理控制台
- 统计概览
- 快速访问审核功能
- 系统状态监控

#### 2. Agent 审核
- 查看待审核 Agent
- 批准/拒绝 Agent
- 查看 Agent 详情
- 下载 Agent 文件

#### 3. 评价审核
- 查看待审核评价
- 批准/拒绝/删除评价
- 查看评价详情
- 筛选和排序

## 路由配置

```javascript
/                          # 首页
/agents                    # Agent 列表
/agents/:id                # Agent 详情
/upload                    # 上传 Agent
/login                     # 登录
/register                  # 注册
/admin                     # 管理控制台（需要管理员权限）
/admin/agents              # Agent 审核
/admin/reviews             # 评价审核
```

## API 服务

### API 配置 (services/api.js)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

// 请求拦截器：添加 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  response => response,
  error => {
    // 错误处理逻辑
    return Promise.reject(error);
  }
);
```

### 管理员服务 (services/adminService.js)

```javascript
// 获取所有 Agent
export const getAllAgentsAdmin = (params) => {
  return api.get('/agents/admin/all', { params });
};

// 批准 Agent
export const approveAgent = (id) => {
  return api.post(`/agents/admin/${id}/approve`);
};

// 拒绝 Agent
export const rejectAgent = (id, reason) => {
  return api.post(`/agents/admin/${id}/reject`, { reason });
};
```

## 组件说明

### Header 组件
- 显示平台 Logo 和导航
- 用户登录状态
- 管理员菜单（仅管理员可见）

### AgentCard 组件
- 展示 Agent 卡片
- 显示名称、描述、评分、下载量
- 点击跳转到详情页

### ReviewForm 组件
- 评价表单
- 评分选择（1-5 星）
- 评价内容输入
- 提交验证

## 状态管理

使用 Redux Toolkit 管理全局状态：

```javascript
// store/slices/authSlice.js
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  reducers: {
    setCredentials: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
    },
  },
});
```

## 样式规范

### 全局样式
- 使用 Ant Design 主题定制
- 统一的颜色、字体、间距

### 组件样式
- 使用 CSS Modules 避免样式冲突
- 遵循 BEM 命名规范

### 响应式设计
- 支持桌面端和移动端
- 使用 Ant Design 的栅格系统

## 性能优化

1. **代码分割**: 使用 React.lazy 和 Suspense
2. **图片优化**: 使用 WebP 格式，懒加载
3. **缓存策略**: 合理使用 localStorage 和 sessionStorage
4. **虚拟滚动**: 长列表使用虚拟滚动
5. **防抖节流**: 搜索、滚动等事件使用防抖节流

## 错误处理

### API 错误
```javascript
try {
  const response = await api.get('/agents');
  // 处理成功响应
} catch (error) {
  if (error.response) {
    // 服务器返回错误
    message.error(error.response.data.error?.message || '请求失败');
  } else if (error.request) {
    // 请求发送失败
    message.error('网络错误，请检查网络连接');
  } else {
    // 其他错误
    message.error('发生未知错误');
  }
}
```

### 表单验证
使用 Ant Design Form 组件的验证功能：

```javascript
<Form.Item
  name="rating"
  rules={[
    { required: true, message: '请选择评分' },
    { type: 'number', min: 1, max: 5, message: '评分必须在 1-5 之间' }
  ]}
>
  <Rate />
</Form.Item>
```

## 测试

```bash
# 运行单元测试
npm test

# 运行 E2E 测试
npm run test:e2e

# 生成覆盖率报告
npm run test:coverage
```

## 构建和部署

### 开发环境
```bash
npm run dev
```

### 生产构建
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

### 部署到 Nginx
```bash
# 构建
npm run build

# 复制到 Nginx 目录
cp -r dist/* /var/www/html/

# 配置 Nginx
# 确保配置了 SPA 路由支持
```

Nginx 配置示例：
```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /var/www/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| VITE_API_BASE_URL | 后端 API 地址 | http://localhost:3001/api |

## 浏览器支持

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## 故障排查

### 开发服务器启动失败
```bash
# 清除缓存
rm -rf node_modules
npm install

# 检查端口占用
lsof -i :5173
```

### API 请求失败
```bash
# 检查后端服务是否运行
curl http://localhost:3001/api/health

# 检查 CORS 配置
# 确保后端允许前端域名
```

### 构建失败
```bash
# 清除构建缓存
rm -rf dist
npm run build

# 检查依赖版本
npm outdated
```

## 相关文档

- [React 文档](https://react.dev/)
- [Vite 文档](https://vitejs.dev/)
- [Ant Design 文档](https://ant.design/)
- [Redux Toolkit 文档](https://redux-toolkit.js.org/)

## 更新日志

### 2026-03-11
- ✅ 修复评价提交错误处理
- ✅ 实现管理员控制台
- ✅ 实现 Agent 审核界面
- ✅ 实现评价审核界面
- ✅ 添加管理员菜单

### 2026-03-10
- ✅ 初始版本发布
- ✅ 基础页面实现
- ✅ 用户认证功能
- ✅ Agent 上传下载功能
