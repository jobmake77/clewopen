import { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Input, Select, Space, Switch, Table, Tag, message } from 'antd'
import {
  getGlobalInstallEvents,
  getGlobalInstallEventsSummary,
} from '../../services/adminService'

function InstallOps() {
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const [reasonCategoryFilter, setReasonCategoryFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [recentDays, setRecentDays] = useState(7)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize

  const reasonLabelMap = {
    timeout: '超时',
    network: '网络',
    auth: '认证/鉴权',
    dependency: '依赖缺失',
    validation: '配置校验',
    storage: '存储',
    permission: '权限',
    other: '其他',
    unknown: '未知',
  }

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const response = await getGlobalInstallEventsSummary({ recentDays })
      if (response.success) {
        setSummary(response.data || null)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载安装统计失败')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [recentDays])

  const loadItems = useCallback(async (options = {}) => {
    const page = options.page ?? currentPage
    const pageSize = options.pageSize ?? currentPageSize
    const status = options.status ?? statusFilter
    const mode = options.mode ?? modeFilter
    const reasonCategory = options.reasonCategory ?? reasonCategoryFilter
    const nextKeyword = options.keyword ?? keyword
    setItemsLoading(true)
    try {
      const response = await getGlobalInstallEvents({
        page,
        pageSize,
        status: status === 'all' ? undefined : status,
        mode: mode === 'all' ? undefined : mode,
        reasonCategory: reasonCategory === 'all' ? undefined : reasonCategory,
        keyword: nextKeyword?.trim() || undefined,
      })
      if (response.success) {
        setItems(response.data?.items || [])
        setPagination((prev) => ({
          ...prev,
          current: response.data?.page || page,
          pageSize: response.data?.pageSize || pageSize,
          total: response.data?.total || 0,
        }))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载安装事件失败')
      setItems([])
    } finally {
      setItemsLoading(false)
    }
  }, [currentPage, currentPageSize, keyword, modeFilter, reasonCategoryFilter, statusFilter])

  useEffect(() => {
    loadSummary()
    loadItems({ page: 1 })
  }, [loadItems, loadSummary])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const timerId = window.setInterval(() => {
      loadSummary()
      loadItems()
    }, 5000)
    return () => window.clearInterval(timerId)
  }, [autoRefresh, loadItems, loadSummary])

  const recentTotal = Number(summary?.recentWindowTotals?.total || 0)
  const recentSuccess = Number(summary?.recentWindowTotals?.success_count || 0)
  const recentFailed = Number(summary?.recentWindowTotals?.failed_count || 0)
  const successRate = recentTotal > 0 ? `${((recentSuccess / recentTotal) * 100).toFixed(1)}%` : '0.0%'
  const healthMeta = recentFailed > recentSuccess
    ? { type: 'error', text: '安装失败偏高，建议优先处理失败原因 Top' }
    : recentFailed > 0
      ? { type: 'warning', text: '存在安装失败，建议持续观察' }
      : { type: 'success', text: '安装链路健康' }

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value) => (value ? new Date(value).toLocaleString() : '-'),
    },
    {
      title: 'Agent',
      key: 'agent',
      render: (_, record) => record.agent_name || record.agent_slug || record.agent_id,
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 120,
      render: (value) => <Tag>{value || '-'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value) => (
        <Tag color={value === 'success' ? 'success' : 'error'}>
          {value === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '失败原因',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (value, record) => {
        if (!value) return '-'
        const category = reasonLabelMap[record.normalized_reason] || (record.normalized_reason || '-')
        return (
          <div>
            <Tag color="volcano" style={{ marginBottom: 4 }}>{category}</Tag>
            <div>{value}</div>
          </div>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="admin-section">
      <Card title="安装健康看板" loading={summaryLoading} className="cream-panel">
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag color="blue">总事件: {summary?.totals?.total ?? '-'}</Tag>
          <Tag color="green">总成功: {summary?.totals?.success_count ?? '-'}</Tag>
          <Tag color="red">总失败: {summary?.totals?.failed_count ?? '-'}</Tag>
          <Tag color="cyan">窗口成功: {recentSuccess}</Tag>
          <Tag color="volcano">窗口失败: {recentFailed}</Tag>
          <Tag color={recentFailed > 0 ? 'orange' : 'green'}>窗口成功率: {successRate}</Tag>
          <Tag color="default">窗口: 最近 {summary?.windowDays ?? recentDays} 天</Tag>
        </Space>
        <Alert type={healthMeta.type} showIcon message={healthMeta.text} style={{ marginBottom: 12 }} />
        {(summary?.topFailureReasons || []).length > 0 && (
          <Space wrap>
            <span style={{ color: 'var(--ink-muted)' }}>失败原因 Top:</span>
            {summary.topFailureReasons.map((item) => (
              <Tag
                key={`${item.reason}-${item.latest_failed_at}`}
                color="volcano"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setStatusFilter('failed')
                  setReasonCategoryFilter(item.reason || 'all')
                  setKeyword('')
                  loadItems({ page: 1, status: 'failed', reasonCategory: item.reason || 'all', keyword: '' })
                }}
              >
                {item.failed_count} 次 | {reasonLabelMap[item.reason] || item.reason}
              </Tag>
            ))}
          </Space>
        )}
        {(summary?.suggestedActions || []).length > 0 && (
          <Card
            type="inner"
            size="small"
            title="自动修复建议"
            className="cream-panel"
            style={{ marginTop: 10 }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {summary.suggestedActions.map((item) => (
                <div key={`${item.reason}-${item.action}`}>
                  <Tag color="blue">{reasonLabelMap[item.reason] || item.reason}</Tag>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    影响 {item.failed_count} 次
                  </span>
                  <div style={{ marginTop: 4 }}>{item.action}</div>
                </div>
              ))}
            </Space>
          </Card>
        )}
        {(summary?.topFailedAgents || []).length > 0 && (
          <Space wrap style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--ink-muted)' }}>失败较多 Agent:</span>
            {summary.topFailedAgents.map((item) => (
              <Tag
                key={`${item.agent_id}-${item.latest_failed_at}`}
                color="orange"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setStatusFilter('failed')
                  setKeyword(item.agent_name || '')
                  loadItems({ page: 1, status: 'failed', keyword: item.agent_name || '' })
                }}
              >
                {item.agent_name || item.agent_id} ({item.failed_count})
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      <Card title="安装事件明细" className="cream-panel">
        <Space style={{ marginBottom: 12 }} wrap>
          <Switch
            checked={autoRefresh}
            checkedChildren="自动刷新"
            unCheckedChildren="手动"
            onChange={setAutoRefresh}
          />
          <Select
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
              loadItems({ page: 1, status: value })
            }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'success', label: '成功' },
              { value: 'failed', label: '失败' },
            ]}
          />
          <Select
            style={{ width: 160 }}
            value={modeFilter}
            onChange={(value) => {
              setModeFilter(value)
              loadItems({ page: 1, mode: value })
            }}
            options={[
              { value: 'all', label: '全部模式' },
              { value: 'full', label: '全量' },
              { value: 'enhance', label: '增强' },
              { value: 'custom', label: '自选' },
            ]}
          />
          <Select
            style={{ width: 170 }}
            value={reasonCategoryFilter}
            onChange={(value) => {
              setReasonCategoryFilter(value)
              loadItems({ page: 1, reasonCategory: value })
            }}
            options={[
              { value: 'all', label: '全部失败分类' },
              { value: 'timeout', label: '超时' },
              { value: 'network', label: '网络' },
              { value: 'auth', label: '认证/鉴权' },
              { value: 'dependency', label: '依赖缺失' },
              { value: 'validation', label: '配置校验' },
              { value: 'storage', label: '存储' },
              { value: 'permission', label: '权限' },
              { value: 'other', label: '其他' },
              { value: 'unknown', label: '未知' },
            ]}
          />
          <Select
            style={{ width: 160 }}
            value={recentDays}
            onChange={(value) => {
              setRecentDays(value)
            }}
            options={[
              { value: 3, label: '最近 3 天' },
              { value: 7, label: '最近 7 天' },
              { value: 14, label: '最近 14 天' },
              { value: 30, label: '最近 30 天' },
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 260 }}
            placeholder="搜索 Agent / 用户 / 失败原因"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => {
              setKeyword(value)
              loadItems({ page: 1, keyword: value })
            }}
          />
        </Space>
        <Table
          rowKey="id"
          loading={itemsLoading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
          }}
          onChange={(nextPagination) => {
            loadItems({
              page: nextPagination.current,
              pageSize: nextPagination.pageSize,
            })
          }}
        />
      </Card>
    </Space>
  )
}

export default InstallOps
