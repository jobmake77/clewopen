import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, Spin, Tag } from 'antd'
import {
  RobotOutlined,
  UserOutlined,
  ToolOutlined,
  ApiOutlined,
  DollarOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { fetchTrendingAgents, fetchPlatformStats } from '../../store/slices/agentSlice'
import { fetchTrendingSkills } from '../../store/slices/skillSlice'
import { fetchTrendingMcps } from '../../store/slices/mcpSlice'
import { getCustomOrders } from '../../services/customOrderService'
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

  const [customOrders, setCustomOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  useEffect(() => {
    dispatch(fetchPlatformStats())
    dispatch(fetchTrendingAgents({ limit: 10 }))
    dispatch(fetchTrendingSkills({ limit: 10, days: 1 }))
    dispatch(fetchTrendingMcps({ limit: 10, days: 7 }))

    // 获取最新定制订单
    setOrdersLoading(true)
    getCustomOrders({ page: 1, pageSize: 5, status: 'open' })
      .then(res => {
        setCustomOrders(res.data?.items || res.data?.orders || [])
      })
      .catch(() => {})
      .finally(() => setOrdersLoading(false))
  }, [dispatch])

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

      {/* 3. Agent 热门榜单 */}
      <RankingBoard
        title="Agent 热门榜单"
        items={agentTrending}
        loading={agentTrendingLoading}
        resourceType="agent"
        onItemClick={(item) => navigate(`/agent/${item.id}`)}
      />

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

      {/* 6. 定制开发悬赏榜 */}
      <Card
        title="定制开发悬赏榜"
        style={{ marginBottom: 24 }}
        className="cream-panel"
        extra={<a onClick={() => navigate('/custom-order')}>查看全部</a>}
      >
        <Spin spinning={ordersLoading}>
          {customOrders.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', textAlign: 'center', padding: 24 }}>暂无悬赏订单</p>
          ) : (
            customOrders.map((order) => (
              <div
                key={order.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                }}
                onClick={() => navigate('/custom-order')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />
                    截止 {order.deadline ? new Date(order.deadline).toLocaleDateString() : '未设定'}
                  </div>
                </div>
                <div style={{ flexShrink: 0, marginLeft: 16 }}>
                  <Tag color="gold" style={{ fontSize: 14, padding: '2px 12px' }}>
                    <DollarOutlined /> {order.budget_min || 0} - {order.budget_max || 0} 元
                  </Tag>
                </div>
              </div>
            ))
          )}
        </Spin>
      </Card>
    </div>
  )
}

export default MarketPlace
