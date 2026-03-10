import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Card, Tabs, Statistic, Row, Col, message } from 'antd'
import { FileTextOutlined, StarOutlined } from '@ant-design/icons'
import AgentReview from './AgentReview'
import ReviewManagement from './ReviewManagement'
import { getPendingAgents, getAllReviews } from '../../services/adminService'
import './index.css'

function Admin() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useSelector((state) => state.auth)
  const [stats, setStats] = useState({
    pendingAgents: 0,
    pendingReviews: 0
  })

  useEffect(() => {
    // 权限检查
    if (!isAuthenticated || user?.role !== 'admin') {
      message.error('无权访问')
      navigate('/')
      return
    }

    // 加载统计数据
    loadStats()
  }, [isAuthenticated, user, navigate])

  const loadStats = async () => {
    try {
      const [agentsRes, reviewsRes] = await Promise.all([
        getPendingAgents({ page: 1, pageSize: 1 }),
        getAllReviews({ page: 1, pageSize: 1, status: 'pending' })
      ])

      setStats({
        pendingAgents: agentsRes.success ? agentsRes.data.total : 0,
        pendingReviews: reviewsRes.success ? reviewsRes.data.total : 0
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
    }
  ]

  return (
    <div className="admin-container">
      <h1>管理控制台</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card>
            <Statistic
              title="待审核 Agent"
              value={stats.pendingAgents}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <Statistic
              title="待审核评价"
              value={stats.pendingReviews}
              prefix={<StarOutlined />}
              valueStyle={{ color: '#faad14' }}
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
