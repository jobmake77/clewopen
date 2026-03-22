import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Card, Tabs, Statistic, Row, Col } from 'antd'
import { FileTextOutlined, StarOutlined, TeamOutlined, DownloadOutlined, DatabaseOutlined, CloudServerOutlined, ApiOutlined, SettingOutlined } from '@ant-design/icons'
import AgentReview from './AgentReview'
import ReviewManagement from './ReviewManagement'
import DataSync from './DataSync'
import LlmSettings from './LlmSettings'
import TrialRuntime from './TrialRuntime'
import PublishOps from './PublishOps'
import UserManagement from './UserManagement'
import InstallOps from './InstallOps'
import {
  getPendingAgents,
  getAllReviews,
  getAllAgentsAdmin,
  getGlobalInstallEventsSummary,
} from '../../services/adminService'
import './index.css'

function Admin() {
  const { isAuthenticated, user } = useSelector((state) => state.auth)
  const [stats, setStats] = useState({
    pendingAgents: 0,
    pendingReviews: 0,
    totalAgents: 0,
    totalApproved: 0,
    recentInstallSuccessRate: 0,
    recentInstallFailed: 0,
  })

  useEffect(() => {
    loadStats()
  }, [isAuthenticated, user])

  const loadStats = async () => {
    try {
      const [agentsRes, reviewsRes, allAgentsRes, installSummaryRes] = await Promise.all([
        getPendingAgents({ page: 1, pageSize: 1 }),
        getAllReviews({ page: 1, pageSize: 1, status: 'pending' }),
        getAllAgentsAdmin({ page: 1, pageSize: 1 }),
        getGlobalInstallEventsSummary({ recentDays: 7 }),
      ])

      const recentWindowTotals = installSummaryRes?.success
        ? (installSummaryRes.data?.recentWindowTotals || {})
        : {}
      const recentTotal = Number(recentWindowTotals.total || 0)
      const recentSuccess = Number(recentWindowTotals.success_count || 0)
      const recentFailed = Number(recentWindowTotals.failed_count || 0)
      const recentInstallSuccessRate = recentTotal > 0 ? Number(((recentSuccess / recentTotal) * 100).toFixed(1)) : 0

      setStats({
        pendingAgents: agentsRes.success ? agentsRes.data.total : 0,
        pendingReviews: reviewsRes.success ? reviewsRes.data.total : 0,
        totalAgents: allAgentsRes.success ? allAgentsRes.data.total : 0,
        totalApproved: 0,
        recentInstallSuccessRate,
        recentInstallFailed: recentFailed,
      })
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  }

  const tabItems = [
    {
      key: 'agents',
      label: <span><FileTextOutlined /> Agent 审核</span>,
      children: <AgentReview />
    },
    {
      key: 'reviews',
      label: <span><StarOutlined /> 评价审核</span>,
      children: <ReviewManagement />
    },
    {
      key: 'data-sync',
      label: <span><DatabaseOutlined /> 数据同步</span>,
      children: <DataSync />
    },
    {
      key: 'llm-settings',
      label: <span><SettingOutlined /> LLM 配置</span>,
      children: <LlmSettings />
    },
    {
      key: 'trial-runtime',
      label: <span><CloudServerOutlined /> 试用沙盒</span>,
      children: <TrialRuntime />
    },
    {
      key: 'publish-ops',
      label: <span><ApiOutlined /> 发布运维</span>,
      children: <PublishOps />
    },
    {
      key: 'install-ops',
      label: <span><DownloadOutlined /> 安装运维</span>,
      children: <InstallOps />
    },
    {
      key: 'users',
      label: <span><TeamOutlined /> 用户管理</span>,
      children: <UserManagement />
    }
  ]

  return (
    <div className="admin-container">
      <p className="section-label">Operations Console</p>
      <h1>管理控制台</h1>
      <p style={{ marginTop: -12, marginBottom: 20, color: 'var(--ink-muted)' }}>
        审核、同步、试用沙盒与发布运维的统一看板
      </p>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card className="cream-panel">
            <Statistic
              title="待审核 Agent"
              value={stats.pendingAgents}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: 'var(--status-info)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cream-panel">
            <Statistic
              title="待审核评价"
              value={stats.pendingReviews}
              prefix={<StarOutlined />}
              valueStyle={{ color: 'var(--status-warning)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cream-panel">
            <Statistic
              title="Agent 总数"
              value={stats.totalAgents}
              prefix={<TeamOutlined />}
              valueStyle={{ color: 'var(--status-success)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cream-panel">
            <Statistic
              title="近7天安装成功率"
              value={stats.recentInstallSuccessRate}
              suffix="%"
              prefix={<DownloadOutlined />}
              valueStyle={{ color: stats.recentInstallFailed > 0 ? 'var(--status-warning)' : 'var(--status-success)' }}
            />
            <div style={{ marginTop: 8, color: 'var(--ink-muted)', fontSize: 12 }}>
              安装失败: {stats.recentInstallFailed}
            </div>
          </Card>
        </Col>
      </Row>

      <Card className="cream-panel">
        <Tabs items={tabItems} />
      </Card>
    </div>
  )
}

export default Admin
