import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Modal,
  message,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ReloadOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  RocketOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  drainTrialRuntimeSlot,
  getTrialRuntimePoolStatus,
  getTrialRuntimeSlotLogs,
  recycleTrialRuntimeSlot,
} from '../../services/adminService'

const AUTO_REFRESH_MS = 5000

const SLOT_STATE_META = {
  pending: { label: '待预热', color: 'default' },
  creating: { label: '创建中', color: 'processing' },
  warming: { label: '预热中', color: 'processing' },
  warm: { label: '已就绪', color: 'success' },
  leased: { label: '使用中', color: 'blue' },
  draining: { label: '排空中', color: 'gold' },
  resetting: { label: '重置中', color: 'orange' },
  broken: { label: '异常', color: 'error' },
}

const SLOT_WARM_LEVEL_META = {
  'gateway-hot': { label: 'Gateway-Hot', color: 'magenta' },
  'install-ready': { label: 'Install-Ready', color: 'cyan' },
}

const EVENT_TYPE_META = {
  'pool-started': { label: 'Pool 启动', color: 'blue' },
  'pool-stopped': { label: 'Pool 停止', color: 'default' },
  'pool-hit': { label: '命中预热', color: 'success' },
  'pool-fallback': { label: '回退冷启动', color: 'orange' },
  'slot-warmed': { label: 'Slot 就绪', color: 'success' },
  'slot-recovered': { label: 'Slot 恢复', color: 'cyan' },
  'slot-recycled': { label: 'Slot 重建', color: 'cyan' },
  'slot-reset': { label: 'Slot 重置', color: 'processing' },
  'slot-released': { label: 'Slot 释放', color: 'blue' },
  'slot-draining': { label: 'Slot 排空', color: 'gold' },
  'slot-stale-lease': { label: '回收陈旧租约', color: 'magenta' },
  'slot-error': { label: 'Slot 错误', color: 'error' },
  'slot-anomaly': { label: 'Slot 异常观测', color: 'volcano' },
  'slot-scaled-down': { label: 'Slot 缩容移除', color: 'default' },
}

const HEALTH_META = {
  healthy: {
    label: '健康',
    color: 'success',
    alertType: 'success',
    description: 'warm slot 供应充足，当前没有明显异常或回退压力。',
  },
  degraded: {
    label: '降级',
    color: 'warning',
    alertType: 'warning',
    description: '存在 fallback、排空重建或少量异常，建议观察命中率和异常明细。',
  },
  critical: {
    label: '严重',
    color: 'error',
    alertType: 'error',
    description: '当前 warm pool 存在持续异常或多个 slot 不可用，建议立即排查。',
  },
}

const SLOT_LOG_TYPE_OPTIONS = [
  { value: 'install', label: 'install.log' },
  { value: 'execution', label: 'execution.log' },
  { value: 'gateway', label: 'gateway.log' },
]

function formatTime(value) {
  if (!value) return '-'
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

function formatDuration(value) {
  if (value == null) return '-'
  return `${value} ms`
}

function formatBytes(value) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 1024) {
    return `${normalized} B`
  }

  if (normalized < 1024 * 1024) {
    return `${(normalized / 1024).toFixed(1)} KB`
  }

  return `${(normalized / (1024 * 1024)).toFixed(1)} MB`
}

function getErrorMessage(error, fallbackMessage) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallbackMessage
  )
}

