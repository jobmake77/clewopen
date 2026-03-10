import { useState, useEffect } from 'react'
import { Table, Button, Tag, Modal, message, Space, Descriptions } from 'antd'
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons'
import { getPendingAgents, approveAgent, rejectAgent } from '../../services/adminService'

function AgentReview() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)

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

  const handleApprove = async (id) => {
    try {
      const response = await approveAgent(id)
      if (response.success) {
        message.success('批准成功')
        loadAgents()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '批准失败')
    }
  }

  const handleReject = async (id) => {
    Modal.confirm({
      title: '拒绝 Agent',
      content: (
        <div>
          <p>确定要拒绝这个 Agent 吗？</p>
          <textarea
            id="reject-reason"
            placeholder="请输入拒绝原因（可选）"
            style={{ width: '100%', marginTop: 10, padding: 8 }}
            rows={3}
          />
        </div>
      ),
      onOk: async () => {
        const reason = document.getElementById('reject-reason')?.value
        try {
          const response = await rejectAgent(id, reason)
          if (response.success) {
            message.success('已拒绝')
            loadAgents()
          }
        } catch (error) {
          message.error(error.response?.data?.error?.message || '拒绝失败')
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
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleReject(record.id)}
          >
            拒绝
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Table
        columns={columns}
        dataSource={agents}
        loading={loading}
        rowKey="id"
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
            <Descriptions.Item label="价格">
              {selectedAgent.price_type === 'free' ? '免费' : `¥${selectedAgent.price_amount}`}
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
    </div>
  )
}

export default AgentReview

