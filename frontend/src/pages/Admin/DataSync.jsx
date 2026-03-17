import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Statistic, Button, Table, Tag, message } from 'antd'
import {
  SyncOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { getSyncStatus, triggerSync, getSyncHistory } from '../../services/adminService'
import dayjs from 'dayjs'

function DataSync() {
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, historyRes] = await Promise.all([
        getSyncStatus(),
        getSyncHistory(),
      ])
      if (statusRes.success) setStatus(statusRes.data)
      if (historyRes.success) setHistory(historyRes.data)
    } catch (err) {
      console.error('加载同步数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await triggerSync()
      if (res.success) {
        message.success('同步已触发，请稍候刷新查看结果')
        // 轮询等待同步完成
        setTimeout(() => {
          loadData()
          setSyncing(false)
        }, 5000)
        // 再次刷新以获取最终结果
        setTimeout(loadData, 15000)
        setTimeout(loadData, 30000)
      }
    } catch (err) {
      if (err.response?.status === 409) {
        message.warning('同步正在进行中，请稍后再试')
      } else {
        message.error('触发同步失败: ' + (err.message || '未知错误'))
      }
      setSyncing(false)
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 180,
      render: (t) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: 'MCP 获取',
      dataIndex: 'mcpsFetched',
      key: 'mcpsFetched',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: 'MCP 新增',
      dataIndex: 'mcpsInserted',
      key: 'mcpsInserted',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: 'MCP 更新',
      dataIndex: 'mcpsUpdated',
      key: 'mcpsUpdated',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: 'Skill 获取',
      dataIndex: 'skillsFetched',
      key: 'skillsFetched',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: 'Skill 新增',
      dataIndex: 'skillsInserted',
      key: 'skillsInserted',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: 'Skill 更新',
      dataIndex: 'skillsUpdated',
      key: 'skillsUpdated',
      width: 90,
      render: (v) => v ?? '-',
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
      render: (ms) => ms != null ? `${(ms / 1000).toFixed(1)}s` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => {
        if (s === 'success') return <Tag color="green">成功</Tag>
        if (s === 'failed') return <Tag color="red">失败</Tag>
        if (s === 'running') return <Tag color="blue">进行中</Tag>
        return <Tag>{s}</Tag>
      },
    },
  ]

  const syncStatusTag = () => {
    if (status?.isSyncing) return <Tag icon={<SyncOutlined spin />} color="processing">同步中</Tag>
    if (history.length > 0 && history[0].status === 'failed') return <Tag icon={<CloseCircleOutlined />} color="error">上次失败</Tag>
    return <Tag icon={<CheckCircleOutlined />} color="success">正常</Tag>
  }

  return (
    <div>
      {/* 状态卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="MCP 总数"
              value={status?.totalMcps ?? '-'}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Skill 总数"
              value={status?.totalSkills ?? '-'}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="上次同步"
              value={status?.lastSyncTime ? dayjs(status.lastSyncTime).format('MM-DD HH:mm') : '未同步'}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ marginBottom: 8 }}>同步状态</div>
            <div style={{ fontSize: 24, lineHeight: '38px' }}>
              {syncStatusTag()}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Skill 来源拆分" size="small">
            <p>外部资源: {status?.skillBreakdown?.external ?? 0}</p>
            <p>平台上传: {status?.skillBreakdown?.uploaded ?? 0}</p>
            <p>GitHub: {status?.skillBreakdown?.github ?? 0}</p>
            <p>OpenClaw: {status?.skillBreakdown?.openclaw ?? 0}</p>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="MCP 来源拆分" size="small">
            <p>外部资源: {status?.mcpBreakdown?.external ?? 0}</p>
            <p>平台上传: {status?.mcpBreakdown?.uploaded ?? 0}</p>
          </Card>
        </Col>
      </Row>

      {/* 操作区 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
            disabled={syncing || status?.isSyncing}
          >
            手动同步
          </Button>
          {status?.nextSyncTime && (
            <span style={{ color: '#999' }}>
              自动同步间隔: {status?.intervalMinutes || 1440} 分钟，
              下次自动同步: {dayjs(status.nextSyncTime).format('YYYY-MM-DD HH:mm:ss')}
            </span>
          )}
          {history[0]?.openclawIsPartial && (
            <span style={{ color: '#999' }}>
              本轮 OpenClaw 为分批同步: {history[0]?.openclawProcessedRange?.start}-{history[0]?.openclawProcessedRange?.end} / {history[0]?.openclawProcessedRange?.totalUsers}
            </span>
          )}
          <Button onClick={loadData} style={{ marginLeft: 'auto' }}>
            刷新
          </Button>
        </div>
      </Card>

      {/* 同步历史 */}
      <Card title="同步历史">
        <Table
          columns={columns}
          dataSource={history}
          rowKey="startTime"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  )
}

export default DataSync
