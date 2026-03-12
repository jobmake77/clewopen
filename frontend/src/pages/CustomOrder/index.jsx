import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Form, Input, InputNumber, Select, DatePicker, Row, Col, Tag, List, Spin, Modal, message, Empty } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getCustomOrders, createCustomOrder } from '../../services/customOrderService'

const { TextArea } = Input
const { Option } = Select

const orderCategories = [
  { value: 'agent', label: 'Agent 开发' },
  { value: 'skill', label: 'Skill 开发' },
  { value: 'mcp', label: 'MCP 开发' },
  { value: 'integration', label: '集成对接' },
  { value: 'other', label: '其他' },
]

const statusMap = {
  open: { color: 'blue', text: '招标中' },
  in_progress: { color: 'orange', text: '进行中' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'default', text: '已取消' },
}

function CustomOrder() {
  const navigate = useNavigate()
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [form] = Form.useForm()

  useEffect(() => {
    loadOrders()
  }, [pagination.current])

  const loadOrders = async () => {
    setLoading(true)
    try {
      const response = await getCustomOrders({
        page: pagination.current,
        pageSize: pagination.pageSize,
      })
      if (response.success) {
        setOrders(response.data.orders)
        setPagination(prev => ({ ...prev, total: response.data.total }))
      }
    } catch (error) {
      console.error('Failed to load orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    setCreateModalVisible(true)
  }

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      const data = {
        title: values.title,
        description: values.description,
        budget_min: values.budget_min || null,
        budget_max: values.budget_max || null,
        deadline: values.deadline ? values.deadline.toISOString() : null,
        category: values.category || null,
      }

      const response = await createCustomOrder(data)
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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1>定制开发</h1>
          <p style={{ color: '#666' }}>发布您的定制需求，专业开发者将为您提供服务</p>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleCreate}>
          发布需求
        </Button>
      </div>

      <Spin spinning={loading}>
        {orders.length > 0 ? (
          <List
            dataSource={orders}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: (page) => setPagination(prev => ({ ...prev, current: page })),
            }}
            renderItem={(order) => (
              <Card style={{ marginBottom: 16 }} hoverable>
                <Row justify="space-between" align="top">
                  <Col span={18}>
                    <h3 style={{ marginBottom: 8 }}>{order.title}</h3>
                    <p style={{ color: '#666', marginBottom: 12 }}>{order.description}</p>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <Tag color={statusMap[order.status]?.color}>{statusMap[order.status]?.text}</Tag>
                      {order.category && <Tag>{orderCategories.find(c => c.value === order.category)?.label || order.category}</Tag>}
                      {(order.budget_min || order.budget_max) && (
                        <span style={{ color: '#f5222d', fontWeight: 'bold' }}>
                          预算: ¥{order.budget_min || 0} - ¥{order.budget_max || '不限'}
                        </span>
                      )}
                      {order.deadline && (
                        <span style={{ color: '#999' }}>
                          截止: {new Date(order.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Col>
                  <Col>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#999', fontSize: 12 }}>
                        {order.user_name} 发布于 {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Col>
                </Row>
              </Card>
            )}
          />
        ) : (
          <Card>
            <Empty description="暂无定制需求" />
          </Card>
        )}
      </Spin>

      <Modal
        title="发布定制需求"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="需求标题" name="title" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input placeholder="简要描述您的需求" />
          </Form.Item>

          <Form.Item label="需求描述" name="description" rules={[{ required: true, message: '请输入需求描述' }, { min: 20, message: '描述至少 20 个字符' }]}>
            <TextArea rows={6} placeholder="详细描述您的需求、期望效果、技术要求等" />
          </Form.Item>

          <Form.Item label="分类" name="category">
            <Select placeholder="选择需求分类" allowClear>
              {orderCategories.map(cat => <Option key={cat.value} value={cat.value}>{cat.label}</Option>)}
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

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block size="large">
              发布需求
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CustomOrder
