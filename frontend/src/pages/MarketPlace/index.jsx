import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, Spin, Tag } from 'antd'
import {
  RobotOutlined,
  UserOutlined,
  ToolOutlined,
  ApiOutlined,
  StarOutlined,
  DownloadOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { fetchTrendingAgents, fetchPlatformStats } from '../../store/slices/agentSlice'
import { fetchTrendingSkills } from '../../store/slices/skillSlice'
import { fetchTrendingMcps } from '../../store/slices/mcpSlice'
import RankingBoard from '../../components/RankingBoard'

const categoryLabelMap = {
  development: '开发工具',
  'data-analysis': '数据分析',
  automation: '自动化',
  content: '内容创作',
  business: '商业分析',
  education: '教育培训',
  other: '其他',
}

const categoryColorMap = {
  development: '#1890ff',
  'data-analysis': '#52c41a',
  automation: '#fa8c16',
  content: '#eb2f96',
  business: '#722ed1',
  education: '#13c2c2',
  other: '#8c8c8c',
}

function MarketPlace() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { trending: agentTrending, trendingLoading: agentTrendingLoading, stats, statsLoading } = useSelector((state) => state.agent)
  const { trending: skillTrending, trendingLoading: skillTrendingLoading } = useSelector((state) => state.skill)
  const { trending: mcpTrending, trendingLoading: mcpTrendingLoading } = useSelector((state) => state.mcp)
  const [activeAgentCategory, setActiveAgentCategory] = useState('全部')

  useEffect(() => {
    dispatch(fetchPlatformStats())
    dispatch(fetchTrendingAgents({ limit: 10 }))
    dispatch(fetchTrendingSkills({ limit: 10, days: 1 }))
    dispatch(fetchTrendingMcps({ limit: 10, days: 7 }))
  }, [dispatch])

  const agentCategories = ['全部', ...Array.from(new Set(agentTrending.map((item) => item.category).filter(Boolean)))]
  const filteredAgentTrending = activeAgentCategory === '全部'
    ? agentTrending
    : agentTrending.filter((item) => item.category === activeAgentCategory)

  return (
    <div className="page-shell">
      <section style={{ padding: '36px 0 20px' }}>
        <p className="section-label">Open Agent Platform</p>
        <h1 style={{ fontSize: 'clamp(34px, 7vw, 56px)', lineHeight: 1.1, margin: 0 }}>
          发现、创建与分享
          <br />
          <span style={{ color: 'var(--accent-blue)', fontStyle: 'italic' }}>智能 Agent</span>
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 16, marginTop: 16, maxWidth: 680, lineHeight: 1.75 }}>
          ClewOpen 是一个面向真实生产场景的 Agent 生态平台。浏览、试用并发布 Agent / Skill / MCP，
          在统一沙盒里验证能力后再进入交付链路。
        </p>
      </section>

      {/* 1. 统计概览区 */}
      <Spin spinning={statsLoading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
          <Col xs={12} sm={6}>
            <Card className="cream-panel">
              <Statistic
                title="Agent 总数"
                value={stats?.totalAgents || 0}
                prefix={<RobotOutlined />}
                valueStyle={{ color: 'var(--accent-blue)' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="cream-panel">
              <Statistic
                title="注册用户"
                value={stats?.totalUsers || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: 'var(--accent-sage)' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="cream-panel">
              <Statistic
                title="Skill 总数"
                value={stats?.totalSkills || 0}
                prefix={<ToolOutlined />}
                valueStyle={{ color: '#b98944' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="cream-panel">
              <Statistic
                title="MCP 总数"
                value={stats?.totalMcps || 0}
                prefix={<ApiOutlined />}
                valueStyle={{ color: '#7347b0' }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>

      {/* 2. 分类数据看板 */}
      {stats?.categories && stats.categories.length > 0 && (
        <Card title="Agent 分类分布" style={{ marginBottom: 24 }} className="cream-panel">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {stats.categories.map((cat) => (
              <Tag
                key={cat.category}
                color={categoryColorMap[cat.category] || '#8c8c8c'}
                style={{ padding: '6px 16px', fontSize: 14, cursor: 'pointer', borderRadius: 6 }}
                onClick={() => navigate(`/agents?category=${cat.category}`)}
              >
                {categoryLabelMap[cat.category] || cat.category}
                {' '}
                <strong>{cat.count}</strong>
                <span style={{ opacity: 0.7, marginLeft: 4 }}>({cat.percentage}%)</span>
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 3. 热门 Agent（卡片网格） */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
          <div>
            <p className="section-label" style={{ marginBottom: 8 }}>AGENT 市场</p>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px, 4.2vw, 40px)', fontFamily: '"Playfair Display", Georgia, serif' }}>
              热门 Agent
            </h2>
          </div>
          <a
            style={{
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              borderRadius: 999,
              padding: '8px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
            }}
            onClick={() => navigate('/agents')}
          >
            查看全部 <ArrowRightOutlined />
          </a>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {agentCategories.map((cat) => {
            const active = cat === activeAgentCategory
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveAgentCategory(cat)}
                style={{
                  borderRadius: 999,
                  padding: '6px 14px',
                  border: active ? '1px solid #151515' : '1px solid var(--line)',
                  background: active ? '#151515' : 'transparent',
                  color: active ? '#fff' : 'var(--ink)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {cat === '全部' ? '全部' : (categoryLabelMap[cat] || cat)}
              </button>
            )
          })}
        </div>

        <Spin spinning={agentTrendingLoading}>
          <Row gutter={[16, 16]}>
            {filteredAgentTrending.slice(0, 6).map((item) => (
              <Col key={item.id} xs={24} md={12} lg={8}>
                <div
                  className="cream-panel"
                  style={{ padding: 20, cursor: 'pointer', height: '100%' }}
                  onClick={() => navigate(`/agent/${item.id}`)}
                >
                  <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--ink-muted)', marginBottom: 10 }}>
                    {categoryLabelMap[item.category] || item.category || 'Agent'}
                  </div>
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: 30,
                      lineHeight: 1.25,
                      fontFamily: '"Playfair Display", Georgia, serif',
                    }}
                  >
                    {item.name}
                  </h3>
                  <p style={{ margin: '0 0 12px', color: 'var(--ink-muted)', fontSize: 13 }}>
                    by {item.author_name || 'unknown'}
                  </p>
                  <p
                    style={{
                      margin: '0 0 14px',
                      color: 'var(--ink-muted)',
                      fontSize: 14,
                      lineHeight: 1.75,
                      minHeight: 50,
                    }}
                  >
                    {item.description || '智能化 Agent，支持复杂任务处理与自动化执行。'}
                  </p>
                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {item.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '2px 10px',
                            borderRadius: 999,
                            background: '#f3f1eb',
                            color: 'var(--ink-muted)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--ink-muted)', fontSize: 12 }}>
                    <span><StarOutlined /> {parseFloat(item.rating_average || 0).toFixed(1)}</span>
                    <span><DownloadOutlined /> {item.downloads_count || 0}</span>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Spin>
      </section>

      {/* 4. Skill 日榜 */}
      <RankingBoard
        title="Skill 热榜（日榜）"
        items={skillTrending}
        loading={skillTrendingLoading}
        resourceType="skill"
        onItemClick={(item) => navigate(`/skills/${item.id}`)}
      />

      {/* 5. MCP 周榜 */}
      <RankingBoard
        title="MCP 热榜（周榜）"
        items={mcpTrending}
        loading={mcpTrendingLoading}
        resourceType="mcp"
        onItemClick={(item) => navigate(`/mcps/${item.id}`)}
      />
    </div>
  )
}

export default MarketPlace
