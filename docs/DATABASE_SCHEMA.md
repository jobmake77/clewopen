# 数据库 Schema 设计

## 概述

OpenCLEW 使用 PostgreSQL 作为主数据库，存储用户、Agent、Skill、MCP、评价、试用记录等核心数据。项目为开源项目，不涉及付费（仅 CustomOrder 涉及金钱），已移除所有定价和订单相关表/列。

## ER 图

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   users     │────────<│   agents    │>────────│  reviews    │
│             │  1:N    │             │  1:N    │(resource_type)│
└──────┬──────┘         └──────┬──────┘         └─────────────┘
       │                       │
       │ 1:N                   │ 1:N
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│agent_trials │         │  downloads  │
└─────────────┘         └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│   skills    │  │    mcps     │  │custom_orders │  │ llm_configs │
└─────────────┘  └─────────────┘  └──────────────┘  └─────────────┘
```

## 表结构

### 1. users（用户表）

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user', -- 'user', 'developer', 'admin'
  avatar_url TEXT,
  bio TEXT,

  -- 统计信息
  total_downloads INTEGER DEFAULT 0,
  total_uploads INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 0,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,

  -- 软删除
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
```

### 2. agents（Agent 表）

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 基本信息
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,

  -- 分类和标签
  category VARCHAR(100) NOT NULL,
  tags TEXT[],

  -- 文件存储
  package_url TEXT NOT NULL,
  manifest JSONB NOT NULL,

  -- GitHub 数据（自动同步）
  github_stars INTEGER DEFAULT 0,
  github_url TEXT,
  author_avatar_url TEXT,

  -- 统计信息
  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,

  -- 状态
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'suspended'

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_agents_author ON agents(author_id);
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_tags ON agents USING GIN(tags);
```

**字段说明**：
- `slug`: URL 友好的唯一标识符
- `manifest`: 存储完整的 manifest.json（JSONB 格式）
- `tags`: PostgreSQL 数组类型，支持多标签
- `status`: Agent 审核状态
- `github_stars/github_url/author_avatar_url`: 由数据同步服务自动填充

### 3. skills（Skill 表）

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags TEXT[],
  package_url TEXT,
  manifest JSONB,
  github_stars INTEGER DEFAULT 0,
  github_url TEXT,
  author_avatar_url TEXT,
  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  source VARCHAR(50) DEFAULT 'upload', -- 'upload', 'github', 'openclaw'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### 4. mcps（MCP 表）

```sql
CREATE TABLE mcps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags TEXT[],
  package_url TEXT,
  manifest JSONB,
  github_stars INTEGER DEFAULT 0,
  github_url TEXT,
  author_avatar_url TEXT,
  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  source VARCHAR(50) DEFAULT 'upload',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### 5. reviews（评价表）

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(20) NOT NULL DEFAULT 'agent', -- 'agent', 'skill', 'mcp'
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_reviews_agent ON reviews(agent_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);
```

### 6. downloads（下载记录表）

```sql
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(20) NOT NULL DEFAULT 'agent', -- 'agent', 'skill', 'mcp'
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  version VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,

  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_downloads_agent ON downloads(agent_id);
CREATE INDEX idx_downloads_user ON downloads(user_id);
CREATE INDEX idx_downloads_date ON downloads(downloaded_at);
```

### 7. notifications（通知表）

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
```

### 8. custom_orders（定制开发需求表）

```sql
CREATE TABLE custom_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  budget_range VARCHAR(100),
  deadline DATE,
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'completed', 'cancelled'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9. agent_trials（Agent 试用记录表）⭐ 新增

```sql
CREATE TABLE IF NOT EXISTS agent_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  message_content TEXT NOT NULL,
  response_content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_trials_user_agent ON agent_trials(user_id, agent_id);
```

**字段说明**：
- 记录每次试用对话（用户消息 + LLM 回复）
- 通过 `user_id + agent_id` 计数来限制每用户每 Agent 3 次试用

### 10. llm_configs（LLM 服务配置表）⭐ 新增

```sql
CREATE TABLE IF NOT EXISTS llm_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(100) NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  max_tokens INTEGER DEFAULT 1024,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**：
- 管理员配置 LLM API 信息，系统使用 `is_active = true` 的配置
- 自动识别 Anthropic（api_url 含 `anthropic.com`）和 OpenAI 兼容 API
- 同一时间只有一个配置处于激活状态

## 已删除的表和列

### 迁移 007（2026-03-12）
- **删除** `orders` 表 — 项目开源，不涉及付费
- **删除列**（agents/skills/mcps）：`price_type`, `price_amount`, `price_currency`, `billing_period`

## 触发器（Triggers）

### 1. 更新 updated_at 时间戳

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. 更新 Agent 评分统计

```sql
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET
    rating_average = (
      SELECT AVG(rating)::DECIMAL(3,2) FROM reviews
      WHERE agent_id = NEW.agent_id AND status = 'approved'
    ),
    reviews_count = (
      SELECT COUNT(*) FROM reviews
      WHERE agent_id = NEW.agent_id AND status = 'approved'
    )
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_rating_on_review
AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_agent_rating();
```

### 3. 更新下载统计

```sql
CREATE OR REPLACE FUNCTION update_agent_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET downloads_count = downloads_count + 1
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_downloads_on_download
AFTER INSERT ON downloads
FOR EACH ROW EXECUTE FUNCTION update_agent_downloads();
```

## 迁移文件列表

| 文件 | 用途 |
|------|------|
| `001_initial_schema.sql` | 初始表结构（users, agents, reviews, downloads） |
| `004_create_notifications_table.sql` | 通知表 |
| `005_create_skills_and_mcps.sql` | Skills 和 MCPs 表 |
| `006_add_github_fields.sql` | GitHub 同步字段 |
| `007_remove_pricing_and_orders.sql` | 删除 orders 表和 price 列 |
| `008_create_trial_and_llm_config.sql` | Agent 试用和 LLM 配置表 |

## 性能优化建议

1. **分区表**：如果下载记录表数据量很大，可以按时间分区
2. **物化视图**：对于复杂的统计查询，可以使用物化视图
3. **连接池**：使用 pg-pool 管理数据库连接
4. **查询优化**：使用 EXPLAIN ANALYZE 分析慢查询

## 安全考虑

1. **密码加密**：使用 bcrypt 加密密码（在应用层）
2. **SQL 注入防护**：使用参数化查询
3. **最小权限原则**：应用使用的数据库用户只有必要的权限
4. **敏感数据**：LLM API Key 存储在 llm_configs 表中，仅管理员可访问
