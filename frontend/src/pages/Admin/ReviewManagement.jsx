import { useState, useEffect } from 'react'
import { Table, Button, Tag, Modal, message, Space, Rate } from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons'
import { getAllReviews, approveReview, rejectReview, deleteReview } from '../../services/adminService'

function ReviewManagement() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })

  useEffect(() => {
    loadReviews()
  }, [pagination.current, pagination.pageSize])

  const loadReviews = async () => {
    setLoading(true)
    try {
      const response = await getAllReviews({
        page: pagination.current,
        pageSize: pagination.pageSize,
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
  }

  const handleApprove = async (id) => {
    try {
      const response = await approveReview(id)
      if (response.success) {
        message.success('批准成功')
        loadReviews()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '批准失败')
    }
  }

  const handleReject = async (id) => {
    Modal.confirm({
      title: '拒绝评价',
      content: (
        <div>
          <p>确定要拒绝这条评价吗？</p>
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
          const response = await rejectReview(id, reason)
          if (response.success) {
            message.success('已拒绝')
            loadReviews()
          }
        } catch (error) {
          message.error(error.response?.data?.error?.message || '拒绝失败')
        }
      }
    })
  }

  const handleDelete = async (id) => {
    Modal.confirm({
      title: '删除评价',
      content: '确定要删除这条评价吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await deleteReview(id)
          if (response.success) {
            message.success('删除成功')
            loadReviews()
          }
        } catch (error) {
          message.error(error.response?.data?.error?.message || '删除失败')
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
      title: 'Agent',
      dataIndex: 'agent_name',
      key: 'agent_name',
      width: 150
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
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleReject(record.id)}
            disabled={record.status === 'rejected'}
          >
            拒绝
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
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
    </div>
  )
}

export default ReviewManagement
