-- Migration: 001_create_initial_tables
-- Created: 2026-03-09
-- Description: Create initial database schema for OpenCLEW

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'developer', 'admin')),
  avatar_url TEXT,
  bio TEXT,

  -- Statistics
  total_downloads INTEGER DEFAULT 0,
  total_uploads INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- 2. Create categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);

-- 3. Create agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,

  -- Category and tags
  category VARCHAR(100) NOT NULL,
  tags TEXT[],

  -- Pricing
  price_type VARCHAR(20) NOT NULL CHECK (price_type IN ('free', 'subscription', 'one-time')),
  price_amount DECIMAL(10, 2) DEFAULT 0,
  price_currency VARCHAR(10) DEFAULT 'CNY',
  billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly')),

  -- File storage
  package_url TEXT NOT NULL,
  manifest JSONB NOT NULL,

  -- Statistics
  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  reviews_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),

  -- Full-text search
  search_vector tsvector,

  -- Timestamps
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
CREATE INDEX idx_agents_search ON agents USING GIN(search_vector);

-- 4. Create reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- Unique constraint: one review per user per agent
  UNIQUE(agent_id, user_id)
);

CREATE INDEX idx_reviews_agent ON reviews(agent_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);

-- 5. Create downloads table
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Download info
  version VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_downloads_agent ON downloads(agent_id);
CREATE INDEX idx_downloads_user ON downloads(user_id);
CREATE INDEX idx_downloads_date ON downloads(downloaded_at);

-- 6. Create orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- Order info
  order_number VARCHAR(50) UNIQUE NOT NULL,
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('agent_purchase', 'subscription', 'custom_dev')),

  -- Amount
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'CNY',

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method VARCHAR(50),

  -- Subscription related
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_agent ON orders(agent_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for agent rating updates
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents
  SET
    rating_average = (
      SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
      FROM reviews
      WHERE agent_id = NEW.agent_id AND status = 'approved' AND deleted_at IS NULL
    ),
    reviews_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE agent_id = NEW.agent_id AND status = 'approved' AND deleted_at IS NULL
    )
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_rating_on_review
AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_agent_rating();

-- Create trigger for download count updates
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

-- Create trigger for full-text search vector updates
CREATE OR REPLACE FUNCTION agents_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER agents_search_vector_trigger
BEFORE INSERT OR UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION agents_search_vector_update();

-- Insert default categories
INSERT INTO categories (name, slug, description, icon, sort_order) VALUES
  ('软件开发', 'software-dev', 'Web开发、移动开发、后端开发等', '💻', 1),
  ('数据分析', 'data-analysis', '数据处理、可视化、机器学习等', '📊', 2),
  ('内容创作', 'content-creation', '文案写作、视频制作、设计等', '✍️', 3),
  ('通用办公', 'office', '文档处理、邮件管理、日程安排等', '📁', 4),
  ('设计工具', 'design', 'UI设计、平面设计、原型设计等', '🎨', 5),
  ('营销推广', 'marketing', 'SEO、社交媒体、广告投放等', '📢', 6);