function renderSlotState(state) {
  const meta = SLOT_STATE_META[state] || { label: state || '未知', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function renderWarmLevel(warmLevel) {
  const meta = SLOT_WARM_LEVEL_META[warmLevel] || { label: warmLevel || '未知', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function renderEventType(type) {
  const meta = EVENT_TYPE_META[type] || { label: type || '未知事件', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function renderContainerState(state, status) {
  const normalizedState = state || 'missing'
  const color =
    normalizedState === 'running'
      ? 'success'
      : normalizedState === 'missing'
        ? 'default'
        : 'warning'

  return (
    <Space size={4} direction="vertical">
      <Tag color={color}>{normalizedState}</Tag>
      {status ? <Typography.Text type="secondary">{status}</Typography.Text> : null}
    </Space>
  )
}

function isSlotAnomalous(slot) {
  return (
    ['broken', 'draining'].includes(slot?.state) ||
    Boolean(slot?.activeIssueCode) ||
    Boolean(slot?.lastError?.message)
  )
}

function buildEventSearchText(event) {
  return [
    event?.type,
    event?.detail?.slotId,
    event?.detail?.sessionId,
    event?.detail?.namespace,
    event?.detail?.reason,
    event?.detail?.message,
    event?.detail?.issueCode,
    event?.detail?.staleSessionStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function TrialRuntime() {
  const [poolStatus, setPoolStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [slotQuery, setSlotQuery] = useState('')
  const [slotStates, setSlotStates] = useState([])
  const [showSlotAnomaliesOnly, setShowSlotAnomaliesOnly] = useState(false)
  const [eventQuery, setEventQuery] = useState('')
  const [eventTypes, setEventTypes] = useState([])
  const [showEventAnomaliesOnly, setShowEventAnomaliesOnly] = useState(false)
  const [slotActionKey, setSlotActionKey] = useState('')
  const [slotLogVisible, setSlotLogVisible] = useState(false)
  const [slotLogSlotId, setSlotLogSlotId] = useState('')
  const [slotLogType, setSlotLogType] = useState('install')
  const [slotLogData, setSlotLogData] = useState(null)
  const [slotLogLoading, setSlotLogLoading] = useState(false)
  const [slotLogError, setSlotLogError] = useState('')

  const loadPoolStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await getTrialRuntimePoolStatus()
      if (response.success) {
        setPoolStatus(response.data)
        setLastLoadedAt(new Date().toISOString())
        setLoadError('')
      }
    } catch (error) {
      console.error('加载试用沙盒状态失败:', error)
      setLoadError(error?.message || '加载试用沙盒状态失败')
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

  const loadSlotLog = useCallback(async (slotId, logType) => {
    if (!slotId) {
      return
    }

    setSlotLogLoading(true)
    setSlotLogError('')
    setSlotLogData(null)

    try {
      const response = await getTrialRuntimeSlotLogs(slotId, {
        type: logType,
        maxBytes: 65536,
      })

      if (response.success) {
        setSlotLogData(response.data)
      }
    } catch (error) {
      console.error('加载 slot 日志失败:', error)
      setSlotLogData(null)
      setSlotLogError(getErrorMessage(error, '加载 slot 日志失败'))
    } finally {
      setSlotLogLoading(false)
    }
  }, [])

  const openSlotLogModal = useCallback(
    async (slotId, logType = 'install') => {
      setSlotLogVisible(true)
      setSlotLogSlotId(slotId)
      setSlotLogType(logType)
      setSlotLogError('')
      setSlotLogData(null)
      await loadSlotLog(slotId, logType)
    },
    [loadSlotLog]
  )

  const runSlotAction = useCallback(
    async (slot, action) => {
      const actionKey = `${action}:${slot.id}`
      setSlotActionKey(actionKey)

      try {
        const response =
          action === 'drain'
            ? await drainTrialRuntimeSlot(slot.id, 'admin-drain')
            : await recycleTrialRuntimeSlot(slot.id, 'admin-recycle')

        message.success(response.message || `${slot.id} 操作已执行`)
        await loadPoolStatus()

        if (slotLogVisible && slotLogSlotId === slot.id) {
          await loadSlotLog(slot.id, slotLogType)
        }
      } catch (error) {
        console.error('执行 slot 运维动作失败:', error)
        message.error(
          getErrorMessage(error, action === 'drain' ? 'Slot 排空失败' : 'Slot 重建失败')
        )
      } finally {
        setSlotActionKey('')
      }
    },
    [loadPoolStatus, loadSlotLog, slotLogSlotId, slotLogType, slotLogVisible]
  )

  const confirmSlotAction = useCallback(
    (slot, action) => {
      const isDrain = action === 'drain'
      const title = isDrain ? `排空 ${slot.id}` : `重建 ${slot.id}`
      const content = isDrain
        ? slot.leasedSessionId
          ? '该 slot 当前仍在服务会话，本次操作会先标记为 draining，等会话释放后自动重建。'
          : '该 slot 会立刻退出 warm 池并重建为新的就绪实例。'
        : slot.leasedSessionId
          ? '该 slot 当前仍在服务会话，本次操作会排队等待当前租约结束后再重建。'
          : '该 slot 会立刻重建，适合处理 install 或 gateway 异常。'

      Modal.confirm({
        title,
        content,
        okText: isDrain ? '确认排空' : '确认重建',
        cancelText: '取消',
        okButtonProps: isDrain ? undefined : { danger: true },
        onOk: () => runSlotAction(slot, action),
      })
    },
    [runSlotAction]
  )

  const pool = poolStatus?.pool
  const runtime = poolStatus?.runtime
  const summary = pool?.summary || {}
  const warmLevels = pool?.warmLevels || { targets: {}, ready: {} }
  const slots = pool?.slots || []
  const anomalies = pool?.anomalies || []
  const telemetry = pool?.telemetry || {}
  const metrics = telemetry.metrics || {}
  const eventCounts = telemetry.eventCounts || {}
  const events = telemetry.events || []
  const fallbackEvents = telemetry.recentFallbacks || []
  const anomalyEvents = telemetry.recentAnomalyEvents || []
  const healthMeta = HEALTH_META[pool?.health] || HEALTH_META.healthy
  const slotLogSlot = slots.find((slot) => slot.id === slotLogSlotId) || null
  const slotQueryNormalized = slotQuery.trim().toLowerCase()
  const eventQueryNormalized = eventQuery.trim().toLowerCase()

  const filteredSlots = slots.filter((slot) => {
    if (slotStates.length > 0 && !slotStates.includes(slot.state)) {
      return false
    }

    if (showSlotAnomaliesOnly && !isSlotAnomalous(slot)) {
      return false
    }

    if (!slotQueryNormalized) {
      return true
    }

    const candidateText = [
      slot.id,
      slot.state,
      slot.runtimeAgentId,
      slot.containerName,
      slot.containerState,
      slot.leasedSessionId,
      slot.activeIssueCode,
      slot.activeIssueMessage,
      slot.lastError?.message,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return candidateText.includes(slotQueryNormalized)
  })

  const filteredEvents = events.filter((event) => {
    if (eventTypes.length > 0 && !eventTypes.includes(event.type)) {
      return false
    }

    if (
      showEventAnomaliesOnly &&
      !['slot-anomaly', 'slot-error', 'slot-stale-lease', 'slot-draining', 'pool-fallback'].includes(
        event.type
      )
    ) {
      return false
    }

    if (!eventQueryNormalized) {
      return true
    }

    return buildEventSearchText(event).includes(eventQueryNormalized)
  })

  const drainingCount = Number(summary.draining || 0)
  const warmCount = Number(summary.warm || 0)
  const leasedCount = Number(summary.leased || 0)
  const fallbackCount = Number(metrics.coldFallbacks || 0)
  const fillRate = pool?.size ? `${warmCount}/${pool.size}` : `${warmCount}`
  const hitRate = metrics.hitRate
  const anomalyCount = anomalies.length
  const gatewayHotReadyCount = Number(warmLevels?.ready?.['gateway-hot'] || 0)
  const gatewayHotTargetCount = Number(pool?.gatewayHotSize || warmLevels?.targets?.['gateway-hot'] || 0)

  const slotColumns = [
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
      title: '热层',
      key: 'warmLevel',
      width: 170,
      render: (_, record) => (
        <Space size={4} direction="vertical">
          {renderWarmLevel(record.warmLevel || record.targetWarmLevel)}
          <Typography.Text type="secondary">
            目标: {SLOT_WARM_LEVEL_META[record.targetWarmLevel]?.label || record.targetWarmLevel || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '容器',
      key: 'container',
      width: 140,
      render: (_, record) => renderContainerState(record.containerState, record.containerStatus),
    },
    {
      title: '当前异常',
      key: 'issue',
      width: 260,
      render: (_, record) => {
        const message = record.activeIssueMessage || record.lastError?.message
        if (!message) {
          return '-'
        }

        return (
          <Typography.Text type="danger" ellipsis={{ tooltip: message }}>
            {message}
          </Typography.Text>
        )
      },
    },
    {
      title: '租约会话',
      dataIndex: 'leasedSessionId',
      key: 'leasedSessionId',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '会话状态',
      dataIndex: 'leaseStatus',
      key: 'leaseStatus',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '复用 / 总服务',
      key: 'usage',
      width: 130,
      render: (_, record) => `${Number(record.useCount || 0)} / ${Number(record.totalSessionsServed || 0)}`,
    },
    {
      title: '连续失败',
      dataIndex: 'consecutiveFailures',
      key: 'consecutiveFailures',
      width: 100,
      render: (value) => Number(value || 0),
    },
    {
      title: '退避截止',
      dataIndex: 'brokenUntil',
      key: 'brokenUntil',
      width: 180,
      render: formatTime,
    },
    {
      title: '最近状态变更',
      key: 'lastStateChangedAt',
      width: 220,
      render: (_, record) =>
        record.lastStateChangedAt ? (
          <Space size={4} direction="vertical">
            <Typography.Text>{formatTime(record.lastStateChangedAt)}</Typography.Text>
            <Typography.Text type="secondary">{record.lastStateReason || '-'}</Typography.Text>
          </Space>
        ) : (
          '-'
        ),
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
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => {
        const drainActionKey = `drain:${record.id}`
        const recycleActionKey = `recycle:${record.id}`

        return (
          <Space wrap size={4}>
            <Button
              size="small"
              onClick={() => confirmSlotAction(record, 'drain')}
              loading={slotActionKey === drainActionKey}
              disabled={record.isBusy}
            >
              排空
            </Button>
            <Button
              size="small"
              danger
              onClick={() => confirmSlotAction(record, 'recycle')}
              loading={slotActionKey === recycleActionKey}
              disabled={record.isBusy}
            >
              重建
            </Button>
            <Button size="small" type="link" onClick={() => openSlotLogModal(record.id)}>
              日志
            </Button>
          </Space>
        )
      },
    },
  ]

  const fallbackColumns = [
    {
      title: '时间',
      dataIndex: 'at',
      key: 'at',
      width: 180,
      render: formatTime,
    },
    {
      title: '会话',
      dataIndex: ['detail', 'sessionId'],
      key: 'sessionId',
      width: 220,
      render: (value) => value || '-',
    },
    {
      title: '原因',
      dataIndex: ['detail', 'reason'],
      key: 'reason',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '等待耗时',
      dataIndex: ['detail', 'waitedMs'],
      key: 'waitedMs',
      width: 120,
      render: formatDuration,
    },
    {
      title: '命名空间',
      dataIndex: ['detail', 'namespace'],
      key: 'namespace',
      width: 180,
      render: (value) => value || '-',
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
      width: 140,
      render: renderEventType,
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
      title: '原因 / 代码',
      key: 'reason',
      width: 180,
      render: (_, record) =>
        record?.detail?.reason ||
        record?.detail?.issueCode ||
        record?.detail?.staleSessionStatus ||
        '-',
    },
    {
      title: '详情',
      key: 'detail',
      render: (_, record) => {
        const message = record?.detail?.message
        if (message) {
          return (
            <Typography.Text ellipsis={{ tooltip: message }}>
              {message}
            </Typography.Text>
          )
        }

        const detailText = [
          record?.detail?.namespace,
          record?.detail?.observedState,
          record?.detail?.waitedMs != null ? `${record.detail.waitedMs} ms` : null,
        ]
          .filter(Boolean)
          .join(' / ')

        return detailText || '-'
      },
    },
  ]

  return (
    <div>
      <Alert
        style={{ marginBottom: 16 }}
        type={healthMeta.alertType}
        showIcon
        message={`Warm Pool 健康度：${healthMeta.label}`}
        description={healthMeta.description}
      />

      {loadError ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="加载试用沙盒状态失败"
          description={loadError}
        />
      ) : null}

      <Row gutter={16} style={{ marginBottom: 16 }}>
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
              title="当前异常 Slot"
              value={anomalyCount}
              prefix={<ClusterOutlined />}
              valueStyle={{ color: anomalyCount > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="Gateway-Hot 就绪"
              value={gatewayHotReadyCount}
              suffix={`/ ${gatewayHotTargetCount}`}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: gatewayHotReadyCount >= gatewayHotTargetCount ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="使用中 Slot"
              value={leasedCount}
              prefix={<DeploymentUnitOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="陈旧租约回收"
              value={Number(metrics.staleLeaseReclaims || 0)}
              prefix={<WarningOutlined />}
              valueStyle={{ color: Number(metrics.staleLeaseReclaims || 0) > 0 ? '#fa8c16' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="排空 / 修复中"
              value={drainingCount + Number(summary.resetting || 0)}
              prefix={<WarningOutlined />}
              valueStyle={{ color: drainingCount > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="运行时概览"
        extra={
          <Space>
            <Typography.Text type="secondary">
              上次刷新: {formatTime(lastLoadedAt)}
            </Typography.Text>
            <Button icon={<ReloadOutlined />} onClick={() => loadPoolStatus()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="运行模式">{runtime?.mode || '-'}</Descriptions.Item>
          <Descriptions.Item label="Pool 命名空间">{pool?.namespace || '-'}</Descriptions.Item>
          <Descriptions.Item label="Pool 健康度">
            <Tag color={healthMeta.color}>{healthMeta.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="容器镜像">{runtime?.containerImage || '-'}</Descriptions.Item>
          <Descriptions.Item label="容器网络">{runtime?.network || '-'}</Descriptions.Item>
          <Descriptions.Item label="预热规模">{pool?.size ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Gateway-Hot 配额">{pool?.gatewayHotSize ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Gateway-Hot 就绪">{gatewayHotReadyCount}</Descriptions.Item>
          <Descriptions.Item label="并发预热">{pool?.bootstrapConcurrency ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="获取超时">
            {pool?.acquireTimeoutMs ? `${pool.acquireTimeoutMs} ms` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="维护间隔">
            {pool?.maintenanceIntervalMs ? `${pool.maintenanceIntervalMs} ms` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="故障退避窗口">
            {pool?.brokenRetryBaseMs && pool?.brokenRetryMaxMs
              ? `${pool.brokenRetryBaseMs} ~ ${pool.brokenRetryMaxMs} ms`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Warm 命中次数">{metrics.warmHits ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Hot 命中 / Install 命中">
            {`${metrics.gatewayHotHits ?? 0} / ${metrics.installReadyHits ?? 0}`}
          </Descriptions.Item>
          <Descriptions.Item label="冷启动回退次数">{metrics.coldFallbacks ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计租约">{metrics.leases ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计释放">{metrics.releases ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计重置">{metrics.slotResets ?? 0}</Descriptions.Item>
          <Descriptions.Item label="累计重建">{metrics.slotRecycles ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Gateway 预热次数">{metrics.slotGatewayWarmups ?? 0}</Descriptions.Item>
          <Descriptions.Item label="恢复成功次数">{metrics.slotRecoveries ?? 0}</Descriptions.Item>
          <Descriptions.Item label="陈旧租约回收">{metrics.staleLeaseReclaims ?? 0}</Descriptions.Item>
          <Descriptions.Item label="故障重试次数">{metrics.brokenRetries ?? 0}</Descriptions.Item>
          <Descriptions.Item label="异常观测次数">{metrics.slotAnomalies ?? 0}</Descriptions.Item>
          <Descriptions.Item label="维护轮次">{metrics.maintenanceRuns ?? 0}</Descriptions.Item>
          <Descriptions.Item label="运行开始">{formatTime(metrics.startedAt)}</Descriptions.Item>
          <Descriptions.Item label="事件计数">
            {Object.keys(eventCounts).length > 0
              ? Object.entries(eventCounts)
                  .map(([type, count]) => `${EVENT_TYPE_META[type]?.label || type}:${count}`)
                  .join(' | ')
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Pool 工作目录">{pool?.workspaceRoot || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="Warm Slot 明细"
        extra={
          <Space wrap>
            <Input
              allowClear
              placeholder="搜索 slot / session / issue"
              value={slotQuery}
              onChange={(event) => setSlotQuery(event.target.value)}
              style={{ width: 240 }}
            />
            <Select
              allowClear
              mode="multiple"
              placeholder="筛选状态"
              value={slotStates}
              onChange={setSlotStates}
              style={{ width: 220 }}
              options={Object.entries(SLOT_STATE_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
            <Space size={4}>
              <Switch checked={showSlotAnomaliesOnly} onChange={setShowSlotAnomaliesOnly} />
              <Typography.Text>仅看异常</Typography.Text>
            </Space>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={slotColumns}
          dataSource={filteredSlots}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          size="small"
          scroll={{ x: 1800 }}
          expandable={{
            expandedRowRender: (record) => (
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="容器名">{record.containerName || '-'}</Descriptions.Item>
                <Descriptions.Item label="运行 Agent ID">{record.runtimeAgentId || '-'}</Descriptions.Item>
                <Descriptions.Item label="工作目录">{record.workspacePath || '-'}</Descriptions.Item>
                <Descriptions.Item label="当前热层">
                  {renderWarmLevel(record.warmLevel || record.targetWarmLevel)}
                </Descriptions.Item>
                <Descriptions.Item label="目标热层">
                  {renderWarmLevel(record.targetWarmLevel)}
                </Descriptions.Item>
                <Descriptions.Item label="Gateway 预热">
                  {record.gatewayWarmup?.status || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="租约开始">{formatTime(record.leaseAcquiredAt)}</Descriptions.Item>
                <Descriptions.Item label="租约过期">{formatTime(record.leaseExpiresAt)}</Descriptions.Item>
                <Descriptions.Item label="恢复尝试次数">
                  {Number(record.recoveryAttempts || 0)}
                </Descriptions.Item>
                <Descriptions.Item label="累计租约">
                  {Number(record.totalLeaseCount || 0)}
                </Descriptions.Item>
                <Descriptions.Item label="后台任务中">
                  {record.isBusy ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="最近释放">{formatTime(record.lastReleasedAt)}</Descriptions.Item>
                <Descriptions.Item label="上次排空原因">
                  {record.lastDrainReason?.reason || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="异常代码">
                  {record.activeIssueCode || '-'}
                </Descriptions.Item>
              </Descriptions>
            ),
          }}
        />
      </Card>

      <Card title="最近 Fallback 明细" style={{ marginTop: 24 }}>
        {fallbackEvents.length > 0 ? (
          <Table
            rowKey="id"
            loading={loading}
            columns={fallbackColumns}
            dataSource={fallbackEvents}
            pagination={{ pageSize: 5, hideOnSinglePage: true }}
            size="small"
            scroll={{ x: 900 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="最近没有 fallback 记录" />
        )}
      </Card>

      <Card
        title="最近异常摘要"
        style={{ marginTop: 24 }}
        extra={
          <Typography.Text type="secondary">
            当前异常 Slot: {anomalyCount}，最近异常事件: {anomalyEvents.length}
          </Typography.Text>
        }
      >
        {anomalies.length > 0 ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {anomalies.map((slot) => (
              <Alert
                key={slot.id}
                type={['broken', 'draining'].includes(slot.state) ? 'error' : 'warning'}
                showIcon
                message={`${slot.id} · ${SLOT_STATE_META[slot.state]?.label || slot.state}`}
                description={
                  slot.activeIssueMessage ||
                  slot.lastError?.message ||
                  slot.lastStateReason ||
                  '存在待排查异常'
                }
              />
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有活动异常" />
        )}
      </Card>

      <Card
        title="运行事件"
        style={{ marginTop: 24 }}
        extra={
          <Space wrap>
            <Input
              allowClear
              placeholder="搜索事件 / session / reason"
              value={eventQuery}
              onChange={(event) => setEventQuery(event.target.value)}
              style={{ width: 240 }}
            />
            <Select
              allowClear
              mode="multiple"
              placeholder="筛选事件类型"
              value={eventTypes}
              onChange={setEventTypes}
              style={{ width: 260 }}
              options={Object.entries(EVENT_TYPE_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
            <Space size={4}>
              <Switch checked={showEventAnomaliesOnly} onChange={setShowEventAnomaliesOnly} />
              <Typography.Text>仅看异常 / fallback</Typography.Text>
            </Space>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={eventColumns}
          dataSource={filteredEvents}
          pagination={{ pageSize: 12, hideOnSinglePage: true }}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={`Slot 日志${slotLogSlot ? ` · ${slotLogSlot.id}` : ''}`}
        open={slotLogVisible}
        onCancel={() => {
          setSlotLogVisible(false)
          setSlotLogError('')
        }}
        footer={[
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            loading={slotLogLoading}
            onClick={() => loadSlotLog(slotLogSlotId, slotLogType)}
          >
            刷新日志
          </Button>,
          <Button key="close" type="primary" onClick={() => setSlotLogVisible(false)}>
            关闭
          </Button>,
        ]}
        width={960}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text type="secondary">日志类型</Typography.Text>
            <Select
              value={slotLogType}
              style={{ width: 180 }}
              options={SLOT_LOG_TYPE_OPTIONS}
              onChange={(value) => {
                setSlotLogType(value)
                loadSlotLog(slotLogSlotId, value)
              }}
            />
            {slotLogData?.exists ? (
              <Typography.Text type="secondary">
                {formatBytes(slotLogData.sizeBytes)} · 更新于 {formatTime(slotLogData.updatedAt)}
              </Typography.Text>
            ) : null}
          </Space>

          {slotLogData?.path ? (
            <Typography.Text type="secondary">路径: {slotLogData.path}</Typography.Text>
          ) : null}

          {slotLogError ? (
            <Alert type="error" showIcon message="日志加载失败" description={slotLogError} />
          ) : null}

          {!slotLogLoading && slotLogData && !slotLogData.exists ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前 slot 还没有生成这类日志文件"
            />
          ) : (
            <Card
              size="small"
              loading={slotLogLoading}
              styles={{
                body: {
                  maxHeight: 480,
                  overflow: 'auto',
                  background: '#0b1220',
                  borderRadius: 8,
                },
              }}
            >
              <pre
                style={{
                  margin: 0,
                  color: '#dbeafe',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {slotLogData?.content || '日志为空'}
              </pre>
            </Card>
          )}

          {slotLogData?.truncated ? (
            <Alert
              type="info"
              showIcon
              message="当前仅展示日志尾部 64 KB，便于快速定位最近问题。"
            />
          ) : null}
        </Space>
      </Modal>
    </div>
  )
}

export default TrialRuntime
