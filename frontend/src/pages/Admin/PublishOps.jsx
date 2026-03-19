import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Descriptions, Input, Select, Space, Switch, Table, Tag, message } from 'antd'
import {
  getGlobalAgentPublishJobs,
  getGlobalAgentPublishJobsSummary,
  retryAgentPublishJob,
  triggerGlobalPublishJobsAlert,
} from '../../services/adminService'

function PublishOps() {
  const [jobs, setJobs] = useState([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [recentHours, setRecentHours] = useState(24)
  const [failureThreshold, setFailureThreshold] = useState(3)
  const [alertCooldownMinutes, setAlertCooldownMinutes] = useState(30)
  const [alertAutoTrigger, setAlertAutoTrigger] = useState(true)
  const [alertLoading, setAlertLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize

  const formatDurationSeconds = (value) => {
    const seconds = Number(value || 0)
    if (!Number.isFinite(seconds) || seconds <= 0) return '-'
    return `${seconds.toFixed(2)}s`
  }

  const toCsvCell = (value) => {
    const raw = String(value ?? '')
    return `"${raw.replaceAll('"', '""')}"`
  }

  const loadJobs = useCallback(async (options = {}) => {
    const page = options.page ?? currentPage
    const pageSize = options.pageSize ?? currentPageSize
    const status = options.status ?? statusFilter
    const nextKeyword = options.keyword ?? keyword
    const nextAnomalyOnly = options.anomalyOnly ?? anomalyOnly
    const nextRecentHours = options.recentHours ?? recentHours
    setJobsLoading(true)
    try {
      const response = await getGlobalAgentPublishJobs({
        page,
        pageSize,
        status: status === 'all' ? undefined : status,
        keyword: nextKeyword?.trim() || undefined,
        anomalyOnly: nextAnomalyOnly ? 1 : undefined,
        recentHours: nextRecentHours,
      })
      if (response.success) {
        setJobs(response.data.items || [])
        setPagination(prev => ({
          ...prev,
          current: response.data.page || page,
          pageSize: response.data.pageSize || pageSize,
          total: response.data.total || 0,
        }))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载发布任务失败')
      setJobs([])
    } finally {
      setJobsLoading(false)
    }
  }, [anomalyOnly, currentPage, currentPageSize, keyword, recentHours, statusFilter])

  const loadSummary = useCallback(async (options = {}) => {
    const nextRecentHours = options.recentHours ?? recentHours
    setSummaryLoading(true)
    try {
      const response = await getGlobalAgentPublishJobsSummary({
        recentHours: nextRecentHours,
        topLimit: 8,
      })
      if (response.success) {
        setSummary(response.data || null)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载发布任务汇总失败')
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [recentHours])

  useEffect(() => {
    loadSummary()
    loadJobs({ page: 1 })
  }, [loadJobs, loadSummary])

  useEffect(() => {
    if (!autoRefresh) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      loadSummary()
      loadJobs()
    }, 5000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [autoRefresh, loadJobs, loadSummary])

  const handleRetry = async (job) => {
    const key = `retry-${job.id}`
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      const response = await retryAgentPublishJob(job.id)
      if (response.success) {
        message.success('已创建重试任务')
        await loadSummary()
        await loadJobs()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '重试失败')
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleCopyRepositoryUrl = async (record) => {
    const repositoryUrl = record?.result?.repositoryUrl
    if (!repositoryUrl) {
      message.warning('该任务没有仓库链接')
      return
    }
    try {
      await navigator.clipboard.writeText(repositoryUrl)
      message.success('仓库链接已复制')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const exportJobsCsv = () => {
    const headers = [
      'id',
      'agent_id',
      'agent_name',
      'status',
      'queued_at',
      'started_at',
      'finished_at',
      'error_message',
      'repository_url',
    ]
    const lines = jobs.map((item) => [
      item.id,
      item.agent_id,
      item.agent_name || item.agent_slug || '',
      item.status,
      item.queued_at || '',
      item.started_at || '',
      item.finished_at || '',
      item.error_message || '',
      item?.result?.repositoryUrl || '',
    ].map(toCsvCell).join(','))

    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `publish-jobs-${new Date().toISOString().replaceAll(':', '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    message.success('已导出当前页 CSV')
  }

  const triggerAlert = useCallback(async (options = {}) => {
    const dryRun = Boolean(options.dryRun)
    setAlertLoading(true)
    try {
      const response = await triggerGlobalPublishJobsAlert({
        recentHours,
        threshold: failureThreshold,
        cooldownMinutes: alertCooldownMinutes,
        dryRun,
      })
      if (response.success) {
        if (dryRun) {
          message.info(response.message || '告警演练完成')
        } else {
          message.success(response.message || '告警触发完成')
        }
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '触发告警失败')
    } finally {
      setAlertLoading(false)
    }
  }, [alertCooldownMinutes, failureThreshold, recentHours])

  useEffect(() => {
    if (!alertAutoTrigger) return
    if (!summary) return
    const failedCount = Number(summary?.recentWindowTotals?.failed || 0)
    if (failedCount < failureThreshold) return
    triggerAlert({ dryRun: false })
  }, [alertAutoTrigger, failureThreshold, summary, triggerAlert])

  const recentFailedCount = Number(summary?.recentWindowTotals?.failed || 0)
  const recentWindowTotal = Number(summary?.recentWindowTotals?.total || 0)
  const recentFailureRate = recentWindowTotal > 0
    ? `${((recentFailedCount / recentWindowTotal) * 100).toFixed(1)}%`
    : '0.0%'
  const avgDuration = Number(summary?.durationStats?.avg_duration_seconds || 0)
  const recentAvgDuration = Number(summary?.durationStats?.recent_avg_duration_seconds || 0)
  const healthMeta = recentFailedCount >= failureThreshold
    ? { type: 'error', text: '异常偏高，请检查失败原因聚类' }
    : recentFailedCount > 0
      ? { type: 'warning', text: '存在失败任务，建议持续观察' }
      : { type: 'success', text: '发布链路健康' }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="admin-section">
      <Card title="发布任务健康看板" loading={summaryLoading} className="cream-panel">
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag color="blue">总任务: {summary?.totals?.total ?? '-'}</Tag>
          <Tag color="processing">排队: {summary?.totals?.queued ?? '-'}</Tag>
          <Tag color="cyan">运行中: {summary?.totals?.running ?? '-'}</Tag>
          <Tag color="green">成功: {summary?.totals?.succeeded ?? '-'}</Tag>
          <Tag color="red">失败: {summary?.totals?.failed ?? '-'}</Tag>
          <Tag color="gold">窗口失败: {recentFailedCount}</Tag>
          <Tag color={recentFailedCount >= failureThreshold ? 'red' : 'green'}>
            窗口失败率: {recentFailureRate}
          </Tag>
          <Tag color="purple">平均耗时: {formatDurationSeconds(avgDuration)}</Tag>
          <Tag color="geekblue">窗口平均耗时: {formatDurationSeconds(recentAvgDuration)}</Tag>
          <Tag color="default">窗口: 最近 {summary?.windowHours ?? recentHours} 小时</Tag>
        </Space>

        <Alert
          type={healthMeta.type}
          showIcon
          message={healthMeta.text}
          style={{ marginBottom: 12 }}
        />

        {(summary?.recentFailedAgents || []).length > 0 && (
          <Space wrap style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--ink-muted)' }}>失败较多 Agent:</span>
            {summary.recentFailedAgents.map((item) => (
              <Tag
                key={item.agent_id}
                color="volcano"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setKeyword(item.agent_name || '')
                  setStatusFilter('failed')
                  loadJobs({ page: 1, keyword: item.agent_name || '', status: 'failed' })
                }}
              >
                {item.agent_name} ({item.failed_count})
              </Tag>
            ))}
          </Space>
        )}

        {(summary?.recentFailureReasons || []).length > 0 && (
          <Card type="inner" title="失败原因聚类 TopN" size="small" className="cream-panel">
            <Space wrap>
              {summary.recentFailureReasons.map((item) => (
                <Tag
                  key={`${item.reason}-${item.latest_failed_at}`}
                  color="volcano"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setStatusFilter('failed')
                    setKeyword(item.reason || '')
                    loadJobs({
                      page: 1,
                      status: 'failed',
                      keyword: item.reason || '',
                    })
                  }}
                >
                  {item.failed_count} 次 | {item.reason}
                </Tag>
              ))}
            </Space>
          </Card>
        )}
      </Card>

      <Card title="全局发布任务" className="cream-panel">
        <Space style={{ marginBottom: 12 }} wrap>
          <Switch
            checked={autoRefresh}
            checkedChildren="自动刷新"
            unCheckedChildren="手动"
            onChange={setAutoRefresh}
          />
          <Select
            style={{ width: 180 }}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
              loadJobs({ page: 1, status: value })
            }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'queued', label: '排队中' },
              { value: 'running', label: '执行中' },
              { value: 'succeeded', label: '成功' },
              { value: 'failed', label: '失败' },
            ]}
          />
          <Input
            style={{ width: 280 }}
            allowClear
            placeholder="搜索任务ID/Agent/错误/仓库/包名"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => loadJobs({ page: 1, keyword })}
          />
          <Select
            style={{ width: 160 }}
            value={recentHours}
            onChange={(value) => {
              setRecentHours(value)
              loadSummary({ recentHours: value })
              loadJobs({ page: 1, recentHours: value })
            }}
            options={[
              { value: 1, label: '最近 1 小时' },
              { value: 6, label: '最近 6 小时' },
              { value: 24, label: '最近 24 小时' },
              { value: 72, label: '最近 72 小时' },
              { value: 168, label: '最近 7 天' },
            ]}
          />
          <Select
            style={{ width: 160 }}
            value={failureThreshold}
            onChange={setFailureThreshold}
            options={[
              { value: 1, label: '阈值 1' },
              { value: 3, label: '阈值 3' },
              { value: 5, label: '阈值 5' },
              { value: 10, label: '阈值 10' },
            ]}
          />
          <Select
            style={{ width: 170 }}
            value={alertCooldownMinutes}
            onChange={setAlertCooldownMinutes}
            options={[
              { value: 10, label: '告警冷却 10 分钟' },
              { value: 30, label: '告警冷却 30 分钟' },
              { value: 60, label: '告警冷却 60 分钟' },
              { value: 180, label: '告警冷却 3 小时' },
            ]}
          />
          <Switch
            checked={alertAutoTrigger}
            checkedChildren="自动告警"
            unCheckedChildren="手动告警"
            onChange={setAlertAutoTrigger}
          />
          <Switch
            checked={anomalyOnly}
            checkedChildren="仅异常"
            unCheckedChildren="全部"
            onChange={(value) => {
              setAnomalyOnly(value)
              loadJobs({ page: 1, anomalyOnly: value })
            }}
          />
          <Button onClick={() => loadJobs({ page: 1, keyword })}>搜索</Button>
          <Button onClick={() => { loadSummary(); loadJobs() }}>刷新</Button>
          <Button loading={alertLoading} onClick={() => triggerAlert({ dryRun: false })}>立即触发告警</Button>
          <Button loading={alertLoading} onClick={() => triggerAlert({ dryRun: true })}>告警演练</Button>
          <Button onClick={exportJobsCsv}>导出当前页 CSV</Button>
        </Space>

        <Table
          rowKey="id"
          loading={jobsLoading}
          dataSource={jobs}
          columns={[
            { title: '任务ID', dataIndex: 'id', key: 'id', width: 260 },
            {
              title: 'Agent',
              key: 'agent',
              width: 240,
              render: (_, record) => record.agent_name || record.agent_slug || record.agent_id,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 110,
              render: (value) => {
                const mapping = {
                  queued: { color: 'processing', label: '排队中' },
                  running: { color: 'blue', label: '执行中' },
                  succeeded: { color: 'green', label: '成功' },
                  failed: { color: 'red', label: '失败' },
                }
                const meta = mapping[value] || { color: 'default', label: value || '未知' }
                return <Tag color={meta.color}>{meta.label}</Tag>
              }
            },
            {
              title: '完成时间',
              dataIndex: 'finished_at',
              key: 'finished_at',
              width: 180,
              render: (value) => value ? new Date(value).toLocaleString() : '-',
            },
            {
              title: '错误',
              dataIndex: 'error_message',
              key: 'error_message',
              render: (value) => value || '-',
            },
            {
              title: '结果',
              key: 'result',
              width: 200,
              render: (_, record) => {
                const repositoryUrl = record?.result?.repositoryUrl
                if (!repositoryUrl) return '-'
                return (
                  <Space>
                    <a href={repositoryUrl} target="_blank" rel="noreferrer">仓库链接</a>
                    <Button size="small" type="link" onClick={() => handleCopyRepositoryUrl(record)}>复制</Button>
                  </Space>
                )
              },
            },
            {
              title: '操作',
              key: 'actions',
              width: 100,
              render: (_, record) => (
                <Button
                  size="small"
                  onClick={() => handleRetry(record)}
                  disabled={record.status !== 'failed'}
                  loading={actionLoading[`retry-${record.id}`]}
                >
                  重试
                </Button>
              ),
            },
          ]}
          pagination={{
            ...pagination,
            onChange: (page, pageSize) => loadJobs({ page, pageSize }),
          }}
          expandable={{
            expandedRowRender: (record) => (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="任务 Payload">
                  <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>
                    {JSON.stringify(record.payload || {}, null, 2)}
                  </pre>
                </Descriptions.Item>
                <Descriptions.Item label="任务 Result">
                  <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>
                    {JSON.stringify(record.result || {}, null, 2)}
                  </pre>
                </Descriptions.Item>
              </Descriptions>
            ),
          }}
        />
      </Card>
    </Space>
  )
}

export default PublishOps
