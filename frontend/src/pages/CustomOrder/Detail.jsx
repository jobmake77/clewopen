import { useCallback, useEffect, useState } from 'react'
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
  Tabs,
  Upload,
} from 'antd'
import {
  acceptCustomOrder,
  createCustomOrderDispute,
  createCustomOrderMessage,
  createCustomOrderSubmission,
  getCustomOrderById,
  getCustomOrderDisputes,
  getCustomOrderMessages,
  getCustomOrderSubmissions,
  requestCustomOrderAcceptance,
  downloadCustomOrderSubmissionArtifact,
  getCustomOrderInstallCommand,
} from '../../services/customOrderService'

const { TextArea } = Input
const { Dragger } = Upload

const statusMap = {
  open: { color: 'blue', text: '招标中' },
  in_progress: { color: 'orange', text: '进行中' },
  awaiting_acceptance: { color: 'purple', text: '待验收' },
  accepted: { color: 'geekblue', text: '已验收' },
  disputed: { color: 'red', text: '争议中' },
  completed: { color: 'green', text: '已完成' },
  closed: { color: 'default', text: '已关闭' },
  cancelled: { color: 'default', text: '已取消' },
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

      if (isAuthenticated) {
        const [msgRes, subRes, disRes] = await Promise.all([
          getCustomOrderMessages(id, { limit: 300 }).catch(() => ({ success: false, data: [] })),
          getCustomOrderSubmissions(id).catch(() => ({ success: false, data: [] })),
          getCustomOrderDisputes(id).catch(() => ({ success: false, data: [] })),
        ])
        setMessages(msgRes.success ? msgRes.data : [])
        setSubmissions(subRes.success ? subRes.data : [])
        setDisputes(disRes.success ? disRes.data : [])
      }
    } catch (error) {
      message.error(error.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id, isAuthenticated])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSendMessage = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    if (!msgText.trim()) return
    try {
      const res = await createCustomOrderMessage(id, { content: msgText.trim() })
      if (res.success) {
        setMsgText('')
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

  return (
    <div className="page-shell">
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Button type="link" onClick={() => navigate('/custom-order')} style={{ paddingLeft: 0 }}>
          返回定制开发
        </Button>
        <Spin spinning={loading}>
          {order ? (
            <>
              <Card className="cream-panel">
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <h2 style={{ margin: 0 }}>{order.title}</h2>
                    <Tag color={statusMap[order.status]?.color}>{statusMap[order.status]?.text || order.status}</Tag>
                  </div>
                  <p style={{ color: 'var(--ink-muted)', margin: 0 }}>{order.description}</p>
                  <Descriptions column={{ xs: 1, md: 3 }} size="small">
                    <Descriptions.Item label="发布者">{order.user_name}</Descriptions.Item>
                    <Descriptions.Item label="开发者">{order.developer_name || '待指派'}</Descriptions.Item>
                    <Descriptions.Item label="分类">{order.category || '-'}</Descriptions.Item>
                    <Descriptions.Item label="预算">
                      {order.budget_min || 0} - {order.budget_max || '不限'} 元
                    </Descriptions.Item>
                    <Descriptions.Item label="截止日期">
                      {order.deadline ? new Date(order.deadline).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">
                      {new Date(order.created_at).toLocaleString()}
                    </Descriptions.Item>
                  </Descriptions>
                  {canCollaborate && (
                    <Space wrap>
                      {(isDeveloper || isAdmin) && (
                        <Button onClick={() => setSubmissionModalOpen(true)}>提交方案</Button>
                      )}
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
                  )}
                </Space>
              </Card>

              <Alert
                type="info"
                showIcon
                message="当前为非支付阶段：已支持协作、提交、验收、争议流转；支付与结算后续接入。"
              />

              <Tabs
                items={[
                  {
                    key: 'submissions',
                    label: `方案提交 (${submissions.length})`,
                    children: submissions.length > 0 ? (
                      <List
                        dataSource={submissions}
                        renderItem={(item) => (
                          <List.Item>
                            <List.Item.Meta
                              title={`${item.title} ${item.version_label ? `(${item.version_label})` : ''}`}
                              description={
                                <Space direction="vertical" size={4}>
                                  <span>{item.summary}</span>
                                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                    by {item.developer_name || '开发者'} · {new Date(item.created_at).toLocaleString()}
                                  </span>
                                  {item.artifact_file_name && (
                                    <Space size={12}>
                                      <Button
                                        type="link"
                                        style={{ padding: 0, fontWeight: 600 }}
                                        loading={installLoading}
                                        onClick={() => handleOpenInstallCommand(item)}
                                      >
                                        推荐：一键安装
                                      </Button>
                                      <Button type="link" style={{ padding: 0 }} onClick={() => handleDownloadArtifact(item)}>
                                        下载 ZIP（高级）
                                      </Button>
                                    </Space>
                                  )}
                                </Space>
                              }
                            />
                            <Tag>{item.status}</Tag>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="暂无方案" />
                    ),
                  },
                  {
                    key: 'messages',
                    label: `协作消息 (${messages.length})`,
                    children: (
                      <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        {messages.length > 0 ? (
                          <List
                            dataSource={messages}
                            renderItem={(item) => (
                              <List.Item>
                                <List.Item.Meta
                                  title={`${item.sender_name || item.role} · ${new Date(item.created_at).toLocaleString()}`}
                                  description={item.content}
                                />
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description="暂无消息" />
                        )}
                        {canCollaborate && (
                          <Space.Compact style={{ width: '100%' }}>
                            <Input
                              value={msgText}
                              onChange={(e) => setMsgText(e.target.value)}
                              placeholder="输入协作消息..."
                              onPressEnter={handleSendMessage}
                            />
                            <Button type="primary" onClick={handleSendMessage}>发送</Button>
                          </Space.Compact>
                        )}
                      </Space>
                    ),
                  },
                  {
                    key: 'disputes',
                    label: `争议记录 (${disputes.length})`,
                    children: disputes.length > 0 ? (
                      <List
                        dataSource={disputes}
                        renderItem={(item) => (
                          <List.Item>
                            <List.Item.Meta
                              title={`状态：${item.status}`}
                              description={
                                <Space direction="vertical" size={4}>
                                  <span>{item.reason}</span>
                                  {item.resolution && <span>裁决：{item.resolution}</span>}
                                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                    {new Date(item.created_at).toLocaleString()}
                                  </span>
                                </Space>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="暂无争议" />
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <Card className="cream-panel"><Empty description="需求不存在或已删除" /></Card>
          )}
        </Spin>
      </Space>

      <Modal
        open={submissionModalOpen}
        title="提交方案"
        onCancel={() => setSubmissionModalOpen(false)}
        footer={null}
      >
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

      <Modal
        open={disputeModalOpen}
        title="发起争议"
        onCancel={() => setDisputeModalOpen(false)}
        footer={null}
      >
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
            有效期：{installPayload?.expiresAt ? new Date(installPayload.expiresAt).toLocaleString() : '-'}
          </div>
          <Space>
            <Button type="primary" onClick={handleCopyInstallCommand}>复制安装命令</Button>
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
