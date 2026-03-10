# 数据库 Schema 设计

## 概述

OpenCLEW 使用 PostgreSQL 作为主数据库，存储用户、Agent、订单、评价等核心数据。

## ER 图

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   users     │────────<│   agents    │>────────│  reviews    │
│             │  1:N    │             │  1:N    │             │
└─────────────┘         └──────┬──────┘         └─────────────┘
       │                       │
       │ 1:N                   │ 1:N
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  orders     │         │  downloads  │
│             │         │             │
└─────────────┘         └─────────────┘
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

**字段说明**：
- `id`: UUID 主键
- `role`: 用户角色（普通用户、开发者、管理员）
- `reputation_score`: 信誉分数（用于后续的信誉系统）
- `deleted_at`: 软删除标记

### 2. agents（Agent 表）

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 基本信息
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL, -- URL 友好的标识符
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,

  -- 分类和标签
  category VARCHAR(100) NOT NULL,
  tags TEXT[], -- PostgreSQL 数组类型

  -- 定价
  price_type VARCHAR(20) NOT NULL, -- 'free', 'subscription', 'one-time'
  price_amount DECIMAL(10, 2) DEFAULT 0,
  price_currency VARCHAR(10) DEFAULT 'CNY',
  billing_period VARCHAR(20), -- 'monthly', 'yearly'

  -- 文件存储
  package_url TEXT NOT NULL, -- Agent 包的存储路径
  manifest JSONB NOT NULL, -- manifest.json 内容

  -- 统计信息
  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0, -- 0.00 - 5.00
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
CREATE INDEX idx_agents_tags ON agents USING GIN(tags); -- GIN 索引用于数组搜索
```

**字段说明**：
- `slug`: URL 友好的唯一标识符（如 "xiaohongshu-writer"）
- `manifest`: 存储完整的 manifest.json（JSONB 格式，支持查询）
- `tags`: PostgreSQL 数组类型，支持多标签
- `status`: Agent 审核状态

### 3. reviews（评价表）

```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 评价内容
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  -- 审核状态
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 唯一约束：一个用户只能评价一个 Agent 一次
  UNIQUE(agent_id, user_id)
);

CREATE INDEX idx_reviews_agent ON reviews(agent_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);
```

**字段说明**：
- `rating`: 1-5 星评分
- `status`: 评论审核状态
- 唯一约束：防止重复评价

### 4. downloads（下载记录表）

```sql
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 下载信息
  version VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,

  -- 时间戳
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_downloads_agent ON downloads(agent_id);
CREATE INDEX idx_downloads_user ON downloads(user_id);
CREATE INDEX idx_downloads_date ON downloads(downloaded_at);
```

**字段说明**：
- `version`: 下载的 Agent 版本
- `ip_address`: 使用 PostgreSQL 的 INET 类型存储 IP
- 用于统计和分析

### 5. orders（订单表）

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- 订单信息
  order_number VARCHAR(50) UNIQUE NOT NULL,
  order_type VARCHAR(20) NOT NULL, -- 'agent_purchase', 'subscription', 'custom_dev'

  -- 金额
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'CNY',

  -- 状态
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'cancelled', 'refunded'
  payment_method VARCHAR(50),

  -- 订阅相关（如果是订阅类型）
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_agent ON orders(agent_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
```

**字段说明**：
- `order_number`: 订单号（用于展示和查询）
- `order_type`: 订单类型（Agent 购买、订阅、定制开发）
- `subscription_*`: 订阅相关字段

### 6. categories（分类表）

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50), -- 图标名称
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
```

**字段说明**：
- `parent_id`: 支持多级分类
- `sort_order`: 排序顺序

## 视图（Views）

### agent_stats（Agent 统计视图）

```sql
CREATE VIEW agent_stats AS
SELECT
  a.id,
  a.name,
  a.downloads_count,
  a.rating_average,
  a.reviews_count,
  COUNT(DISTINCT d.user_id) as unique_downloaders,
  COUNT(DISTINCT r.user_id) as unique_reviewers
FROM agents a
LEFT JOIN downloads d ON a.id = d.agent_id
LEFT JOIN reviews r ON a.id = r.agent_id
GROUP BY a.id, a.name, a.downloads_count, a.rating_average, a.reviews_count;
```

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

-- 应用到所有表
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. 更新 Agent 统计信息

```sql
-- 当添加评价时，更新 Agent 的评分和评价数
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET
    rating_average = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM reviews
      WHERE agent_id = NEW.agent_id AND status = 'approved'
    ),
    reviews_count = (
      SELECT COUNT(*)
      FROM reviews
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

## 初始数据

### 默认分类

```sql
INSERT INTO categories (name, slug, description, icon, sort_order) VALUES
  ('软件开发', 'software-dev', 'Web开发、移动开发、后端开发等', '💻', 1),
  ('数据分析', 'data-analysis', '数据处理、可视化、机器学习等', '📊', 2),
  ('内容创作', 'content-creation', '文案写作、视频制作、设计等', '✍️', 3),
  ('通用办公', 'office', '文档处理、邮件管理、日程安排等', '📁', 4),
  ('设计工具', 'design', 'UI设计、平面设计、原型设计等', '🎨', 5),
  ('营销推广', 'marketing', 'SEO、社交媒体、广告投放等', '📢', 6);
```

## 索引策略

### 全文搜索索引

```sql
-- 为 Agent 名称和描述创建全文搜索索引
ALTER TABLE agents ADD COLUMN search_vector tsvector;

CREATE INDEX idx_agents_search ON agents USING GIN(search_vector);

-- 更新搜索向量的触发器
CREATE OR REPLACE FUNCTION agents_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'C');
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER agents_search_vector_trigger
BEFORE INSERT OR UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();
```

## 性能优化建议

1. **分区表**：如果下载记录表数据量很大，可以按时间分区
2. **物化视图**：对于复杂的统计查询，可以使用物化视图
3. **连接池**：使用 pg-pool 或 pgbouncer 管理数据库连接
4. **查询优化**：使用 EXPLAIN ANALYZE 分析慢查询

## 备份策略

1. **每日全量备份**：使用 pg_dump
2. **WAL 归档**：启用 WAL 归档实现 PITR（时间点恢复）
3. **定期测试恢复**：确保备份可用

## 安全考虑

1. **密码加密**：使用 bcrypt 加密密码（在应用层）
2. **SQL 注入防护**：使用参数化查询（ORM 自动处理）
3. **最小权限原则**：应用使用的数据库用户只有必要的权限
4. **敏感数据加密**：考虑对敏感字段进行加密存储
