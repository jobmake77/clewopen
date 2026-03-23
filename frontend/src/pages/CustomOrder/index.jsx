import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { MessageOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { createCustomOrder, getCustomOrders } from '../../services/customOrderService'

const { TextArea } = Input
const { Option } = Select
const { Text } = Typography

const orderCategories = [
  { value: 'agent', label: 'Agent 开发' },
  { value: 'skill', label: 'Skill 开发' },
  { value: 'mcp', label: 'MCP 开发' },
  { value: 'integration', label: '集成对接' },
  { value: 'other', label: '其他' },
]

const statusMap = {
  open: { color: 'blue', text: '招募中' },
  in_progress: { color: 'orange', text: '进行中' },
  awaiting_acceptance: { color: 'purple', text: '待验收' },
  accepted: { color: 'geekblue', text: '已验收' },
  disputed: { color: 'red', text: '争议中' },
  completed: { color: 'green', text: '已完成' },
  closed: { color: 'default', text: '已关闭' },
  cancelled: { color: 'default', text: '已取消' },
}

const sortOptions = [
  { value: 'latest', label: '最新活跃' },
  { value: 'hot', label: '讨论最多' },
  { value: 'budget', label: '预算最高' },
]

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '仅看招募中' },
  { value: 'in_progress', label: '仅看进行中' },
  { value: 'awaiting_acceptance', label: '仅看待验收' },
]

const toDateText = (value, withTime = false) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return withTime ? date.toLocaleString() : date.toLocaleDateString()
}

const getBudgetText = (order) => {
  if (!order.budget_min && !order.budget_max) return '预算未填写'
  return `¥${order.budget_min || 0} - ¥${order.budget_max || '不限'}`
}

const getHeatScore = (order) => {
  const msgCount = Number(order.message_count || order.messages_count || 0)
  const subCount = Number(order.submission_count || order.submissions_count || 0)
  return msgCount * 2 + subCount * 3
}

