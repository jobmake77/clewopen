import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Card, Tabs, Statistic, Row, Col } from 'antd'
import { FileTextOutlined, StarOutlined, TeamOutlined, DownloadOutlined } from '@ant-design/icons'
import AgentReview from './AgentReview'
import ReviewManagement from './ReviewManagement'
import DataSync from './DataSync'
import LlmSettings from './LlmSettings'
import TrialRuntime from './TrialRuntime'
import { getPendingAgents, getAllReviews, getAllAgentsAdmin } from '../../services/adminService'
import './index.css'

function Admin() {
  const { isAuthenticated, user } = useSelector((state) => state.auth)
  const [stats, setStats] = useState({
    pendingAgents: 0,
    pendingReviews: 0,
    totalAgents: 0,
    totalApproved: 0
  })

  useEffect(() => {
    loadStats()
  }, [isAuthenticated, user])

  const loadStats = async () => {
    try {
      const [agentsRes, reviewsRes, allAgentsRes] = await Promise.all([
        getPendingAgents({ page: 1, pageSize: 1 }),
        getAllReviews({ page: 1, pageSize: 1, status: 'pending' }),
        getAllAgentsAdmin({ page: 1, pageSize: 1 })
      ])

      setStats({
        pendingAgents: agentsRes.success ? agentsRes.data.total : 0,
        pendingReviews: reviewsRes.success ? reviewsRes.data.total : 0,
        totalAgents: allAgentsRes.success ? allAgentsRes.data.total : 0,
        totalApproved: 0
      })
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  }

  const tabItems = [
    {
      key: 'agents',
      label: 'Agent 审核',
      children: <AgentReview />
    },
    {
      key: 'reviews',
      label: '评价审核',
      children: <ReviewManagement />
    },
    {
      key: 'data-sync',
      label: '数据同步',
      children: <DataSync />
    },
    {
      key: 'llm-settings',
      label: 'LLM 配置',
      children: <LlmSettings />
    },
    {
      key: 'trial-runtime',
      label: '试用沙盒',
      children: <TrialRuntime />
    }
  ]

  return (
    <div className="admin-container">
      <h1>管理控制台</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待审核 Agent"
              value={stats.pendingAgents}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待审核评价"
              value={stats.pendingReviews}
              prefix={<StarOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Agent 总数"
              value={stats.totalAgents}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日概览"
              value={stats.pendingAgents + stats.pendingReviews}
              suffix="项待处理"
              prefix={<DownloadOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs items={tabItems} />
      </Card>
    </div>
  )
}

export default Admin
