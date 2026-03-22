import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Select, Upload, Button, Tag, message, Alert, Card, Space } from 'antd'
import { UploadOutlined, PlusOutlined } from '@ant-design/icons'
import { getAgentById, uploadAgent } from '../../services/agentService'
import './index.css'

const { TextArea } = Input
const { Option } = Select
const UPLOAD_AGENT_DRAFT_KEY = 'upload-agent-draft-v1'

const UploadAgent = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fileList, setFileList] = useState([])
  const [tags, setTags] = useState([])
  const [inputTag, setInputTag] = useState('')
  const [uploadReview, setUploadReview] = useState(null)
  const [uploadSummary, setUploadSummary] = useState(null)
  const [reviewPollingAgentId, setReviewPollingAgentId] = useState(null)
  const [reviewPollingLoading, setReviewPollingLoading] = useState(false)
  const [lastReviewCheckAt, setLastReviewCheckAt] = useState(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null)

  const categories = [
    { value: 'development', label: '开发工具' },
    { value: 'data-analysis', label: '数据分析' },
    { value: 'automation', label: '自动化' },
    { value: 'content', label: '内容创作' },
    { value: 'business', label: '商业分析' },
    { value: 'education', label: '教育培训' },
    { value: 'other', label: '其他' }
  ]

  const handleFileChange = ({ fileList: newFileList }) => {
    if (newFileList.length > 0) {
      const file = newFileList[0].originFileObj || newFileList[0]
      if (file.size > 50 * 1024 * 1024) {
        message.error('文件大小不能超过 50MB')
        return
      }
    }
    setFileList(newFileList)
  }

  const handleAddTag = () => {
    if (inputTag && !tags.includes(inputTag)) {
      setTags([...tags, inputTag])
      setInputTag('')
    }
  }

  const handleRemoveTag = (removedTag) => {
    setTags(tags.filter(tag => tag !== removedTag))
  }

  const clearUploadDraft = useCallback(() => {
    localStorage.removeItem(UPLOAD_AGENT_DRAFT_KEY)
    setDraftUpdatedAt(null)
  }, [])

  const persistDraft = useCallback((partial = {}) => {
    const currentValues = form.getFieldsValue()
    const payload = {
      values: {
        name: currentValues.name || '',
        description: currentValues.description || '',
        category: currentValues.category || undefined,
        version: currentValues.version || '',
        publish_mode: currentValues.publish_mode || 'open',
        ...partial.values,
      },
      tags: Array.isArray(partial.tags) ? partial.tags : tags,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(UPLOAD_AGENT_DRAFT_KEY, JSON.stringify(payload))
    setDraftUpdatedAt(payload.updatedAt)
  }, [form, tags])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOAD_AGENT_DRAFT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.values && typeof parsed.values === 'object') {
          form.setFieldsValue(parsed.values)
        }
        if (Array.isArray(parsed?.tags)) {
          setTags(parsed.tags)
        }
        if (parsed?.updatedAt) {
          setDraftUpdatedAt(parsed.updatedAt)
          message.info(`已恢复草稿（${new Date(parsed.updatedAt).toLocaleString()}）`)
        }
      }
    } catch {
      // noop
    } finally {
      setDraftRestored(true)
    }
  }, [form])

  useEffect(() => {
    if (!draftRestored) return
    persistDraft()
  }, [draftRestored, tags, persistDraft])

  const handleSubmit = async (values) => {
    if (fileList.length === 0) {
      message.error('请上传 Agent 包文件')
      return
    }

    setLoading(true)
    setUploadReview(null)
    setUploadSummary(null)
    setReviewPollingAgentId(null)
    setLastReviewCheckAt(null)

    try {
      const formData = new FormData()
      formData.append('package', fileList[0].originFileObj)
      formData.append('name', values.name)
      formData.append('description', values.description)
      formData.append('category', values.category)
      formData.append('version', values.version)
      formData.append('publish_mode', values.publish_mode)

      // 处理标签
      formData.append('tags', JSON.stringify(tags))

      const response = await uploadAgent(formData)

      if (response.success) {
        const review = response.review || response.data?.auto_review_result || null
        const reviewStage = response.data?.review_stage || null
        const status = response.data?.status || null
        const uploadedAgentId = response.data?.id || null
        const policyDecision = String(review?.policy_review?.decision || '').toLowerCase()
        const policyStatus = String(review?.policy_review?.status || '').toLowerCase()
        const shouldStayForPolicyReview =
          review?.sensitive_review?.decision === 'needs_review' ||
          ['pending', 'needs_review', 'needs_fix'].includes(policyDecision) ||
          ['pending', 'error'].includes(policyStatus)

        setUploadReview(review)
        setUploadSummary({
          message: response.message || 'Agent 上传成功，等待审核',
          reviewStage,
          status,
          agentId: uploadedAgentId,
        })

        if (status === 'rejected' || reviewStage === 'rejected') {
          message.warning('上传已被自动拒绝，请根据提示修复后重试')
          return
        }

        if (shouldStayForPolicyReview && uploadedAgentId) {
          setReviewPollingAgentId(uploadedAgentId)
          message.info('已进入策略复核，页面将自动刷新状态')
          return
        }

        clearUploadDraft()
        message.success(response.message || 'Agent 上传成功，等待审核')
        navigate('/user')
      }
    } catch (error) {
      const payload = error.response?.data || {}
      const textError = payload.error?.message || payload.error || '上传失败'
      message.error(textError)
      setUploadSummary({
        message: textError,
        details: payload.details || [],
        reviewStage: null,
        status: 'failed',
      })
      setUploadReview(payload.review || null)
    } finally {
      setLoading(false)
    }
  }

  const isReviewPollingActive = useMemo(() => {
    const stage = String(uploadSummary?.reviewStage || '').toLowerCase()
    return Boolean(reviewPollingAgentId) && ['pending_manual', 'pending_auto', ''].includes(stage)
  }, [reviewPollingAgentId, uploadSummary?.reviewStage])

  const fetchLatestReviewStatus = useCallback(async ({ silent = false } = {}) => {
    if (!reviewPollingAgentId) return
    if (!silent) {
      setReviewPollingLoading(true)
    }
    try {
      const response = await getAgentById(reviewPollingAgentId)
      if (response.success) {
        const data = response.data || {}
        setUploadReview(data.auto_review_result || null)
        setUploadSummary((prev) => ({
          ...(prev || {}),
          message: data.review_stage === 'approved'
            ? '复核通过，已进入人工审核队列'
            : data.review_stage === 'rejected'
              ? '复核未通过，请按提示修改后重新上传'
              : '复核进行中，系统将持续刷新状态',
          reviewStage: data.review_stage || prev?.reviewStage || null,
          status: data.status || prev?.status || null,
          agentId: data.id || prev?.agentId || reviewPollingAgentId,
        }))
        setLastReviewCheckAt(new Date().toISOString())

        if (['approved', 'rejected', 'published'].includes(String(data.review_stage || '').toLowerCase())) {
          setReviewPollingAgentId(null)
        }
      }
    } catch (error) {
      if (!silent) {
        message.error(error.response?.data?.error?.message || '刷新复核状态失败')
      }
    } finally {
      if (!silent) {
        setReviewPollingLoading(false)
      }
    }
  }, [reviewPollingAgentId])

  useEffect(() => {
    if (!isReviewPollingActive) return undefined
    const timer = window.setInterval(() => {
      void fetchLatestReviewStatus({ silent: true })
    }, 6000)
    return () => window.clearInterval(timer)
  }, [fetchLatestReviewStatus, isReviewPollingActive])

  return (
    <div className="upload-agent-container">
      <div className="upload-agent-content">
        <p className="section-label">Publish Agent</p>
        <h1>发布 Agent</h1>
        <p className="subtitle">将您的专业能力打包为 Agent，分享给更多用户</p>
        {draftUpdatedAt && (
          <div style={{ marginBottom: 12, color: 'var(--ink-muted)', fontSize: 12 }}>
            草稿最后保存时间：{new Date(draftUpdatedAt).toLocaleString()}
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => {
            if (draftRestored) {
              persistDraft()
            }
          }}
          initialValues={{ publish_mode: 'open' }}
        >
          <Form.Item
            label="Agent 名称"
            name="name"
            rules={[{ required: true, message: '请输入 Agent 名称' }]}
          >
            <Input placeholder="例如：Python 代码审查助手" />
          </Form.Item>

          <Form.Item
            label="Agent 描述"
            name="description"
            rules={[{ required: true, message: '请输入 Agent 描述' }]}
          >
            <TextArea
              rows={4}
              placeholder="详细描述您的 Agent 功能、特点和使用场景"
            />
          </Form.Item>

          <Form.Item
            label="分类"
            name="category"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="选择 Agent 分类">
              {categories.map(cat => (
                <Option key={cat.value} value={cat.value}>
                  {cat.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="版本号"
            name="version"
            rules={[{ required: true, message: '请输入版本号' }]}
          >
            <Input placeholder="例如：1.0.0" />
          </Form.Item>

          <Form.Item
            label="发布模式"
            name="publish_mode"
            rules={[{ required: true, message: '请选择发布模式' }]}
            extra="公开分发可直接安装；商业分发将通过受控安装命令分发。"
          >
            <Select>
              <Option value="open">公开分发</Option>
              <Option value="commercial">商业分发</Option>
            </Select>
          </Form.Item>

          <Form.Item label="标签">
            <div className="tags-input">
              <div className="tags-list">
                {tags.map(tag => (
                  <Tag
                    key={tag}
                    closable
                    onClose={() => handleRemoveTag(tag)}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
              <div className="tag-input-group">
                <Input
                  value={inputTag}
                  onChange={(e) => setInputTag(e.target.value)}
                  onPressEnter={handleAddTag}
                  placeholder="输入标签后按回车"
                  style={{ width: 200 }}
                />
                <Button
                  type="dashed"
                  onClick={handleAddTag}
                  icon={<PlusOutlined />}
                >
                  添加标签
                </Button>
              </div>
            </div>
          </Form.Item>

          <Form.Item
            label="Agent 包文件"
            required
            extra="请上传 .zip 格式的 Agent 包，大小不超过 50MB"
          >
            <Upload
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={() => false}
              accept=".zip"
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>

          <Form.Item>
          <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
            >
              提交审核
            </Button>
            <Button
              style={{ marginTop: 10 }}
              block
              onClick={() => {
                form.resetFields()
                setTags([])
                clearUploadDraft()
                message.success('已清空草稿')
              }}
            >
              清空草稿
            </Button>
          </Form.Item>
        </Form>

        {uploadSummary && (
          <Card style={{ marginTop: 20 }}>
            <Alert
              type={uploadSummary.status === 'rejected' || uploadSummary.status === 'failed' ? 'error' : 'info'}
              showIcon
              message={uploadSummary.message}
            />
            {(uploadSummary.status === 'rejected' || uploadSummary.reviewStage === 'rejected') && (
              <div style={{ marginTop: 12 }}>
                <strong>处理建议：</strong>
                <div>1. 删除 MEMORY 中的密钥、证件、私钥等高危信息。</div>
                <div>2. 对手机号、邮箱、内部地址等中危信息做脱敏。</div>
                <div>3. 重新打包上传，建议先本地自检后再提交。</div>
              </div>
            )}
            {Array.isArray(uploadSummary.details) && uploadSummary.details.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>校验详情：</strong>
                <ul style={{ marginTop: 8 }}>
                  {uploadSummary.details.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {uploadSummary.agentId && (
              <div style={{ marginTop: 10 }}>
                <Tag>Agent ID: {uploadSummary.agentId}</Tag>
                {lastReviewCheckAt && (
                  <Tag color="default">最近检查: {new Date(lastReviewCheckAt).toLocaleTimeString()}</Tag>
                )}
                {isReviewPollingActive && (
                  <Button
                    size="small"
                    style={{ marginLeft: 8 }}
                    loading={reviewPollingLoading}
                    onClick={() => fetchLatestReviewStatus()}
                  >
                    立即刷新复核状态
                  </Button>
                )}
                {!isReviewPollingActive && uploadSummary.status !== 'rejected' && (
                  <Button
                    type="primary"
                    size="small"
                    style={{ marginLeft: 8 }}
                    onClick={() => navigate('/user')}
                  >
                    前往用户中心查看审核进度
                  </Button>
                )}
                {(uploadSummary.status === 'rejected' || uploadSummary.reviewStage === 'rejected') && (
                  <Button
                    size="small"
                    style={{ marginLeft: 8 }}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  >
                    返回顶部重新上传
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        {uploadReview?.sensitive_review && (
          <Card title="敏感内容命中详情" style={{ marginTop: 16 }}>
            <Space wrap>
              <Tag color={uploadReview.sensitive_review.decision === 'reject' ? 'red' : uploadReview.sensitive_review.decision === 'needs_review' ? 'orange' : 'green'}>
                判定: {uploadReview.sensitive_review.decision}
              </Tag>
              <Tag>高危: {uploadReview.sensitive_review.summary?.highCount || 0}</Tag>
              <Tag>中危: {uploadReview.sensitive_review.summary?.mediumCount || 0}</Tag>
            </Space>
            {(uploadReview.sensitive_review.findings || []).length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 220, overflow: 'auto' }}>
                {(uploadReview.sensitive_review.findings || []).slice(0, 20).map((item, index) => (
                  <div key={`${item.file}-${item.line}-${index}`} style={{ marginBottom: 8 }}>
                    <Tag color={item.severity === 'high' ? 'red' : 'orange'}>{item.severity}</Tag>
                    <Tag>{item.category}</Tag>
                    <span>{item.file}{item.line ? `:${item.line}` : ''} - {item.message}</span>
                  </div>
                ))}
              </div>
            )}
            {(uploadReview.sensitive_review.remediation || []).length > 0 && (
              <Card size="small" type="inner" title="修复建议" style={{ marginTop: 12 }}>
                {(uploadReview.sensitive_review.remediation || []).map((item) => (
                  <div key={item.category} style={{ marginBottom: 8 }}>
                    <Tag color="blue">{item.category}</Tag>
                    <span>{item.suggestion}</span>
                  </div>
                ))}
              </Card>
            )}
          </Card>
        )}

        {uploadReview?.policy_review && uploadReview.policy_review.status !== 'skipped' && (
          <Card title="平台 Agent 复核结果" style={{ marginTop: 16 }}>
            <Space wrap>
              <Tag color={uploadReview.policy_review.status === 'completed' ? 'green' : 'orange'}>
                状态: {uploadReview.policy_review.status}
              </Tag>
              <Tag color={uploadReview.policy_review.decision === 'reject' ? 'red' : uploadReview.policy_review.decision === 'pass' ? 'green' : 'orange'}>
                判定: {uploadReview.policy_review.decision || '-'}
              </Tag>
            </Space>
            {uploadReview.policy_review.summary && (
              <Alert style={{ marginTop: 10 }} type="info" showIcon message={uploadReview.policy_review.summary} />
            )}
            {Array.isArray(uploadReview.policy_review.issues) && uploadReview.policy_review.issues.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>复核问题：</strong>
                <ul style={{ marginTop: 8 }}>
                  {uploadReview.policy_review.issues.map((item, index) => (
                    <li key={`${item.category || 'issue'}-${index}`}>
                      [{item.category || 'issue'}] {item.message || JSON.stringify(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

export default UploadAgent
