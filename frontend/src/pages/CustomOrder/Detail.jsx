import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  message,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { PushpinOutlined } from '@ant-design/icons'
import {
  acceptCustomOrder,
  createCustomOrderDispute,
  createCustomOrderMessage,
  createCustomOrderSubmission,
  downloadCustomOrderSubmissionArtifact,
  getCustomOrderById,
  getCustomOrderDisputes,
  getCustomOrderInstallCommand,
  getCustomOrderMessages,
  getCustomOrderSubmissions,
  requestCustomOrderAcceptance,
} from '../../services/customOrderService'

const { TextArea } = Input
const { Dragger } = Upload
const { Text, Paragraph } = Typography

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

const categoryLabelMap = {
  agent: 'Agent 开发',
  skill: 'Skill 开发',
  mcp: 'MCP 开发',
  integration: '集成对接',
  other: '其他',
}

const toDateText = (value, withTime = true) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return withTime ? date.toLocaleString() : date.toLocaleDateString()
}

const getBudgetText = (order) => {
  if (!order?.budget_min && !order?.budget_max) return '预算未填写'
  return `¥${order.budget_min || 0} - ¥${order.budget_max || '不限'}`
}

const getMessageRoleLabel = (item, order) => {
  if (!item || !order) return '参与者'
  if (item.sender_id === order.user_id) return '需求方'
  if (item.sender_id === order.developer_id) return '开发者'
  if (item.role === 'admin') return '平台'
  return '参与者'
}

function CustomOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useSelector((state) => state.auth)

  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState(null)
  const [messages, setMessages] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [disputes, setDisputes] = useState([])

  const [msgText, setMsgText] = useState('')
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false)
  const [disputeModalOpen, setDisputeModalOpen] = useState(false)
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [installLoading, setInstallLoading] = useState(false)
  const [installPayload, setInstallPayload] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionFile, setSubmissionFile] = useState(null)
  const [submissionForm] = Form.useForm()
  const [disputeForm] = Form.useForm()
  const [replyTarget, setReplyTarget] = useState(null)
  const messageInputRef = useRef(null)
  const messageEndRef = useRef(null)

  const isBuyer = !!(user && order && user.id === order.user_id)
  const isDeveloper = !!(user && order && user.id === order.developer_id)
  const isAdmin = user?.role === 'admin'
  const canCollaborate = isBuyer || isDeveloper || isAdmin

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await getCustomOrderById(id)
      if (!detail.success) throw new Error('加载需求失败')
      setOrder(detail.data)

      const [msgRes, subRes, disRes] = await Promise.all([
        getCustomOrderMessages(id, { limit: 300 }).catch(() => ({ success: false, data: [] })),
        getCustomOrderSubmissions(id).catch(() => ({ success: false, data: [] })),
        getCustomOrderDisputes(id).catch(() => ({ success: false, data: [] })),
      ])
      setMessages(msgRes.success ? msgRes.data : [])
      setSubmissions(subRes.success ? subRes.data : [])
      setDisputes(disRes.success ? disRes.data : [])
    } catch (error) {
      message.error(error.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!messageEndRef.current) return
    messageEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [timelineMessages.length])

  const pinnedSubmission = useMemo(() => {
    if (submissions.length === 0) return null
    const accepted = submissions.find((item) => item.status === 'accepted')
    if (accepted) return accepted
    return [...submissions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  }, [submissions])

  const timelineMessages = useMemo(() => {
    const list = [...messages]
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return list
  }, [messages])

  const handleSendMessage = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    if (!msgText.trim()) return
    try {
      const content = replyTarget
        ? `回复 #${replyTarget.floor} ${replyTarget.name || ''}\n${msgText.trim()}`
        : msgText.trim()
      const res = await createCustomOrderMessage(id, { content })
      if (res.success) {
        setMsgText('')
        setReplyTarget(null)
        setMessages((prev) => [...prev, res.data])
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '发送失败')
    }
  }

  const handleCreateSubmission = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        title: values.title,
        summary: values.summary,
        agent_id: values.agent_id || null,
        version_label: values.version_label || null,
        package: submissionFile,
      }
      if (!payload.package) {
        message.warning('请先上传 ZIP 交付包')
        return
      }
      const res = await createCustomOrderSubmission(id, payload)
      if (res.success) {
        message.success('方案提交成功')
        setSubmissionModalOpen(false)
        submissionForm.resetFields()
        setSubmissionFile(null)
        loadAll()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestAcceptance = async () => {
    try {
      const res = await requestCustomOrderAcceptance(id)
      if (res.success) {
        message.success('已发起验收')
        loadAll()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '发起失败')
    }
  }

  const handleAccept = async () => {
    try {
      const res = await acceptCustomOrder(id)
      if (res.success) {
        message.success('已确认验收，任务完成')
        loadAll()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '验收失败')
    }
  }

  const handleCreateDispute = async (values) => {
    setSubmitting(true)
    try {
      const res = await createCustomOrderDispute(id, {
        reason: values.reason,
        evidence: values.evidence
          ? values.evidence
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
          : [],
      })
      if (res.success) {
        message.success('争议已提交')
        setDisputeModalOpen(false)
        disputeForm.resetFields()
        loadAll()
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '提交争议失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadArtifact = async (submission) => {
    try {
      const res = await downloadCustomOrderSubmissionArtifact(id, submission.id)
      const blob = res.data
      const filename = submission.artifact_file_name || `${submission.title || 'submission'}.zip`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      message.error(error.response?.data?.error?.message || '下载失败')
    }
  }

  const handleOpenInstallCommand = async (submission) => {
    setInstallLoading(true)
    try {
      const res = await getCustomOrderInstallCommand(id, submission.id)
      if (res.success) {
        setInstallPayload({
          submissionTitle: submission.title,
          command: res.data.command,
          expiresAt: res.data.expiresAt,
          signedDownloadUrl: res.data.signedDownloadUrl,
        })
        setInstallModalOpen(true)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '获取安装命令失败')
    } finally {
      setInstallLoading(false)
    }
  }

  const handleCopyInstallCommand = async () => {
    if (!installPayload?.command) return
    try {
      await navigator.clipboard.writeText(installPayload.command)
      message.success('安装命令已复制')
    } catch {
      message.warning('复制失败，请手动复制')
    }
  }

  const handleReplyMessage = (item, index) => {
    const mention = `@${index + 1}楼 `
    setReplyTarget({
      floor: index + 1,
      name: item.sender_name || item.role || '用户',
    })
    setMsgText((prev) => {
      const trimmed = String(prev || '').trim()
      if (!trimmed) return mention
      if (trimmed.startsWith(mention)) return prev
      return `${mention}${prev}`
    })
    messageInputRef.current?.focus?.()
  }

  return (
    <div className="page-shell">
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Button type="link" onClick={() => navigate('/custom-order')} style={{ paddingLeft: 0 }}>
          返回定制开发列表
        </Button>

        <Spin spinning={loading}>
          {!order ? (
            <Card className="cream-panel">
              <Empty description="需求不存在或已删除" />
            </Card>
          ) : (
            <>
              <div className="custom-thread-detail-layout">
                <div className="custom-thread-main">
                  <Card className="cream-panel custom-thread-post-card">
                    <Space direction="vertical" style={{ width: '100%' }} size={14}>
                      <div className="custom-thread-post-head">
                        <div>
                          <h2 style={{ margin: 0 }}>{order.title}</h2>
                          <Text type="secondary">
                            发布者 {order.user_name || '匿名用户'} · {toDateText(order.created_at)}
                          </Text>
                        </div>
                        <Tag color={statusMap[order.status]?.color || 'default'}>{statusMap[order.status]?.text || order.status}</Tag>
                      </div>
                      <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{order.description}</Paragraph>
                      <Space wrap>
                        {order.category && <Tag>{categoryLabelMap[order.category] || order.category}</Tag>}
                        <Tag color="gold">{getBudgetText(order)}</Tag>
                        <Tag>截止 {toDateText(order.deadline, false)}</Tag>
                      </Space>
                    </Space>
                  </Card>

                  {pinnedSubmission ? (
                    <Card className="cream-panel custom-thread-pinned-card">
                      <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Space className="custom-thread-pinned-head">
                          <Tag color="green">
                            <PushpinOutlined /> 置顶方案
                          </Tag>
                          <Text strong>{pinnedSubmission.title}</Text>
                          {pinnedSubmission.version_label && <Text type="secondary">{pinnedSubmission.version_label}</Text>}
                        </Space>
                        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{pinnedSubmission.summary}</Paragraph>
                        <Text type="secondary">
                          by {pinnedSubmission.developer_name || '开发者'} · {toDateText(pinnedSubmission.created_at)}
                        </Text>
                        {pinnedSubmission.artifact_file_name && (
                          <Space wrap>
                            <Button
                              type="primary"
                              loading={installLoading}
                              onClick={() => handleOpenInstallCommand(pinnedSubmission)}
                            >
                              推荐：一键安装
                            </Button>
                            <Button onClick={() => handleDownloadArtifact(pinnedSubmission)}>下载 ZIP（高级）</Button>
                          </Space>
                        )}
                      </Space>
                    </Card>
                  ) : (
                    <Card className="cream-panel">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有开发者提交方案" />
                    </Card>
                  )}

                  <Card className="cream-panel custom-thread-comments-card">
                    <div className="custom-thread-comments-head">
                      <Text strong>评论区 / 需求追问</Text>
                      <Text type="secondary">{timelineMessages.length} 条</Text>
                    </div>

                    {timelineMessages.length > 0 ? (
                      <List
                        dataSource={timelineMessages}
                        renderItem={(item, index) => (
                          <List.Item className="custom-thread-comment-item">
                            <Space direction="vertical" style={{ width: '100%' }} size={6}>
                              <div className="custom-thread-comment-head">
                                <Space wrap size={8}>
                                  <Text strong>{item.sender_name || item.role || '用户'}</Text>
                                  <Tag>{getMessageRoleLabel(item, order)}</Tag>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    #{index + 1} 楼
                                  </Text>
                                </Space>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {toDateText(item.created_at)}
                                </Text>
                              </div>
                              <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{item.content}</Paragraph>
                              <div>
                                <Button size="small" type="link" style={{ padding: 0 }} onClick={() => handleReplyMessage(item, index)}>
                                  回复
                                </Button>
                              </div>
                            </Space>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有评论，欢迎先提需求细节" />
                    )}

                    {canCollaborate ? (
                      <div className="custom-thread-reply-box">
                        {replyTarget && (
                          <Alert
                            style={{ marginBottom: 10 }}
                            type="info"
                            showIcon
                            message={`正在回复 #${replyTarget.floor} ${replyTarget.name}`}
                            action={
                              <Button size="small" type="text" onClick={() => setReplyTarget(null)}>
                                取消
                              </Button>
                            }
                          />
                        )}
                        <Input.TextArea
                          ref={messageInputRef}
                          rows={3}
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          placeholder="补充需求、提问细节、对方案给反馈..."
                        />
                        <div style={{ marginTop: 10, textAlign: 'right' }}>
                          <Button type="primary" onClick={handleSendMessage}>
                            发表评论
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Alert type="info" showIcon message="登录并成为参与方后，可在评论区沟通需求细节。" />
                    )}
                    <div ref={messageEndRef} />
                  </Card>
                </div>

                <div className="custom-thread-side">
                  <Card className="cream-panel">
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      <Text strong>协作动作</Text>
                      {(isDeveloper || isAdmin) && <Button onClick={() => setSubmissionModalOpen(true)}>提交方案</Button>}
                      {(isDeveloper || isAdmin) && order.status === 'in_progress' && (
                        <Button type="primary" onClick={handleRequestAcceptance}>
                          发起验收
                        </Button>
                      )}
                      {(isBuyer || isAdmin) && order.status === 'awaiting_acceptance' && (
                        <Button type="primary" onClick={handleAccept}>
                          确认验收（不触发支付）
                        </Button>
                      )}
                      {(isBuyer || isAdmin) && ['in_progress', 'awaiting_acceptance'].includes(order.status) && (
                        <Button danger onClick={() => setDisputeModalOpen(true)}>
                          发起争议
                        </Button>
                      )}
                    </Space>
                  </Card>

                  <Card className="cream-panel">
                    <Descriptions title="帖子信息" size="small" column={1}>
                      <Descriptions.Item label="状态">{statusMap[order.status]?.text || order.status}</Descriptions.Item>
                      <Descriptions.Item label="分类">{categoryLabelMap[order.category] || order.category || '-'}</Descriptions.Item>
                      <Descriptions.Item label="预算">{getBudgetText(order)}</Descriptions.Item>
                      <Descriptions.Item label="截止">{toDateText(order.deadline, false)}</Descriptions.Item>
                      <Descriptions.Item label="开发者">{order.developer_name || '待指派'}</Descriptions.Item>
                    </Descriptions>
                  </Card>

                  <Card className="cream-panel">
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      <Text strong>争议记录</Text>
                      {disputes.length === 0 && <Text type="secondary">暂无争议记录</Text>}
                      {disputes.slice(0, 2).map((item) => (
                        <div key={item.id} className="custom-thread-dispute-item">
                          <Text strong>{item.status}</Text>
                          <Paragraph style={{ marginBottom: 4 }}>{item.reason}</Paragraph>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {toDateText(item.created_at)}
                          </Text>
                        </div>
                      ))}
                    </Space>
                  </Card>
                </div>
              </div>

              <Alert
                type="info"
                showIcon
                message="当前为非支付阶段：已支持协作、提交、验收、争议流转；支付与结算后续接入。"
              />
            </>
          )}
        </Spin>
      </Space>

      <Modal open={submissionModalOpen} title="提交方案" onCancel={() => setSubmissionModalOpen(false)} footer={null}>
        <Form form={submissionForm} layout="vertical" onFinish={handleCreateSubmission}>
          <Form.Item name="title" label="方案标题" rules={[{ required: true, message: '请输入方案标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="方案说明" rules={[{ required: true, message: '请输入方案说明' }]}>
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="version_label" label="版本标签">
            <Input placeholder="例如 v1.0.0" />
          </Form.Item>
          <Form.Item name="agent_id" label="关联 Agent ID">
            <Input />
          </Form.Item>
          <Form.Item label="交付 ZIP（必填）" required>
            <Dragger
              accept=".zip"
              maxCount={1}
              beforeUpload={(file) => {
                setSubmissionFile(file)
                return false
              }}
              onRemove={() => setSubmissionFile(null)}
              fileList={submissionFile ? [submissionFile] : []}
            >
              <p style={{ margin: 0 }}>拖拽 ZIP 到这里，或点击上传</p>
              <p style={{ margin: 0, color: 'var(--ink-muted)' }}>外链已禁用，交付包将托管到平台仓库。</p>
            </Dragger>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block>
            提交
          </Button>
        </Form>
      </Modal>

      <Modal open={disputeModalOpen} title="发起争议" onCancel={() => setDisputeModalOpen(false)} footer={null}>
        <Form form={disputeForm} layout="vertical" onFinish={handleCreateDispute}>
          <Form.Item name="reason" label="争议原因" rules={[{ required: true, min: 10, message: '至少 10 个字符' }]}>
            <TextArea rows={4} placeholder="请描述与需求不符、无法运行等客观问题" />
          </Form.Item>
          <Form.Item name="evidence" label="证据（每行一条，可选）">
            <TextArea rows={3} placeholder="截图链接/日志链接/复现步骤" />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" loading={submitting} block>
            提交争议
          </Button>
        </Form>
      </Modal>

      <Modal
        open={installModalOpen}
        title="推荐安装命令（openclew install）"
        onCancel={() => setInstallModalOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="success"
            showIcon
            message={installPayload?.submissionTitle ? `方案：${installPayload.submissionTitle}` : '安装命令已生成'}
            description="推荐使用一键安装命令，避免手动下载/解压/路径配置错误。"
          />
          <Input.TextArea value={installPayload?.command || ''} rows={3} readOnly />
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            有效期：{installPayload?.expiresAt ? toDateText(installPayload.expiresAt) : '-'}
          </div>
          <Space>
            <Button type="primary" onClick={handleCopyInstallCommand}>
              复制安装命令
            </Button>
            <Button onClick={() => installPayload?.signedDownloadUrl && window.open(installPayload.signedDownloadUrl, '_blank')}>
              备用下载
            </Button>
          </Space>
        </Space>
      </Modal>
    </div>
  )
}

export default CustomOrderDetail
