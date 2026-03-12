import { useState, useEffect } from 'react'
import { Table, Button, Tag, Modal, message, Space, Descriptions, Input } from 'antd'
import { CheckOutlined, CloseOutlined, EyeOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { getPendingAgents, approveAgent, rejectAgent, batchAgentAction } from '../../services/adminService'

const { TextArea } = Input

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

  useEffect(() => {
    loadAgents()
  }, [pagination.current, pagination.pageSize])

  const loadAgents = async () => {
    setLoading(true)
    try {
      const response = await getPendingAgents({
        page: pagination.current,
        pageSize: pagination.pageSize
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
  }

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
      title: '操作',
      key: 'action',
      width: 200,
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
        </Space>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys
  }

  return (
    <div>
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
              <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 10 }}>
                {JSON.stringify(selectedAgent.manifest, null, 2)}
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
    </div>
  )
}

export default AgentReview
