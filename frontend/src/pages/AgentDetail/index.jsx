import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Card, Button, Tag, Rate, Divider, Spin, Tabs, Modal, Form, Input, message } from 'antd'
import { DownloadOutlined, StarOutlined } from '@ant-design/icons'
import { fetchAgentDetail } from '../../store/slices/agentSlice'
import api from '../../services/api'

const { TextArea } = Input

function AgentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { currentAgent, loading } = useSelector((state) => state.agent)
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [reviews, setReviews] = useState([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [rateModalVisible, setRateModalVisible] = useState(false)
  const [submittingRate, setSubmittingRate] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    dispatch(fetchAgentDetail(id))
    loadReviews()
  }, [dispatch, id])

  const loadReviews = async () => {
    setLoadingReviews(true)
    try {
      const response = await api.get(`/agents/${id}/reviews`)
      if (response.success) {
        setReviews(response.data)
      }
    } catch (error) {
      console.error('Failed to load reviews:', error)
    } finally {
      setLoadingReviews(false)
    }
  }

  const handleDownload = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }

    try {
      const response = await api.post(`/agents/${id}/download`, {}, {
        responseType: 'blob'
      })

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response]))
      const link = document.createElement('a')
      link.href = url

      // 从响应头获取文件名，如果没有则使用默认名称
      const contentDisposition = response.headers?.['content-disposition']
      let filename = `${currentAgent.name}-${currentAgent.version}.zip`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      message.success('下载成功')
      // 刷新 Agent 信息以更新下载数
      dispatch(fetchAgentDetail(id))
    } catch (error) {
      message.error(error.response?.data?.error || '下载失败')
    }
  }

  const handleRate = () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    setRateModalVisible(true)
  }

  const handleSubmitRate = async (values) => {
    setSubmittingRate(true)
    try {
      const response = await api.post(`/agents/${id}/rate`, values)
      if (response.success) {
        message.success('评价成功')
        setRateModalVisible(false)
        form.resetFields()
        // 刷新评论列表和 Agent 信息
        loadReviews()
        dispatch(fetchAgentDetail(id))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || error.response?.data?.error || '评价失败')
    } finally {
      setSubmittingRate(false)
    }
  }

  if (loading || !currentAgent) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'overview',
      label: '概述',
      children: (
        <div>
          <h3>功能描述</h3>
          <p>{currentAgent.description}</p>

          <h3>核心能力</h3>
          <ul>
            <li>专业的内容生成</li>
            <li>多风格支持</li>
            <li>智能优化</li>
          </ul>

          <h3>适用场景</h3>
          <p>适合需要快速生成高质量内容的用户</p>
        </div>
      ),
    },
    {
      key: 'usage',
      label: '使用说明',
      children: (
        <div>
          <h3>安装</h3>
          <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
            {`# 下载 Agent 包\nclewopen download ${currentAgent.name}\n\n# 安装到本地\nclewopen install ${currentAgent.name}`}
          </pre>

          <h3>基本用法</h3>
          <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
            {`# 运行 Agent\nclewopen run ${currentAgent.name} --input "your input"`}
          </pre>
        </div>
      ),
    },
    {
      key: 'reviews',
      label: `评价 (${reviews.length})`,
      children: (
        <div>
          <Button type="primary" onClick={handleRate} style={{ marginBottom: 16 }}>
            写评价
          </Button>

          {loadingReviews ? (
            <Spin />
          ) : reviews.length > 0 ? (
            reviews.map((review) => (
              <Card key={review.id} style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>{review.username}</strong>
                  <Rate disabled value={review.rating} style={{ marginLeft: 16, fontSize: 14 }} />
                </div>
                <p>{review.comment}</p>
                <p style={{ color: '#999', fontSize: 12 }}>
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </Card>
            ))
          ) : (
            <p>暂无评价</p>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Row gutter={24}>
        <Col span={16}>
          <Card>
            <div style={{ marginBottom: 24 }}>
              <h1>{currentAgent.name}</h1>
              <div style={{ marginBottom: 16 }}>
                {currentAgent.tags?.map((tag) => (
                  <Tag key={tag} color="blue">
                    {tag}
                  </Tag>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span>
                  <Rate disabled defaultValue={currentAgent.rating || 0} />
                  {' '}({currentAgent.reviews_count || 0} 评价)
                </span>
                <span>
                  <DownloadOutlined />
                  {' '}{currentAgent.downloads || 0} 下载
                </span>
              </div>
            </div>

            <Divider />

            <Tabs items={tabItems} />
          </Card>
        </Col>

        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: '100%',
                  height: 200,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 80,
                  marginBottom: 16,
                }}
              >
                🤖
              </div>
              <h2 style={{ color: '#f5222d', marginBottom: 8 }}>
                ¥{currentAgent.price?.amount || 0}
              </h2>
              <p style={{ color: '#666' }}>
                {currentAgent.price?.billing_period === 'monthly' ? '每月' : '每年'}
              </p>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={<DownloadOutlined />}
              style={{ marginBottom: 12 }}
              onClick={handleDownload}
            >
              下载 Agent
            </Button>

            <Button
              size="large"
              block
              icon={<StarOutlined />}
              onClick={handleRate}
            >
              写评价
            </Button>

            <Divider />

            <div>
              <h4>Agent 信息</h4>
              <p>
                <strong>版本:</strong> {currentAgent.version}
              </p>
              <p>
                <strong>作者:</strong> {currentAgent.author}
              </p>
              <p>
                <strong>分类:</strong> {currentAgent.category}
              </p>
              <p>
                <strong>更新时间:</strong> {currentAgent.metadata?.updated_at}
              </p>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 评价弹窗 */}
      <Modal
        title="评价 Agent"
        open={rateModalVisible}
        onCancel={() => setRateModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          onFinish={handleSubmitRate}
          layout="vertical"
        >
          <Form.Item
            name="rating"
            label="评分"
            rules={[{ required: true, message: '请选择评分' }]}
          >
            <Rate />
          </Form.Item>

          <Form.Item
            name="comment"
            label="评价内容"
            rules={[
              { required: true, message: '请输入评价内容' },
              { min: 10, message: '评价内容至少 10 个字符' }
            ]}
          >
            <TextArea rows={4} placeholder="分享你的使用体验..." />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submittingRate} block>
              提交评价
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AgentDetail
