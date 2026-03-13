import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Card, Button, Tag, Rate, Divider, Spin, Tabs, Modal, Form, Input, Collapse, message } from 'antd'
import { DownloadOutlined, StarOutlined, FileTextOutlined, LinkOutlined, PlayCircleOutlined, SendOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { fetchAgentDetail } from '../../store/slices/agentSlice'
import api from '../../services/api'
import {
  createTrialSession,
  endTrialSession,
  getTrialHistory,
  getTrialSession,
  sendTrialSessionMessage,
} from '../../services/trialService'

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
  const [downloading, setDownloading] = useState(false)
  const [form] = Form.useForm()

  // Trial sandbox state
  const [trialVisible, setTrialVisible] = useState(false)
  const [trialMessages, setTrialMessages] = useState([])
  const [trialInput, setTrialInput] = useState('')
  const [trialSending, setTrialSending] = useState(false)
  const [remainingTrials, setRemainingTrials] = useState(3)
  const [trialLoaded, setTrialLoaded] = useState(false)
  const [trialSessionId, setTrialSessionId] = useState(null)
  const [trialSessionStatus, setTrialSessionStatus] = useState(null)

  // Preview state
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)

  // Dependencies state
  const [dependencies, setDependencies] = useState(null)
  const [loadingDeps, setLoadingDeps] = useState(false)
  const [depsLoaded, setDepsLoaded] = useState(false)

  useEffect(() => {
    dispatch(fetchAgentDetail(id))
    loadReviews()
    setPreviewLoaded(false)
    setDepsLoaded(false)
    setPreview(null)
    setDependencies(null)
    setTrialMessages([])
    setTrialInput('')
    setRemainingTrials(3)
    setTrialLoaded(false)
    setTrialSessionId(null)
    setTrialSessionStatus(null)
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

  const loadPreview = async () => {
    if (previewLoaded) return
    setLoadingPreview(true)
    try {
      const response = await api.get(`/agents/${id}/preview`)
      if (response.success) {
        setPreview(response.data)
      }
    } catch (error) {
      console.error('Failed to load preview:', error)
    } finally {
      setLoadingPreview(false)
      setPreviewLoaded(true)
    }
  }

  const loadDependencies = async () => {
    if (depsLoaded) return
    setLoadingDeps(true)
    try {
      const response = await api.get(`/agents/${id}/dependencies`)
      if (response.success) {
        setDependencies(response.data)
      }
    } catch (error) {
      console.error('Failed to load dependencies:', error)
    } finally {
      setLoadingDeps(false)
      setDepsLoaded(true)
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
      const response = await api.post(`/agents/${id}/download`, {}, {
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url

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
      dispatch(fetchAgentDetail(id))
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
      const response = await api.post(`/agents/${id}/rate`, values)
      if (response.success) {
        message.success('评价成功')
        setRateModalVisible(false)
        form.resetFields()
        loadReviews()
        dispatch(fetchAgentDetail(id))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || error.response?.data?.error || '评价失败')
    } finally {
      setSubmittingRate(false)
    }
  }

  const loadTrialSession = async (sessionId, nextRemainingTrials = remainingTrials) => {
    const res = await getTrialSession(sessionId)
    if (!res.success) return

    setTrialSessionId(res.data.session.id)
    setTrialSessionStatus(res.data.session.status)
    setRemainingTrials(nextRemainingTrials)
    setTrialMessages(
      res.data.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        time: msg.created_at,
      }))
    )
    setTrialLoaded(true)
  }

  const refreshRemainingTrials = async () => {
    try {
      const res = await getTrialHistory(id)
      if (res.success) {
        setRemainingTrials(res.data.remainingTrials)
      }
    } catch (error) {
      console.error('Failed to refresh trial history:', error)
    }
  }

  const openTrialModal = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    setTrialVisible(true)
    if (trialLoaded && trialSessionId) return

    try {
      const res = await createTrialSession(id)
      if (res.success) {
        await loadTrialSession(res.data.sessionId, res.data.remainingTrials)
      }
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data?.error || '无法创建试用会话'
      message.error(errMsg)

      try {
        await refreshRemainingTrials()
      } catch {
        // noop
      }
    }
  }

  const handleEndTrial = async () => {
    if (!trialSessionId) {
      setTrialVisible(false)
      return
    }

    try {
      await endTrialSession(trialSessionId)
      message.success('试用会话已结束')
      setTrialVisible(false)
      setTrialMessages([])
      setTrialInput('')
      setTrialLoaded(false)
      setTrialSessionId(null)
      setTrialSessionStatus('completed')
      await refreshRemainingTrials()
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data?.error || '结束试用失败'
      message.error(errMsg)
    }
  }

  const handleTrialSend = async () => {
    if (!trialInput.trim() || trialSending || remainingTrials <= 0 || !trialSessionId) return

    const userMsg = trialInput.trim()
    setTrialInput('')
    setTrialMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setTrialSending(true)

    try {
      const res = await sendTrialSessionMessage(trialSessionId, userMsg)
      if (res.success) {
        setTrialMessages(prev => [...prev, { role: 'assistant', content: res.data.response }])
        setTrialSessionStatus(res.data.status)
      }
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data?.error || '发送失败'
      message.error(errMsg)
      if (error.response?.status === 429) {
        setRemainingTrials(0)
      }
      if (trialSessionId) {
        try {
          await loadTrialSession(trialSessionId)
        } catch (sessionError) {
          console.error('Failed to reload trial session:', sessionError)
        }
      }
    } finally {
      setTrialSending(false)
    }
  }

  const handleTabChange = (key) => {
    if (key === 'preview') loadPreview()
    if (key === 'dependencies') loadDependencies()
  }

  if (loading || !currentAgent) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  const previewFiles = [
    { key: 'identity', label: 'IDENTITY.md', icon: '🆔' },
    { key: 'rules', label: 'RULES.md', icon: '📋' },
    { key: 'memory', label: 'MEMORY.md', icon: '🧠' },
    { key: 'tools', label: 'TOOLS.md', icon: '🔧' },
    { key: 'readme', label: 'README.md', icon: '📖' },
  ]

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
      key: 'preview',
      label: (
        <span><FileTextOutlined /> 包内容</span>
      ),
      children: (
        <div>
          {loadingPreview ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : preview ? (
            <Collapse
              defaultActiveKey={previewFiles.filter(f => preview[f.key]).map(f => f.key)}
              items={previewFiles
                .filter(f => preview[f.key])
                .map(f => ({
                  key: f.key,
                  label: <span>{f.icon} {f.label}</span>,
                  children: (
                    <div style={{ background: '#fafafa', padding: 16, borderRadius: 4 }}>
                      <ReactMarkdown>{preview[f.key]}</ReactMarkdown>
                    </div>
                  ),
                }))}
            />
          ) : (
            <p style={{ color: '#999' }}>无法加载包内容预览</p>
          )}
        </div>
      ),
    },
    {
      key: 'dependencies',
      label: (
        <span><LinkOutlined /> 依赖</span>
      ),
      children: (
        <div>
          {loadingDeps ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : dependencies ? (
            <div>
              {dependencies.skills?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3>依赖的 Skill</h3>
                  <Row gutter={[16, 16]}>
                    {dependencies.skills.map((skill) => (
                      <Col key={skill.id} span={8}>
                        <Card
                          hoverable
                          size="small"
                          onClick={() => navigate(`/skill/${skill.id}`)}
                        >
                          <Card.Meta
                            title={skill.name}
                            description={
                              <div>
                                <p style={{ fontSize: 12, height: 32, overflow: 'hidden' }}>{skill.description}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontSize: 12 }}>v{skill.version}</span>
                                  <span style={{ fontSize: 12 }}><DownloadOutlined /> {skill.downloads_count || 0}</span>
                                </div>
                              </div>
                            }
                          />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}

              {dependencies.mcps?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3>依赖的 MCP</h3>
                  <Row gutter={[16, 16]}>
                    {dependencies.mcps.map((mcp) => (
                      <Col key={mcp.id} span={8}>
                        <Card
                          hoverable
                          size="small"
                          onClick={() => navigate(`/mcp/${mcp.id}`)}
                        >
                          <Card.Meta
                            title={mcp.name}
                            description={
                              <div>
                                <p style={{ fontSize: 12, height: 32, overflow: 'hidden' }}>{mcp.description}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontSize: 12 }}>v{mcp.version}</span>
                                  <span style={{ fontSize: 12 }}><DownloadOutlined /> {mcp.downloads_count || 0}</span>
                                </div>
                              </div>
                            }
                          />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}

              {(!dependencies.skills?.length && !dependencies.mcps?.length) && (
                <p style={{ color: '#999' }}>此 Agent 没有声明 Skill/MCP 依赖</p>
              )}
            </div>
          ) : (
            <p style={{ color: '#999' }}>无法加载依赖信息</p>
          )}
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
                  <Rate disabled defaultValue={currentAgent.rating_average || 0} />
                  {' '}({currentAgent.reviews_count || 0} 评价)
                </span>
                <span>
                  <DownloadOutlined />
                  {' '}{currentAgent.downloads_count || 0} 下载
                </span>
              </div>
            </div>

            <Divider />

            <Tabs items={tabItems} onChange={handleTabChange} />
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
                A
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={<DownloadOutlined />}
              style={{ marginBottom: 12 }}
              onClick={handleDownload}
              loading={downloading}
            >
              下载 Agent
            </Button>

            <Button
              size="large"
              block
              icon={<PlayCircleOutlined />}
              style={{ marginBottom: 12 }}
              onClick={openTrialModal}
            >
              试用 Agent
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
                <strong>作者:</strong> {currentAgent.author_name}
              </p>
              <p>
                <strong>分类:</strong> {currentAgent.category}
              </p>
              <p>
                <strong>更新时间:</strong> {currentAgent.updated_at ? new Date(currentAgent.updated_at).toLocaleDateString() : '-'}
              </p>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 试用沙盒弹窗 */}
      <Modal
        title={`试用 ${currentAgent.name}`}
        open={trialVisible}
        onCancel={() => setTrialVisible(false)}
        footer={null}
        width={700}
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {trialSessionStatus && (
              <Tag color={trialSessionStatus === 'active' ? 'green' : trialSessionStatus === 'failed' ? 'red' : 'default'}>
                会话状态: {trialSessionStatus}
              </Tag>
            )}
          </div>
          <Tag color={remainingTrials > 0 ? 'blue' : 'red'}>
            剩余试用次数: {remainingTrials}
          </Tag>
        </div>

        <div style={{
          height: 400,
          overflowY: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 12,
          background: '#fafafa',
        }}>
          {trialMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 160 }}>
              {trialLoaded ? '发送消息开始试用此 Agent' : '正在准备试用环境...'}
            </div>
          )}
          {trialMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}
            >
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: 12,
                background: msg.role === 'user' ? '#1890ff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                border: msg.role === 'user' ? 'none' : '1px solid #e8e8e8',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {trialSending && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: '#fff', border: '1px solid #e8e8e8' }}>
                <Spin size="small" /> 思考中...
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea
            value={trialInput}
            onChange={(e) => setTrialInput(e.target.value)}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleTrialSend() } }}
            placeholder={remainingTrials > 0 ? '输入消息试用 Agent...' : '试用次数已用完'}
            disabled={remainingTrials <= 0 || trialSending || !trialSessionId || trialSessionStatus === 'failed'}
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleTrialSend}
            loading={trialSending}
            disabled={remainingTrials <= 0 || !trialInput.trim() || !trialSessionId || trialSessionStatus === 'failed'}
          >
            发送
          </Button>
          <Button onClick={handleEndTrial} disabled={!trialSessionId}>
            结束试用
          </Button>
        </div>
      </Modal>

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
