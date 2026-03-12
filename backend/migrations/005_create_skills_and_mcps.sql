-- Migration: 005_create_skills_and_mcps
-- Created: 2026-03-12
-- Description: Create skills and mcps tables, custom_orders table

-- 1. Create skills table (mirrors agents structure)
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,

  category VARCHAR(100) NOT NULL,
  tags TEXT[],

  price_type VARCHAR(20) NOT NULL CHECK (price_type IN ('free', 'subscription', 'one-time')),
  price_amount DECIMAL(10, 2) DEFAULT 0,
  price_currency VARCHAR(10) DEFAULT 'CNY',
  billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly')),

  package_url TEXT NOT NULL,
  manifest JSONB NOT NULL,

  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  reviews_count INTEGER DEFAULT 0,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  metadata JSONB,

  search_vector tsvector,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_skills_author ON skills(author_id);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_slug ON skills(slug);
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX idx_skills_search ON skills USING GIN(search_vector);

-- Skills search vector trigger
CREATE OR REPLACE FUNCTION skills_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER skills_search_vector_trigger
BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION skills_search_vector_update();

-- Skills updated_at trigger
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Create mcps table (mirrors agents structure)
CREATE TABLE mcps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,

  category VARCHAR(100) NOT NULL,
  tags TEXT[],

  price_type VARCHAR(20) NOT NULL CHECK (price_type IN ('free', 'subscription', 'one-time')),
  price_amount DECIMAL(10, 2) DEFAULT 0,
  price_currency VARCHAR(10) DEFAULT 'CNY',
  billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly')),

  package_url TEXT NOT NULL,
  manifest JSONB NOT NULL,

  downloads_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0 CHECK (rating_average >= 0 AND rating_average <= 5),
  reviews_count INTEGER DEFAULT 0,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  metadata JSONB,

  search_vector tsvector,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_mcps_author ON mcps(author_id);
CREATE INDEX idx_mcps_category ON mcps(category);
CREATE INDEX idx_mcps_status ON mcps(status);
CREATE INDEX idx_mcps_slug ON mcps(slug);
CREATE INDEX idx_mcps_tags ON mcps USING GIN(tags);
CREATE INDEX idx_mcps_search ON mcps USING GIN(search_vector);

-- MCPs search vector trigger
CREATE OR REPLACE FUNCTION mcps_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER mcps_search_vector_trigger
BEFORE INSERT OR UPDATE ON mcps
FOR EACH ROW EXECUTE FUNCTION mcps_search_vector_update();

-- MCPs updated_at trigger
CREATE TRIGGER update_mcps_updated_at BEFORE UPDATE ON mcps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Add resource_type to reviews table
ALTER TABLE reviews ADD COLUMN resource_type VARCHAR(20) DEFAULT 'agent';
ALTER TABLE reviews RENAME COLUMN agent_id TO resource_id;

-- Drop old unique constraint and create new one
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_agent_id_user_id_key;
ALTER TABLE reviews ADD CONSTRAINT reviews_resource_user_unique UNIQUE(resource_id, user_id, resource_type);

-- Update rating trigger to support resource_type
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_table TEXT;
BEGIN
  target_table := COALESCE(NEW.resource_type, 'agent');

  IF target_table = 'agent' THEN
    UPDATE agents
    SET
      rating_average = (
        SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'agent' AND status = 'approved' AND deleted_at IS NULL
      ),
      reviews_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'agent' AND status = 'approved' AND deleted_at IS NULL
      )
    WHERE id = NEW.resource_id;
  ELSIF target_table = 'skill' THEN
    UPDATE skills
    SET
      rating_average = (
        SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'skill' AND status = 'approved' AND deleted_at IS NULL
      ),
      reviews_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'skill' AND status = 'approved' AND deleted_at IS NULL
      )
    WHERE id = NEW.resource_id;
  ELSIF target_table = 'mcp' THEN
    UPDATE mcps
    SET
      rating_average = (
        SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'mcp' AND status = 'approved' AND deleted_at IS NULL
      ),
      reviews_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE resource_id = NEW.resource_id AND resource_type = 'mcp' AND status = 'approved' AND deleted_at IS NULL
      )
    WHERE id = NEW.resource_id;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Add resource_type to downloads table
ALTER TABLE downloads ADD COLUMN resource_type VARCHAR(20) DEFAULT 'agent';
ALTER TABLE downloads RENAME COLUMN agent_id TO resource_id;

-- Update download count trigger to support resource_type
CREATE OR REPLACE FUNCTION update_agent_downloads()
RETURNS TRIGGER AS $$
DECLARE
  target_table TEXT;
BEGIN
  target_table := COALESCE(NEW.resource_type, 'agent');

  IF target_table = 'agent' THEN
    UPDATE agents SET downloads_count = downloads_count + 1 WHERE id = NEW.resource_id;
  ELSIF target_table = 'skill' THEN
    UPDATE skills SET downloads_count = downloads_count + 1 WHERE id = NEW.resource_id;
  ELSIF target_table = 'mcp' THEN
    UPDATE mcps SET downloads_count = downloads_count + 1 WHERE id = NEW.resource_id;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Create custom_orders table
CREATE TABLE custom_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  budget_min DECIMAL(10, 2),
  budget_max DECIMAL(10, 2),
  deadline TIMESTAMP,
  category VARCHAR(100),

  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  developer_id UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_custom_orders_user ON custom_orders(user_id);
CREATE INDEX idx_custom_orders_status ON custom_orders(status);
CREATE INDEX idx_custom_orders_developer ON custom_orders(developer_id);

CREATE TRIGGER update_custom_orders_updated_at BEFORE UPDATE ON custom_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
