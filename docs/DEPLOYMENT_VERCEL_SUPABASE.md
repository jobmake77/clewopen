# 部署方案（Vercel + Supabase + 单机后端）

本文是当前推荐上线方案：

- 前端：Vercel（静态托管）
- 数据库：Supabase Postgres
- 后端：1 台云服务器（Node.js + Docker，承载 API 与 trial sandbox）
- Redis：当前版本不依赖，可不部署

## 1. Supabase 准备

1. 在 Supabase 创建项目，拿到 `Connection string`（建议 Transaction Pooler）。
2. 在 `backend/.env` 配置：

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:6543/postgres?sslmode=require
DATABASE_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

说明：
- 代码已支持 `DATABASE_URL`，会优先于 `DB_HOST/DB_PORT/...`。
- 若使用 `sslmode=require`，保留 `DATABASE_SSL=true` 即可。

## 2. 后端服务器部署（单机）

建议机器规格起步：
- 2 vCPU / 4GB RAM（低并发）
- 系统：Ubuntu 22.04 LTS

部署步骤：

```bash
git clone <your-repo>
cd clewopen/backend
cp .env.example .env
# 编辑 .env：填 DATABASE_URL、JWT_SECRET、AI_PROVIDER 等
npm install
npm run db:migrate
npm run start
```

生产建议：
- 使用 `pm2` / `systemd` 托管进程
- 反向代理（Nginx/Caddy）到 `http://127.0.0.1:5000`
- 开启 HTTPS（Let’s Encrypt）
- CORS 只放你 Vercel 域名（`CORS_ORIGINS=https://xxx.vercel.app`）

## 3. 前端部署到 Vercel

项目根目录：`frontend`

构建参数：
- Build Command: `npm run build`
- Output Directory: `dist`

环境变量：

```env
VITE_API_BASE_URL=https://api.your-domain.com/api
```

说明：
- 线上前端应直接请求后端域名，不用本地 Vite 代理。

## 4. 验证清单

1. 后端健康检查：`GET /health` 返回 `status: ok`
2. 前端页面可正常登录、拉取列表
3. 试用链路可创建会话、发送消息、结束会话
4. `npm run db:migrate` 在 Supabase 上执行成功
5. 运行 Supabase readiness 检查：

```bash
cd backend
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
npm run db:check-supabase-readiness
```

该检查会输出关键表计数，并执行一次可回收写入回路（`notifications` insert/update/delete）。

## 5. 当前状态确认

- Redis 依赖已从后端包依赖移除
- Docker Compose 的 Redis 服务已移除
- 数据库连接已支持 `DATABASE_URL`（适配 Supabase）
