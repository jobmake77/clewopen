import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, ThunderboltOutlined, WarningOutlined, RocketOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { getTrialRuntimePoolStatus } from '../../services/adminService'

const AUTO_REFRESH_MS = 5000

const SLOT_STATE_META = {
  pending: { label: '待预热', color: 'default' },
  creating: { label: '创建中', color: 'processing' },
  warming: { label: '预热中', color: 'processing' },
  warm: { label: '已就绪', color: 'success' },
  leased: { label: '使用中', color: 'blue' },
  resetting: { label: '重置中', color: 'orange' },
  broken: { label: '异常', color: 'error' },
}

const EVENT_TYPE_META = {
  'pool-started': { label: 'Pool 启动', color: 'blue' },
  'pool-stopped': { label: 'Pool 停止', color: 'default' },
  'pool-hit': { label: '命中预热', color: 'success' },
  'pool-fallback': { label: '回退冷启动', color: 'orange' },
  'slot-warmed': { label: 'Slot 已预热', color: 'success' },
  'slot-recycled': { label: 'Slot 已重建', color: 'cyan' },
  'slot-reset': { label: 'Slot 已重置', color: 'processing' },
  'slot-released': { label: 'Slot 已释放', color: 'blue' },
  'slot-error': { label: 'Slot 异常', color: 'error' },
}

function formatTime(value) {
  if (!value) return '-'
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

function renderSlotState(state) {
  const meta = SLOT_STATE_META[state] || { label: state || '未知', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function TrialRuntime() {
  const [poolStatus, setPoolStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const loadPoolStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await getTrialRuntimePoolStatus()
      if (response.success) {
        setPoolStatus(response.data)
        setLastLoadedAt(new Date().toISOString())
      }
    } catch (error) {
      console.error('加载试用沙盒状态失败:', error)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadPoolStatus()
  }, [loadPoolStatus])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      loadPoolStatus({ silent: true })
    }, AUTO_REFRESH_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [loadPoolStatus])

  const pool = poolStatus?.pool
  const runtime = poolStatus?.runtime
  const summary = pool?.summary || {}
  const slots = pool?.slots || []
  const telemetry = pool?.telemetry || {}
  const metrics = telemetry.metrics || {}
  const events = telemetry.events || []
  const brokenCount = Number(summary.broken || 0)
  const warmCount = Number(summary.warm || 0)
  const leasedCount = Number(summary.leased || 0)
  const fallbackCount = Number(metrics.coldFallbacks || 0)
  const fillRate = pool?.size ? `${warmCount}/${pool.size}` : `${warmCount}`
  const hitRate = metrics.hitRate

  const columns = [
    {
      title: 'Slot',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      fixed: 'left',
      render: (value) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 100,
      render: renderSlotState,
    },
    {
      title: '运行 Agent ID',
      dataIndex: 'runtimeAgentId',
      key: 'runtimeAgentId',
      width: 170,
      render: (value) => value || '-',
    },
    {
      title: '租约会话',
      dataIndex: 'leasedSessionId',
      key: 'leasedSessionId',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '复用次数',
      dataIndex: 'useCount',
      key: 'useCount',
      width: 100,
      render: (value) => Number(value || 0),
    },
    {
      title: '最近预热',
      dataIndex: 'lastWarmedAt',
      key: 'lastWarmedAt',
      width: 180,
      render: formatTime,
    },
    {
      title: '最近租用',
      dataIndex: 'lastLeasedAt',
      key: 'lastLeasedAt',
      width: 180,
      render: formatTime,
    },
    {
      title: '最近释放',
      dataIndex: 'lastReleasedAt',
      key: 'lastReleasedAt',
      width: 180,
      render: formatTime,
    },
    {
      title: '最近错误',
      dataIndex: 'lastError',
      key: 'lastError',
      width: 360,
      render: (error) =>
        error?.message ? (
          <Typography.Text type="danger" ellipsis={{ tooltip: error.message }}>
            {error.message}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
  ]

  const eventColumns = [
    {
      title: '时间',
      dataIndex: 'at',
      key: 'at',
      width: 180,
      render: formatTime,
    },
    {
      title: '事件',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (value) => {
        const meta = EVENT_TYPE_META[value] || { label: value || '未知事件', color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: 'Slot',
      dataIndex: ['detail', 'slotId'],
      key: 'slotId',
      width: 90,
      render: (value) => value || '-',
    },
    {
      title: '会话',
      dataIndex: ['detail', 'sessionId'],
      key: 'sessionId',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '等待耗时',
      dataIndex: ['detail', 'waitedMs'],
      key: 'waitedMs',
      width: 110,
      render: (value) => (value != null ? `${value} ms` : '-'),
    },
    {
      title: '详情',
      key: 'detail',
      render: (_, record) => {
        const message = record?.detail?.message
        if (message) {
          return (
            <Typography.Text type="danger" ellipsis={{ tooltip: message }}>
              {message}
            </Typography.Text>
          )
        }

        const namespace = record?.detail?.namespace
        const reason = record?.detail?.reason
        return [namespace, reason].filter(Boolean).join(' / ') || '-'
      },
    },
  ]

  return (
    <div>
      {brokenCount > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message={`当前有 ${brokenCount} 个 warm slot 异常`}
          description="建议优先查看下方“最近错误”列，确认是镜像、挂载目录、模型配置还是网络问题。"
        />
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Warm Pool"
              value={fillRate}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: warmCount === Number(pool?.size || 0) ? '#52c41a' : '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="命中率"
              value={hitRate ?? 0}
              precision={1}
              suffix="%"
              prefix={<RocketOutlined />}
              valueStyle={{ color: (hitRate ?? 0) >= 80 ? '#52c41a' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="冷启动回退"
              value={fallbackCount}
              prefix={<WarningOutlined />}
              valueStyle={{ color: fallbackCount > 0 ? '#fa8c16' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="异常 Slot"
              value={brokenCount}
              prefix={<WarningOutlined />}
              valueStyle={{ color: brokenCount > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="运行时概览"
        extra={(
          <Space>
            <Typography.Text type="secondary">
              上次刷新: {formatTime(lastLoadedAt)}
            </Typography.Text>
            <Button icon={<ReloadOutlined />} onClick={() => loadPoolStatus()} loading={loading}>
              刷新
            </Button>
          </Space>
        )}
        style={{ marginBottom: 24 }}
      >
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="运行模式">{runtime?.mode || '-'}</Descriptions.Item>
          <Descriptions.Item label="Pool 命名空间">{pool?.namespace || '-'}</Descriptions.Item>
          <Descriptions.Item label="容器镜像">{runtime?.containerImage || '-'}</Descriptions.Item>
          <Descriptions.Item label="容器网络">{runtime?.network || '-'}</Descriptions.Item>
          <Descriptions.Item label="预热规模">{pool?.size ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="并发预热">{pool?.bootstrapConcurrency ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="获取超时">{pool?.acquireTimeoutMs ? `${pool.acquireTimeoutMs} ms` : '-'}</Descriptions.Item>
          <Descriptions.Item label="维护间隔">{pool?.maintenanceIntervalMs ? `${pool.maintenanceIntervalMs} ms` : '-'}</Descriptions.Item>
          <Descriptions.Item label="当前使用中 Slot">{leasedCount}</Descriptions.Item>
          <Descriptions.Item label="自动刷新">{AUTO_REFRESH_MS / 1000} 秒</Descriptions.Item>
          <Descriptions.Item label="Warm 命中次数">{metrics.warmHits ?? 0}</Descriptions.Item>
          <Descriptions.Item label="冷启动回退次数">{metrics.coldFallbacks ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计租约">{metrics.leases ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计释放">{metrics.releases ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计重置">{metrics.slotResets ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计重建">{metrics.slotRecycles ?? 0}</Descriptions.Item>
          <Descriptions.Item label="维护轮次">{metrics.maintenanceRuns ?? 0}</Descriptions.Item>
          <Descriptions.Item label="运行开始">{formatTime(metrics.startedAt)}</Descriptions.Item>
          <Descriptions.Item label="回收阈值">{pool?.recycleAfterSessions ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Pool 工作目录">{pool?.workspaceRoot || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Warm Slot 明细">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={slots}
          pagination={false}
          size="small"
          scroll={{ x: 1500 }}
        />
      </Card>

      <Card title="最近运行事件" style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={eventColumns}
          dataSource={events}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          size="small"
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  )
}

export default TrialRuntime
