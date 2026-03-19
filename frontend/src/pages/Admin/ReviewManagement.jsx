import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Tag, Modal, message, Space, Rate, Input } from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { getAllReviews, approveReview, rejectReview, deleteReview } from '../../services/adminService'

const { TextArea } = Input

function ReviewManagement() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState({})
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getAllReviews({
        page: currentPage,
        pageSize: currentPageSize,
        status: 'pending'
      })
      if (response.success) {
        setReviews(response.data.reviews)
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
    loadReviews()
  }, [loadReviews])

  const handleApprove = (id) => {
    Modal.confirm({
      title: '确认批准',
      icon: <ExclamationCircleOutlined />,
      content: '确定要批准这条评价吗？',
      onOk: async () => {
        setActionLoading(prev => ({ ...prev, [id]: true }))
        try {
          const response = await approveReview(id)
          if (response.success) {
            message.success('批准成功')
            loadReviews()
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
      const response = await rejectReview(rejectingId, rejectReason)
      if (response.success) {
        message.success('已拒绝')
        setRejectModalVisible(false)
        loadReviews()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '拒绝失败')
    } finally {
      setActionLoading(prev => ({ ...prev, [rejectingId]: false }))
    }
  }

  const handleDelete = (id) => {
    Modal.confirm({
      title: '删除评价',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除这条评价吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        setActionLoading(prev => ({ ...prev, [id]: true }))
        try {
          const response = await deleteReview(id)
          if (response.success) {
            message.success('删除成功')
            loadReviews()
          }
        } catch (error) {
          message.error(error.response?.data?.error?.message || '删除失败')
        } finally {
          setActionLoading(prev => ({ ...prev, [id]: false }))
        }
      }
    })
  }

  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120
    },
    {
      title: '类型',
      dataIndex: 'resource_type',
      key: 'resource_type',
      width: 80,
      render: (type) => {
        const labelMap = { agent: 'Agent', skill: 'Skill', mcp: 'MCP' }
        return <Tag>{labelMap[type] || type}</Tag>
      }
    },
    {
      title: '评分',
      dataIndex: 'rating',
      key: 'rating',
      width: 150,
      render: (rating) => <Rate disabled value={rating} />
    },
    {
      title: '评论内容',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const colorMap = {
          pending: 'orange',
          approved: 'green',
          rejected: 'red'
        }
        const textMap = {
          pending: '待审核',
          approved: '已批准',
          rejected: '已拒绝'
        }
        return <Tag color={colorMap[status]}>{textMap[status]}</Tag>
      }
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
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleApprove(record.id)}
            disabled={record.status === 'approved'}
            loading={actionLoading[record.id]}
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleRejectClick(record.id)}
            disabled={record.status === 'rejected'}
            loading={actionLoading[record.id]}
          >
            拒绝
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
            loading={actionLoading[record.id]}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div className="admin-section">
      <Table
        columns={columns}
        dataSource={reviews}
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
        title="拒绝评价"
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        onOk={handleRejectConfirm}
        okText="确认拒绝"
        okType="danger"
        confirmLoading={actionLoading[rejectingId]}
      >
        <p>确定要拒绝这条评价吗？</p>
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

export default ReviewManagement
