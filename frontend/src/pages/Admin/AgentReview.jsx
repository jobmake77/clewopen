import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Tag, Modal, message, Space, Descriptions, Input, Form, Select, Switch, Empty } from 'antd'
import { CheckOutlined, CloseOutlined, EyeOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import {
  getPendingAgents,
  approveAgent,
  rejectAgent,
  batchAgentAction,
  publishAgent,
  getAgentPublishJobs,
  getGlobalAgentPublishJobs,
  getGlobalAgentPublishJobsSummary,
  retryAgentPublishJob,
} from '../../services/adminService'

const { TextArea } = Input
const { Option } = Select

function AgentReview() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState({})
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [publishModalVisible, setPublishModalVisible] = useState(false)
  const [publishingId, setPublishingId] = useState(null)
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishJobsVisible, setPublishJobsVisible] = useState(false)
  const [publishJobsLoading, setPublishJobsLoading] = useState(false)
  const [publishJobsAgent, setPublishJobsAgent] = useState(null)
  const [publishJobsAutoRefresh, setPublishJobsAutoRefresh] = useState(true)
  const [publishJobStatusFilter, setPublishJobStatusFilter] = useState('all')
  const [publishJobKeyword, setPublishJobKeyword] = useState('')
  const [publishJobs, setPublishJobs] = useState([])
  const [globalPublishJobsVisible, setGlobalPublishJobsVisible] = useState(false)
  const [globalPublishJobsLoading, setGlobalPublishJobsLoading] = useState(false)
  const [globalPublishJobs, setGlobalPublishJobs] = useState([])
  const [globalPublishSummary, setGlobalPublishSummary] = useState(null)
  const [globalPublishSummaryLoading, setGlobalPublishSummaryLoading] = useState(false)
  const [globalPublishAutoRefresh, setGlobalPublishAutoRefresh] = useState(true)
  const [globalPublishJobStatusFilter, setGlobalPublishJobStatusFilter] = useState('all')
  const [globalPublishJobKeyword, setGlobalPublishJobKeyword] = useState('')
  const [globalPublishAnomalyOnly, setGlobalPublishAnomalyOnly] = useState(false)
  const [globalPublishRecentHours, setGlobalPublishRecentHours] = useState(24)
  const [globalFailureThreshold, setGlobalFailureThreshold] = useState(3)
  const [globalPublishJobsPagination, setGlobalPublishJobsPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [publishForm] = Form.useForm()
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize
  const globalJobsCurrentPage = globalPublishJobsPagination.current
  const globalJobsPageSize = globalPublishJobsPagination.pageSize

  const loadAgents = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getPendingAgents({
        page: currentPage,
        pageSize: currentPageSize
      })
      if (response.success) {
        setAgents(response.data.agents)
        setPagination(prev => ({
          ...prev,
          total: response.data.total
        }))
      }
    } catch (error) {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [currentPage, currentPageSize])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const handleApprove = (id) => {
    Modal.confirm({
      title: '确认批准',
      icon: <ExclamationCircleOutlined />,
      content: '确定要批准这个 Agent 吗？批准后将在市场上可见。',
      onOk: async () => {
        setActionLoading(prev => ({ ...prev, [id]: true }))
        try {
          const response = await approveAgent(id)
          if (response.success) {
            message.success('批准成功')
            loadAgents()
          }
        } catch (error) {
          message.error(error.response?.data?.error?.message || '批准失败')
        } finally {
          setActionLoading(prev => ({ ...prev, [id]: false }))
        }
      }
    })
  }

  const handleRejectClick = (id) => {
    setRejectingId(id)
    setRejectReason('')
    setRejectModalVisible(true)
  }

  const handleRejectConfirm = async () => {
    setActionLoading(prev => ({ ...prev, [rejectingId]: true }))
    try {
      const response = await rejectAgent(rejectingId, rejectReason)
      if (response.success) {
        message.success('已拒绝')
        setRejectModalVisible(false)
        loadAgents()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '拒绝失败')
    } finally {
      setActionLoading(prev => ({ ...prev, [rejectingId]: false }))
    }
  }

  const handleBatchAction = async (action) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要操作的 Agent')
      return
    }

    Modal.confirm({
      title: `批量${action === 'approve' ? '批准' : '拒绝'}`,
      icon: <ExclamationCircleOutlined />,
      content: `确定要${action === 'approve' ? '批准' : '拒绝'}选中的 ${selectedRowKeys.length} 个 Agent 吗？`,
      onOk: async () => {
        setBatchLoading(true)
        try {
          const response = await batchAgentAction(selectedRowKeys, action)
          if (response.success) {
            message.success(response.message || `批量操作完成`)
            setSelectedRowKeys([])
            loadAgents()
          }
        } catch (error) {
          message.error('批量操作失败')
        } finally {
          setBatchLoading(false)
        }
      }
    })
  }

  const showDetail = (agent) => {
    setSelectedAgent(agent)
    setDetailModalVisible(true)
  }

  const openPublishModal = (id) => {
    setPublishingId(id)
    publishForm.setFieldsValue({
      publish_mode: 'open',
      package_registry: 'none',
      github_auto_create: false,
    })
    setPublishModalVisible(true)
  }

  const handlePublishConfirm = async () => {
    try {
      const values = await publishForm.validateFields()
      setPublishLoading(true)
      const response = await publishAgent(publishingId, values)
      if (response.success) {
        const jobsRes = await getAgentPublishJobs(publishingId, { limit: 1 })
        setPublishJobs(jobsRes.success ? jobsRes.data : [])
        message.success(response.message || '发布任务已创建')
        setPublishModalVisible(false)
        loadAgents()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '发布失败')
    } finally {
      setPublishLoading(false)
    }
  }

  const loadPublishJobs = useCallback(async (agentId) => {
    setPublishJobsLoading(true)
    try {
      const jobsRes = await getAgentPublishJobs(agentId, { limit: 20 })
      setPublishJobs(jobsRes.success ? jobsRes.data : [])
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载发布任务失败')
      setPublishJobs([])
    } finally {
      setPublishJobsLoading(false)
    }
  }, [])

  const loadGlobalPublishJobs = useCallback(async (options = {}) => {
    const page = options.page ?? globalJobsCurrentPage
    const pageSize = options.pageSize ?? globalJobsPageSize
    const status = options.status ?? globalPublishJobStatusFilter
    const keyword = options.keyword ?? globalPublishJobKeyword
    const anomalyOnly = options.anomalyOnly ?? globalPublishAnomalyOnly
    const recentHours = options.recentHours ?? globalPublishRecentHours
    setGlobalPublishJobsLoading(true)
    try {
      const response = await getGlobalAgentPublishJobs({
        page,
        pageSize,
        status: status === 'all' ? undefined : status,
        keyword: keyword?.trim() || undefined,
        anomalyOnly: anomalyOnly ? 1 : undefined,
        recentHours,
      })
      if (response.success) {
        setGlobalPublishJobs(response.data.items || [])
        setGlobalPublishJobsPagination(prev => ({
          ...prev,
          current: response.data.page || page,
          pageSize: response.data.pageSize || pageSize,
          total: response.data.total || 0,
        }))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载全局发布任务失败')
      setGlobalPublishJobs([])
    } finally {
      setGlobalPublishJobsLoading(false)
    }
  }, [
    globalJobsCurrentPage,
    globalJobsPageSize,
    globalPublishAnomalyOnly,
    globalPublishJobKeyword,
    globalPublishJobStatusFilter,
    globalPublishRecentHours,
  ])

  const loadGlobalPublishSummary = useCallback(async (options = {}) => {
    const recentHours = options.recentHours ?? globalPublishRecentHours
    setGlobalPublishSummaryLoading(true)
    try {
      const response = await getGlobalAgentPublishJobsSummary({
        recentHours,
        topLimit: 6,
      })
      if (response.success) {
        setGlobalPublishSummary(response.data || null)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载发布任务汇总失败')
      setGlobalPublishSummary(null)
    } finally {
      setGlobalPublishSummaryLoading(false)
    }
  }, [globalPublishRecentHours])

  const openPublishJobsModal = async (agent) => {
    setPublishJobsAgent(agent)
    setPublishJobsVisible(true)
    setPublishJobsAutoRefresh(true)
    await loadPublishJobs(agent.id)
  }

  const openGlobalPublishJobsModal = async () => {
    setGlobalPublishJobsVisible(true)
    setGlobalPublishAutoRefresh(true)
    setGlobalPublishJobStatusFilter('all')
    setGlobalPublishJobKeyword('')
    setGlobalPublishAnomalyOnly(false)
    setGlobalPublishRecentHours(24)
    setGlobalPublishJobsPagination(prev => ({ ...prev, current: 1 }))
    await Promise.all([
      loadGlobalPublishSummary({ recentHours: 24 }),
      loadGlobalPublishJobs({
      page: 1,
      pageSize: globalPublishJobsPagination.pageSize,
      status: 'all',
      keyword: '',
      anomalyOnly: false,
      recentHours: 24,
      }),
    ])
  }

  useEffect(() => {
    if (!globalPublishJobsVisible || !globalPublishAutoRefresh) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      loadGlobalPublishSummary()
      loadGlobalPublishJobs()
    }, 5000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [globalPublishAutoRefresh, globalPublishJobsVisible, loadGlobalPublishJobs, loadGlobalPublishSummary])

  useEffect(() => {
    if (!publishJobsVisible || !publishJobsAgent?.id || !publishJobsAutoRefresh) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      loadPublishJobs(publishJobsAgent.id)
    }, 3000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [publishJobsVisible, publishJobsAgent?.id, publishJobsAutoRefresh, loadPublishJobs])

  const handleRetryPublishJob = async (job) => {
    const actionKey = `retry-${job.id}`
    setActionLoading(prev => ({ ...prev, [actionKey]: true }))
    try {
      const response = await retryAgentPublishJob(job.id)
      if (response.success) {
        message.success('已创建重试任务')
        if (publishJobsAgent?.id) {
          await loadPublishJobs(publishJobsAgent.id)
        }
        if (globalPublishJobsVisible) {
          await loadGlobalPublishJobs()
          await loadGlobalPublishSummary()
        }
        loadAgents()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '重试失败')
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }))
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

  const columns = [
    {
      title: 'Agent 名称',
      dataIndex: 'name',
      key: 'name',
      width: 200
    },
    {
      title: '作者',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 120
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags) => (
        <>
          {tags?.slice(0, 3).map(tag => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
          {tags?.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </>
      )
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: '审核阶段',
      dataIndex: 'review_stage',
      key: 'review_stage',
      width: 140,
      render: (value) => {
        const mapping = {
          pending_auto: { color: 'gold', label: '自动审核中' },
          pending_manual: { color: 'processing', label: '待人工审核' },
          approved: { color: 'green', label: '审核通过' },
          rejected: { color: 'red', label: '已拒绝' },
          published: { color: 'blue', label: '已发布' },
        }
        const meta = mapping[value] || { color: 'default', label: value || '未知' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      }
    },
    {
      title: '发布状态',
      dataIndex: 'publish_status',
      key: 'publish_status',
      width: 120,
      render: (value) => {
        const mapping = {
          not_published: { color: 'default', label: '未发布' },
          queued: { color: 'processing', label: '排队中' },
          published: { color: 'green', label: '已发布' },
          failed: { color: 'red', label: '发布失败' },
        }
        const meta = mapping[value] || { color: 'default', label: value || '未知' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => showDetail(record)}
          >
            查看
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleApprove(record.id)}
            loading={actionLoading[record.id]}
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleRejectClick(record.id)}
            loading={actionLoading[record.id]}
          >
            拒绝
          </Button>
          <Button
            size="small"
            onClick={() => openPublishModal(record.id)}
            disabled={record.review_stage !== 'approved'}
          >
            发布
          </Button>
          <Button
            size="small"
            onClick={() => openPublishJobsModal(record)}
          >
            任务
          </Button>
        </Space>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys
  }

  const publishJobsKeywordNormalized = publishJobKeyword.trim().toLowerCase()
  const recentFailedCount = Number(globalPublishSummary?.recentWindowTotals?.failed || 0)
  const globalHealthMeta = recentFailedCount >= globalFailureThreshold
    ? { color: 'red', label: '异常偏高' }
    : recentFailedCount > 0
      ? { color: 'orange', label: '轻微异常' }
      : { color: 'green', label: '健康' }
  const filteredPublishJobs = publishJobs.filter((item) => {
    if (publishJobStatusFilter !== 'all' && item.status !== publishJobStatusFilter) {
      return false
    }

    if (!publishJobsKeywordNormalized) {
      return true
    }

    const searchTarget = [
      item.id,
      item.status,
      item.error_message,
      item.payload?.package_name,
      item.payload?.repository_url,
      item.result?.repositoryUrl,
      item.result?.githubRepo?.full_name,
      item.result?.githubRepo?.html_url,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchTarget.includes(publishJobsKeywordNormalized)
  })

  return (
    <div className="admin-section">
      <div className="admin-toolbar">
        <Button onClick={openGlobalPublishJobsModal}>
          全局发布任务
        </Button>
        <Button onClick={loadAgents}>
          刷新列表
        </Button>
        <span className="admin-toolbar-meta">
          当前待审核: {pagination.total}
        </span>
      </div>

      {selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          <span>已选择 {selectedRowKeys.length} 项</span>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => handleBatchAction('approve')}
            loading={batchLoading}
          >
            批量批准
          </Button>
          <Button
            danger
            icon={<CloseOutlined />}
            onClick={() => handleBatchAction('reject')}
            loading={batchLoading}
          >
            批量拒绝
          </Button>
        </Space>
      )}

      <Table
        columns={columns}
        dataSource={agents}
        loading={loading}
        rowKey="id"
        locale={{
          emptyText: (
            <Empty
              description="暂无待审核 Agent"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        rowSelection={rowSelection}
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => {
            setPagination(prev => ({ ...prev, current: page, pageSize }))
          }
        }}
      />

      <Modal
        title="Agent 详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedAgent && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="名称" span={2}>
              {selectedAgent.name}
            </Descriptions.Item>
            <Descriptions.Item label="版本">
              {selectedAgent.version}
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {selectedAgent.author_name}
            </Descriptions.Item>
            <Descriptions.Item label="分类">
              {selectedAgent.category}
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {selectedAgent.description}
            </Descriptions.Item>
            <Descriptions.Item label="标签" span={2}>
              {selectedAgent.tags?.map(tag => (
                <Tag key={tag} color="blue">{tag}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="Manifest" span={2}>
              <pre style={{ maxHeight: 300, overflow: 'auto', background: 'var(--surface-muted)', padding: 10, borderRadius: 8 }}>
                {JSON.stringify(selectedAgent.manifest, null, 2)}
              </pre>
            </Descriptions.Item>
            <Descriptions.Item label="自动审核结果" span={2}>
              <pre style={{ maxHeight: 220, overflow: 'auto', background: 'var(--surface-muted)', padding: 10, borderRadius: 8 }}>
                {JSON.stringify(selectedAgent.auto_review_result || {}, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="拒绝 Agent"
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        onOk={handleRejectConfirm}
        okText="确认拒绝"
        okType="danger"
        confirmLoading={actionLoading[rejectingId]}
      >
        <p>确定要拒绝这个 Agent 吗？</p>
        <TextArea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="请输入拒绝原因（可选）"
          rows={3}
        />
      </Modal>

      <Modal
        title="发布 Agent"
        open={publishModalVisible}
        onCancel={() => setPublishModalVisible(false)}
        onOk={handlePublishConfirm}
        okText="确认发布"
        confirmLoading={publishLoading}
      >
        <Form form={publishForm} layout="vertical">
          <Form.Item
            label="发布模式"
            name="publish_mode"
            rules={[{ required: true, message: '请选择发布模式' }]}
          >
            <Select>
              <Option value="open">公开分发</Option>
              <Option value="commercial">商业分发</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="发布渠道"
            name="package_registry"
            rules={[{ required: true, message: '请选择发布渠道' }]}
          >
            <Select>
              <Option value="none">暂未接入</Option>
              <Option value="npm-public">npm public</Option>
              <Option value="npm-private">npm private</Option>
              <Option value="github-packages">GitHub Packages</Option>
              <Option value="custom">自定义</Option>
            </Select>
          </Form.Item>
          <Form.Item label="包名" name="package_name">
            <Input placeholder="例如 @your-org/agent-name" />
          </Form.Item>
          <Form.Item label="仓库地址" name="repository_url">
            <Input placeholder="例如 https://github.com/xxx/xxx" />
          </Form.Item>
          <Form.Item label="安装提示" name="install_hint">
            <TextArea rows={3} placeholder="可选：给用户的安装说明" />
          </Form.Item>
          <Form.Item label="自动创建 GitHub 仓库" name="github_auto_create" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item label="GitHub 组织/用户（可选）" name="github_owner">
            <Input placeholder="例如 clewopen-org（为空则使用 token 默认账户）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="全局发布任务"
        open={globalPublishJobsVisible}
        onCancel={() => setGlobalPublishJobsVisible(false)}
        footer={null}
        width={1100}
      >
        <Space style={{ marginBottom: 10 }} wrap>
          <Tag color={globalHealthMeta.color}>
            健康度: {globalHealthMeta.label}
          </Tag>
          <Tag color="blue">总任务: {globalPublishSummary?.totals?.total ?? '-'}</Tag>
          <Tag color="processing">排队: {globalPublishSummary?.totals?.queued ?? '-'}</Tag>
          <Tag color="cyan">运行中: {globalPublishSummary?.totals?.running ?? '-'}</Tag>
          <Tag color="green">成功: {globalPublishSummary?.totals?.succeeded ?? '-'}</Tag>
          <Tag color="red">失败: {globalPublishSummary?.totals?.failed ?? '-'}</Tag>
          <Tag color="gold">
            窗口失败: {recentFailedCount}
          </Tag>
          <Tag color="default">
            统计窗口: 最近 {globalPublishSummary?.windowHours ?? globalPublishRecentHours} 小时
          </Tag>
          <Button
            size="small"
            loading={globalPublishSummaryLoading}
            onClick={() => loadGlobalPublishSummary()}
          >
            刷新统计
          </Button>
        </Space>
        {(globalPublishSummary?.recentFailedAgents || []).length > 0 && (
          <Space style={{ marginBottom: 12 }} wrap>
            <span style={{ color: 'var(--ink-muted)' }}>最近失败较多 Agent:</span>
            {globalPublishSummary.recentFailedAgents.map((item) => (
              <Tag
                key={item.agent_id}
                color="volcano"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setGlobalPublishJobKeyword(item.agent_name || '')
                  loadGlobalPublishJobs({
                    page: 1,
                    keyword: item.agent_name || '',
                    status: 'failed',
                  })
                }}
              >
                {item.agent_name} ({item.failed_count})
              </Tag>
            ))}
          </Space>
        )}
        <Space style={{ marginBottom: 12 }} wrap>
          <Switch
            checked={globalPublishAutoRefresh}
            checkedChildren="自动刷新"
            unCheckedChildren="手动"
            onChange={setGlobalPublishAutoRefresh}
          />
          <Select
            style={{ width: 180 }}
            value={globalPublishJobStatusFilter}
            onChange={(value) => {
              setGlobalPublishJobStatusFilter(value)
              loadGlobalPublishJobs({ page: 1, status: value })
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
            style={{ width: 300 }}
            allowClear
            placeholder="搜索任务ID/Agent/错误/仓库/包名"
            value={globalPublishJobKeyword}
            onChange={(event) => setGlobalPublishJobKeyword(event.target.value)}
            onPressEnter={() => loadGlobalPublishJobs({ page: 1, keyword: globalPublishJobKeyword })}
          />
          <Select
            style={{ width: 160 }}
            value={globalPublishRecentHours}
            onChange={(value) => {
              setGlobalPublishRecentHours(value)
              loadGlobalPublishJobs({ page: 1, recentHours: value })
              loadGlobalPublishSummary({ recentHours: value })
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
            value={globalFailureThreshold}
            onChange={setGlobalFailureThreshold}
            options={[
              { value: 1, label: '阈值 1' },
              { value: 3, label: '阈值 3' },
              { value: 5, label: '阈值 5' },
              { value: 10, label: '阈值 10' },
            ]}
          />
          <Switch
            checked={globalPublishAnomalyOnly}
            checkedChildren="仅异常"
            unCheckedChildren="全部"
            onChange={(value) => {
              setGlobalPublishAnomalyOnly(value)
              loadGlobalPublishJobs({ page: 1, anomalyOnly: value })
            }}
          />
          <Button onClick={() => loadGlobalPublishJobs({ page: 1, keyword: globalPublishJobKeyword })}>
            搜索
          </Button>
          <Button onClick={() => loadGlobalPublishJobs()}>
            刷新
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={globalPublishJobsLoading}
          dataSource={globalPublishJobs}
          columns={[
            {
              title: '任务ID',
              dataIndex: 'id',
              key: 'id',
              width: 260,
            },
            {
              title: 'Agent',
              key: 'agent',
              width: 260,
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <span>{record.agent_name || record.agent_slug || record.agent_id}</span>
                  <Button
                    size="small"
                    type="link"
                    style={{ padding: 0 }}
                    onClick={() => openPublishJobsModal({
                      id: record.agent_id,
                      name: record.agent_name || record.agent_slug || record.agent_id,
                    })}
                  >
                    查看该 Agent 全部任务
                  </Button>
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 120,
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
              width: 220,
              render: (_, record) => {
                const repositoryUrl = record?.result?.repositoryUrl
                if (!repositoryUrl) return '-'
                return (
                  <Space>
                    <a href={repositoryUrl} target="_blank" rel="noreferrer">
                      仓库链接
                    </a>
                    <Button size="small" type="link" onClick={() => handleCopyRepositoryUrl(record)}>
                      复制
                    </Button>
                  </Space>
                )
              },
            },
            {
              title: '操作',
              key: 'actions',
              width: 120,
              render: (_, record) => (
                <Button
                  size="small"
                  onClick={() => handleRetryPublishJob(record)}
                  disabled={record.status !== 'failed'}
                  loading={actionLoading[`retry-${record.id}`]}
                >
                  重试
                </Button>
              ),
            }
          ]}
          pagination={{
            ...globalPublishJobsPagination,
            onChange: (page, pageSize) => {
              loadGlobalPublishJobs({ page, pageSize })
            },
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
      </Modal>

      <Modal
        title={`发布任务${publishJobsAgent?.name ? ` · ${publishJobsAgent.name}` : ''}`}
        open={publishJobsVisible}
        onCancel={() => setPublishJobsVisible(false)}
        footer={null}
        width={960}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            style={{ width: 180 }}
            value={publishJobStatusFilter}
            onChange={setPublishJobStatusFilter}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'queued', label: '排队中' },
              { value: 'running', label: '执行中' },
              { value: 'succeeded', label: '成功' },
              { value: 'failed', label: '失败' },
            ]}
          />
          <Input
            style={{ width: 260 }}
            allowClear
            placeholder="搜索任务ID/错误/仓库/包名"
            value={publishJobKeyword}
            onChange={(event) => setPublishJobKeyword(event.target.value)}
          />
        </Space>
        <Table
          rowKey="id"
          loading={publishJobsLoading}
          dataSource={filteredPublishJobs}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            {
              title: '任务ID',
              dataIndex: 'id',
              key: 'id',
              width: 250,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 120,
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
              title: '入队时间',
              dataIndex: 'queued_at',
              key: 'queued_at',
              width: 180,
              render: (value) => value ? new Date(value).toLocaleString() : '-',
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
              width: 240,
              render: (_, record) => {
                const repositoryUrl = record?.result?.repositoryUrl
                if (repositoryUrl) {
                  return (
                    <Space>
                      <a href={repositoryUrl} target="_blank" rel="noreferrer">
                        仓库链接
                      </a>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => handleCopyRepositoryUrl(record)}
                      >
                        复制
                      </Button>
                    </Space>
                  )
                }
                return record?.status === 'failed' ? '失败，无结果' : '-'
              },
            },
            {
              title: '操作',
              key: 'actions',
              width: 120,
              render: (_, record) => (
                <Button
                  size="small"
                  onClick={() => handleRetryPublishJob(record)}
                  disabled={record.status !== 'failed'}
                  loading={actionLoading[`retry-${record.id}`]}
                >
                  重试
                </Button>
              ),
            }
          ]}
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
        <div style={{ marginTop: 8 }}>
          <Space>
            <Switch
              checked={publishJobsAutoRefresh}
              onChange={setPublishJobsAutoRefresh}
              checkedChildren="自动刷新"
              unCheckedChildren="手动"
            />
            <Button
              size="small"
              onClick={() => publishJobsAgent?.id && loadPublishJobs(publishJobsAgent.id)}
              loading={publishJobsLoading}
            >
              立即刷新
            </Button>
          </Space>
        </div>
      </Modal>

      {publishJobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Tag color={publishJobs[0].status === 'succeeded' ? 'green' : publishJobs[0].status === 'failed' ? 'red' : 'processing'}>
            最近发布任务: {publishJobs[0].status}
          </Tag>
          {publishJobs[0].error_message && (
            <span style={{ color: 'var(--status-danger)', marginLeft: 8 }}>{publishJobs[0].error_message}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentReview
