-- Seed data for development and testing
-- This file creates sample users and agents for testing

-- Insert test users
-- Password for all test users: "password123" (hashed with bcrypt)
-- Hash: $2a$10$SEf2V4cXsFc0qoWjUAR3t.o/IvMMB4CWclUmQA1nUTRbxparC0g/S
INSERT INTO users (id, username, email, password_hash, role, bio, reputation_score) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin', 'admin@clewopen.com', '$2a$10$SEf2V4cXsFc0qoWjUAR3t.o/IvMMB4CWclUmQA1nUTRbxparC0g/S', 'admin', '平台管理员', 100),
  ('22222222-2222-2222-2222-222222222222', 'developer1', 'dev1@example.com', '$2a$10$SEf2V4cXsFc0qoWjUAR3t.o/IvMMB4CWclUmQA1nUTRbxparC0g/S', 'developer', '专业的 Agent 开发者', 85),
  ('33333333-3333-3333-3333-333333333333', 'developer2', 'dev2@example.com', '$2a$10$SEf2V4cXsFc0qoWjUAR3t.o/IvMMB4CWclUmQA1nUTRbxparC0g/S', 'developer', 'AI 工具专家', 90),
  ('44444444-4444-4444-4444-444444444444', 'user1', 'user1@example.com', '$2a$10$SEf2V4cXsFc0qoWjUAR3t.o/IvMMB4CWclUmQA1nUTRbxparC0g/S', 'user', '普通用户', 50);

-- Insert test agents
INSERT INTO agents (
  id, author_id, name, slug, description, version,
  category, tags, price_type, price_amount, price_currency, billing_period,
  package_url, manifest, status, published_at
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    '小红书文案生成器',
    'xiaohongshu-writer',
    '专业的小红书文案生成 Agent，支持多种风格和场景，包括种草、测评、教程等类型的文案创作。',
    '1.0.0',
    '内容创作',
    ARRAY['小红书', '文案', '营销', '社交媒体'],
    'subscription',
    29.9,
    'CNY',
    'monthly',
    '/storage/agents/xiaohongshu-writer-1.0.0.zip',
    '{"name": "小红书文案生成器", "version": "1.0.0", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'Python 代码审查助手',
    'python-code-reviewer',
    '自动审查 Python 代码质量，提供优化建议，检测潜在问题，符合 PEP8 规范。',
    '2.1.0',
    '软件开发',
    ARRAY['Python', '代码审查', '质量', 'PEP8'],
    'subscription',
    49.9,
    'CNY',
    'monthly',
    '/storage/agents/python-code-reviewer-2.1.0.zip',
    '{"name": "Python 代码审查助手", "version": "2.1.0", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    '数据可视化大师',
    'data-viz-master',
    '将数据转换为精美的图表和可视化报告，支持多种图表类型和导出格式。',
    '1.5.2',
    '数据分析',
    ARRAY['数据可视化', '图表', '报告', 'BI'],
    'one-time',
    99.0,
    'CNY',
    NULL,
    '/storage/agents/data-viz-master-1.5.2.zip',
    '{"name": "数据可视化大师", "version": "1.5.2", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '33333333-3333-3333-3333-333333333333',
    'SEO 优化助手',
    'seo-optimizer',
    '分析网站 SEO 状况，提供优化建议，生成关键词策略，提升搜索排名。',
    '1.0.5',
    '营销推广',
    ARRAY['SEO', '搜索引擎', '关键词', '优化'],
    'subscription',
    39.9,
    'CNY',
    'monthly',
    '/storage/agents/seo-optimizer-1.0.5.zip',
    '{"name": "SEO 优化助手", "version": "1.0.5", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}, "network": {"allowed_domains": ["api.google.com"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '22222222-2222-2222-2222-222222222222',
    'UI 设计规范检查器',
    'ui-design-checker',
    '检查 UI 设计是否符合规范，包括颜色、字体、间距、对齐等，提供改进建议。',
    '1.2.0',
    '设计工具',
    ARRAY['UI设计', '规范', '检查', '设计系统'],
    'free',
    0,
    'CNY',
    NULL,
    '/storage/agents/ui-design-checker-1.2.0.zip',
    '{"name": "UI 设计规范检查器", "version": "1.2.0", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  ),
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '33333333-3333-3333-3333-333333333333',
    '会议纪要生成器',
    'meeting-notes-generator',
    '根据会议录音或文字记录，自动生成结构化的会议纪要，提取关键信息和待办事项。',
    '1.0.0',
    '通用办公',
    ARRAY['会议', '纪要', '办公', '效率'],
    'subscription',
    19.9,
    'CNY',
    'monthly',
    '/storage/agents/meeting-notes-generator-1.0.0.zip',
    '{"name": "会议纪要生成器", "version": "1.0.0", "permissions": {"filesystem": {"read": ["./workspace/*"], "write": ["./output/*"]}}}'::jsonb,
    'approved',
    CURRENT_TIMESTAMP
  );

-- Insert test reviews
INSERT INTO reviews (agent_id, user_id, rating, comment, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 5, '非常好用！生成的文案质量很高，节省了大量时间。', 'approved'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 4, '整体不错，但希望能支持更多风格。', 'approved'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 5, '代码审查很专业，发现了很多我没注意到的问题。', 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 4, '图表很漂亮，但导出速度有点慢。', 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 5, 'SEO 分析很全面，建议很实用。', 'approved'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '44444444-4444-4444-4444-444444444444', 5, '免费但功能强大，强烈推荐！', 'approved');

-- Insert test downloads
INSERT INTO downloads (agent_id, user_id, version, ip_address) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '1.0.0', '192.168.1.100'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', '1.0.0', '192.168.1.101'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '2.1.0', '192.168.1.100'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', '1.5.2', '192.168.1.100'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', '1.0.5', '192.168.1.102'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '44444444-4444-4444-4444-444444444444', '1.2.0', '192.168.1.100');

-- Note: The triggers will automatically update:
-- - agents.rating_average and reviews_count based on reviews
-- - agents.downloads_count based on downloads
-- - updated_at timestamps on updates