const getLastActivityTime = (order) => {
  const value = order.last_message_at || order.last_activity_at || order.updated_at || order.created_at
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

const getOrderExcerpt = (text) => {
  if (!text) return ''
  if (text.length <= 140) return text
  return `${text.slice(0, 140)}...`
}

const getLastReplyPreview = (order) => {
  const content = String(order.last_message_content || '').trim()
  if (!content) return null
  const sender = order.last_message_sender_name || '参与者'
  const preview = content.length > 90 ? `${content.slice(0, 90)}...` : content
  return `${sender}：${preview}`
}

function CustomOrder() {
  const navigate = useNavigate()
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 12, total: 0 })
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('latest')
  const [form] = Form.useForm()
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getCustomOrders({
        page: currentPage,
        pageSize: currentPageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sortBy,
      })
      if (response.success) {
        setOrders(response.data.orders || [])
        setPagination((prev) => ({ ...prev, total: response.data.total || 0 }))
      }
    } catch (error) {
      message.error(error.response?.data?.error || '加载定制需求失败')
    } finally {
      setLoading(false)
    }
  }, [currentPage, currentPageSize, sortBy, statusFilter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [sortBy, statusFilter])

  const handleCreate = () => {
    if (!isAuthenticated) {
      message.warning('请先登录后发布需求')
      navigate('/login')
      return
    }
    setCreateModalVisible(true)
  }

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        title: values.title,
        description: values.description,
        budget_min: values.budget_min || null,
        budget_max: values.budget_max || null,
        deadline: values.deadline ? values.deadline.toISOString() : null,
        category: values.category || null,
      }
      const response = await createCustomOrder(payload)
      if (response.success) {
        message.success('需求发布成功')
        setCreateModalVisible(false)
        form.resetFields()
        loadOrders()
      }
    } catch (error) {
      message.error(error.response?.data?.error || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredAndSortedOrders = useMemo(() => {
    const filtered = orders.filter((order) => (statusFilter === 'all' ? true : order.status === statusFilter))
    if (sortBy === 'hot') {
      return [...filtered].sort((a, b) => getHeatScore(b) - getHeatScore(a))
    }
    if (sortBy === 'budget') {
      return [...filtered].sort((a, b) => Number(b.budget_max || b.budget_min || 0) - Number(a.budget_max || a.budget_min || 0))
    }
    return [...filtered].sort((a, b) => getLastActivityTime(b) - getLastActivityTime(a))
  }, [orders, sortBy, statusFilter])

  const featuredOrders = useMemo(
    () => [...filteredAndSortedOrders].sort((a, b) => getHeatScore(b) - getHeatScore(a)).slice(0, 3),
    [filteredAndSortedOrders],
  )

  return (
    <div className="page-shell">
      <div className="custom-thread-header">
        <div>
          <p className="section-label">Custom Development</p>
          <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)', marginBottom: 8 }}>定制开发</h1>
          <p style={{ color: 'var(--ink-muted)', margin: 0 }}>
            像发帖一样发布需求，开发者可在评论区追问细节并提交可试用方案。
          </p>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleCreate}>
          发布需求帖
        </Button>
      </div>

      <Card className="cream-panel custom-thread-hotboard" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
          <Space size={8}>
            <ThunderboltOutlined style={{ color: 'var(--status-warning)' }} />
            <Text strong>热门需求</Text>
          </Space>
          <Text type="secondary">按互动热度排序</Text>
        </div>
        {featuredOrders.length > 0 ? (
          <Row gutter={[12, 12]}>
            {featuredOrders.map((order) => (
              <Col xs={24} md={8} key={order.id}>
                <Card
                  hoverable
                  className="custom-thread-hot-card"
                  onClick={() => navigate(`/custom-order/${order.id}`)}
                  bodyStyle={{ padding: 14 }}
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                      <Text strong style={{ fontSize: 15, lineHeight: 1.3 }}>
                        {order.title}
                      </Text>
                      <Tag color={statusMap[order.status]?.color || 'default'}>{statusMap[order.status]?.text || order.status}</Tag>
                    </div>
                    <Text type="secondary" style={{ minHeight: 40 }}>
                      {getOrderExcerpt(order.description)}
                    </Text>
                    <Space split={<span style={{ color: 'var(--cream-border)' }}>|</span>} wrap>
                      <Text type="secondary">
                        <MessageOutlined /> {Number(order.message_count || order.messages_count || 0)} 条评论
                      </Text>
                      <Text type="secondary">{getBudgetText(order)}</Text>
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热门需求" />
        )}
      </Card>

      <Card className="cream-panel custom-thread-list">
        <div className="custom-thread-toolbar">
          <Space wrap>
            <Select value={statusFilter} options={statusOptions} onChange={setStatusFilter} style={{ width: 160 }} />
            <Select value={sortBy} options={sortOptions} onChange={setSortBy} style={{ width: 160 }} />
          </Space>
          <Text type="secondary">{filteredAndSortedOrders.length} 个需求帖</Text>
        </div>

        <Spin spinning={loading}>
          {filteredAndSortedOrders.length > 0 ? (
            <List
              dataSource={filteredAndSortedOrders}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                onChange: (page) => setPagination((prev) => ({ ...prev, current: page })),
              }}
              renderItem={(order) => (
                <List.Item className="custom-thread-list-item" onClick={() => navigate(`/custom-order/${order.id}`)}>
                  <div style={{ width: '100%' }}>
                    <div className="custom-thread-title-row">
                      <Space wrap size={8}>
                        <Tag color={statusMap[order.status]?.color || 'default'}>{statusMap[order.status]?.text || order.status}</Tag>
                        {order.category && (
                          <Tag>{orderCategories.find((item) => item.value === order.category)?.label || order.category}</Tag>
                        )}
                      </Space>
                      <Text type="secondary">活跃于 {toDateText(order.last_message_at || order.last_activity_at || order.updated_at || order.created_at, true)}</Text>
                    </div>

                    <h3 className="custom-thread-title">{order.title}</h3>
                    <p className="custom-thread-excerpt">{getOrderExcerpt(order.description)}</p>
                    {getLastReplyPreview(order) && (
                      <p className="custom-thread-last-reply">
                        最新回复 · {getLastReplyPreview(order)}
                      </p>
                    )}

                    <div className="custom-thread-meta">
                      <Space split={<span style={{ color: 'var(--cream-border)' }}>|</span>} wrap>
                        <Text type="secondary">发布者：{order.user_name || '匿名用户'}</Text>
                        <Text type="secondary">发布：{toDateText(order.created_at, true)}</Text>
                        <Text type="secondary">{getBudgetText(order)}</Text>
                        <Text type="secondary">截止：{toDateText(order.deadline)}</Text>
                      </Space>
                      <Space>
                        <Text type="secondary">
                          <MessageOutlined /> {Number(order.message_count || order.messages_count || 0)}
                        </Text>
                        <Text type="secondary">方案 {Number(order.submission_count || order.submissions_count || 0)}</Text>
                      </Space>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无符合筛选条件的需求帖" />
          )}
        </Spin>
      </Card>

      <Modal
        title="发布定制需求帖"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="需求标题" name="title" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input placeholder="例如：帮我做一个短视频脚本自动化 Agent" />
          </Form.Item>
          <Form.Item
            label="需求描述"
            name="description"
            rules={[{ required: true, message: '请输入需求描述' }, { min: 20, message: '描述至少 20 个字符' }]}
          >
            <TextArea rows={6} placeholder="把业务背景、预期结果、交付边界写清楚，方便开发者直接跟进。" />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Select placeholder="选择需求分类" allowClear>
              {orderCategories.map((cat) => (
                <Option key={cat.value} value={cat.value}>
                  {cat.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="最低预算（元）" name="budget_min">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="最低预算" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="最高预算（元）" name="budget_max">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="最高预算" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="截止日期" name="deadline">
            <DatePicker style={{ width: '100%' }} placeholder="选择截止日期" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={submitting} block size="large">
              发布需求帖
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CustomOrder
