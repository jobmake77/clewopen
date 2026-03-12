import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Card, Button, Tag, Rate, Divider, Spin, Tabs, Modal, Form, Input, message } from 'antd'
import { DownloadOutlined, StarOutlined } from '@ant-design/icons'
import { fetchMcpDetail } from '../../store/slices/mcpSlice'
import api from '../../services/api'

const { TextArea } = Input

function McpDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { currentMcp: current, loading } = useSelector((state) => state.mcp)
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [reviews, setReviews] = useState([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [rateModalVisible, setRateModalVisible] = useState(false)
  const [submittingRate, setSubmittingRate] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    dispatch(fetchMcpDetail(id))
    loadReviews()
  }, [dispatch, id])

  const loadReviews = async () => {
    setLoadingReviews(true)
    try {
      const response = await api.get(`/mcps/${id}/reviews`)
      if (response.success) setReviews(response.data)
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
    setDownloading(true)
    try {
      const response = await api.post(`/mcps/${id}/download`, {}, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${current.name}-${current.version}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      message.success('下载成功')
      dispatch(fetchMcpDetail(id))
    } catch (error) {
      message.error(error.response?.data?.error || '下载失败')
    } finally {
      setDownloading(false)
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
      const response = await api.post(`/mcps/${id}/rate`, values)
      if (response.success) {
        message.success('评价成功')
        setRateModalVisible(false)
        form.resetFields()
        loadReviews()
        dispatch(fetchMcpDetail(id))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '评价失败')
    } finally {
      setSubmittingRate(false)
    }
  }

  if (loading || !current) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  const tabItems = [
    {
      key: 'overview',
      label: '概述',
      children: (
        <div>
          <h3>功能描述</h3>
          <p>{current.description}</p>
          <h3>使用方式</h3>
          <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
            {`# 在 Agent 的 manifest.json 中声明依赖\n"dependencies": {\n  "mcps": ["${current.name}"]\n}`}
          </pre>
        </div>
      ),
    },
    {
      key: 'reviews',
      label: `评价 (${reviews.length})`,
      children: (
        <div>
          <Button type="primary" onClick={handleRate} style={{ marginBottom: 16 }}>写评价</Button>
          {loadingReviews ? <Spin /> : reviews.length > 0 ? reviews.map((review) => (
            <Card key={review.id} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>{review.username}</strong>
                <Rate disabled value={review.rating} style={{ marginLeft: 16, fontSize: 14 }} />
              </div>
              <p>{review.comment}</p>
              <p style={{ color: '#999', fontSize: 12 }}>{new Date(review.created_at).toLocaleDateString()}</p>
            </Card>
          )) : <p>暂无评价</p>}
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
              <h1>{current.name}</h1>
              <div style={{ marginBottom: 16 }}>
                {current.tags?.map((tag) => <Tag key={tag} color="magenta">{tag}</Tag>)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span><Rate disabled defaultValue={current.rating_average || 0} /> ({current.reviews_count || 0} 评价)</span>
                <span><DownloadOutlined /> {current.downloads_count || 0} 下载</span>
              </div>
            </div>
            <Divider />
            <Tabs items={tabItems} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: '100%', height: 200, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, marginBottom: 16 }}>
                M
              </div>
            </div>
            <Button type="primary" size="large" block icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={handleDownload} loading={downloading}>
              下载 MCP
            </Button>
            <Button size="large" block icon={<StarOutlined />} onClick={handleRate}>写评价</Button>
            <Divider />
            <div>
              <h4>MCP 信息</h4>
              <p><strong>版本:</strong> {current.version}</p>
              <p><strong>作者:</strong> {current.author_name}</p>
              <p><strong>分类:</strong> {current.category}</p>
              <p><strong>更新时间:</strong> {current.updated_at ? new Date(current.updated_at).toLocaleDateString() : '-'}</p>
            </div>
          </Card>
        </Col>
      </Row>

      <Modal title="评价 MCP" open={rateModalVisible} onCancel={() => setRateModalVisible(false)} footer={null}>
        <Form form={form} onFinish={handleSubmitRate} layout="vertical">
          <Form.Item name="rating" label="评分" rules={[{ required: true, message: '请选择评分' }]}>
            <Rate />
          </Form.Item>
          <Form.Item name="comment" label="评价内容" rules={[{ required: true, message: '请输入评价内容' }, { min: 10, message: '评价内容至少 10 个字符' }]}>
            <TextArea rows={4} placeholder="分享你的使用体验..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submittingRate} block>提交评价</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default McpDetail
