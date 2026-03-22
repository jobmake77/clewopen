import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Card, Button, Tag, Rate, Divider, Spin, Tabs, Modal, Form, Input, Collapse, message, Alert, Progress, Radio, Checkbox, Select, Switch } from 'antd'
import { DownloadOutlined, FileTextOutlined, LinkOutlined, PlayCircleOutlined, SendOutlined, AppstoreOutlined, ApartmentOutlined, ReadOutlined, MessageOutlined, PictureOutlined, DeleteOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { fetchAgentDetail } from '../../store/slices/agentSlice'
import api from '../../services/api'
import {
  getAgentInstallCommand,
  getAgentInstallOptions,
  previewAgentInstallPlan,
  getAgentInstallHistory,
  reportAgentInstallFeedback,
} from '../../services/agentService'
import {
  createTrialSession,
  endTrialSession,
  getTrialHistory,
  getTrialSession,
  getTrialSessionCapabilities,
  streamTrialSessionMessage,
} from '../../services/trialService'
import { listMyLlmConfigs } from '../../services/userLlmConfigService'

const { TextArea } = Input
const TRIAL_POLL_INTERVAL_MS = 2000
const TRIAL_MAX_IMAGE_BYTES = 5 * 1024 * 1024
const TRIAL_MAX_ATTACHMENTS_PER_MESSAGE = 4
const TRIAL_IMAGE_MIME_WHITELIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const TRIAL_STATUS_META = {
  provisioning: { label: '准备中', color: 'processing' },
  active: { label: '可对话', color: 'green' },
  failed: { label: '准备失败', color: 'red' },
  cleaning: { label: '清理中', color: 'orange' },
  completed: { label: '已结束', color: 'default' },
  expired: { label: '已过期', color: 'default' },
}
const TRIAL_PROVISIONING_STAGE_META = {
  queued: { label: '已进入队列', percent: 10 },
  'creating-sandbox': { label: '正在创建沙盒', percent: 35 },
  'building-workspace': { label: '正在准备 Agent 文件', percent: 60 },
  'installing-agent': { label: '正在安装运行环境', percent: 85 },
  'warming-gateway': { label: '正在预热流式引擎', percent: 93 },
  ready: { label: '试用环境已就绪', percent: 100 },
  failed: { label: '试用环境准备失败', percent: 100 },
}

const AGENT_PUBLISH_STATUS_META = {
  not_published: { label: '未发布', color: 'default' },
  queued: { label: '发布排队中', color: 'processing' },
  published: { label: '已发布', color: 'success' },
  failed: { label: '发布失败', color: 'error' },
}

const AGENT_PUBLISH_MODE_META = {
  open: '公开分发',
  commercial: '商业分发',
}
const INSTALL_MODE_META = {
  full: { label: '全量安装', description: '导入全部可安装配置，适合首次部署' },
  enhance: { label: '增强安装', description: '优先导入能力文件，默认不覆盖 MEMORY/SOUL' },
  custom: { label: '自选文件', description: '手动勾选文件进行精细安装' },
}

function shouldPollTrialSession(status, provisioningStage) {
  if (status === 'provisioning') return true
  if (status !== 'active') return false
  return Boolean(provisioningStage) && !['ready', 'failed'].includes(provisioningStage)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

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
  const [installWizardVisible, setInstallWizardVisible] = useState(false)
  const [installOptionsLoading, setInstallOptionsLoading] = useState(false)
  const [installPreviewLoading, setInstallPreviewLoading] = useState(false)
  const [installCommandLoading, setInstallCommandLoading] = useState(false)
  const [installFeedbackSubmitting, setInstallFeedbackSubmitting] = useState(false)
  const [installHistoryLoading, setInstallHistoryLoading] = useState(false)
  const [installOptionsData, setInstallOptionsData] = useState(null)
  const [installMode, setInstallMode] = useState('full')
  const [installSelectedFiles, setInstallSelectedFiles] = useState([])
  const [installPreviewData, setInstallPreviewData] = useState(null)
  const [installCommandData, setInstallCommandData] = useState(null)
  const [installHistoryData, setInstallHistoryData] = useState({ events: [], summary: null })
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
  const [trialProvisioning, setTrialProvisioning] = useState(null)
  const [trialExpiresAt, setTrialExpiresAt] = useState(null)
  const [trialAttachments, setTrialAttachments] = useState([])
  const [trialInputCapabilities, setTrialInputCapabilities] = useState(null)
  const [trialCloseConfirmVisible, setTrialCloseConfirmVisible] = useState(false)
  const [endingTrial, setEndingTrial] = useState(false)
  const [trialSendingElapsedSec, setTrialSendingElapsedSec] = useState(0)
  const [trialUserLlmConfigs, setTrialUserLlmConfigs] = useState([])
  const [trialSelectedUserLlmConfigId, setTrialSelectedUserLlmConfigId] = useState(null)
  const [trialUseSessionTempKey, setTrialUseSessionTempKey] = useState(false)
  const [trialTempProvider, setTrialTempProvider] = useState('openai')
  const [trialTempApiUrl, setTrialTempApiUrl] = useState('')
  const [trialTempModel, setTrialTempModel] = useState('')
  const [trialTempApiKey, setTrialTempApiKey] = useState('')
  const trialMessagesRef = useRef(null)
  const trialImageInputRef = useRef(null)
  const trialStreamingMessageIdRef = useRef(null)
  const trialLocalMessageCounterRef = useRef(0)

  // Preview state
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)

  // Dependencies state
  const [dependencies, setDependencies] = useState(null)
  const [loadingDeps, setLoadingDeps] = useState(false)
  const [depsLoaded, setDepsLoaded] = useState(false)

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true)
    try {
      const response = await api.get(`/agents/${id}/reviews`, {
        params: { page: 1, pageSize: 1000 },
      })
      if (response.success) {
        setReviews(response.data?.reviews || [])
      }
    } catch (error) {
      console.error('Failed to load reviews:', error)
    } finally {
      setLoadingReviews(false)
    }
  }, [id])

  const loadTrialSession = useCallback(async (sessionId, nextRemainingTrials = remainingTrials) => {
    const res = await getTrialSession(sessionId)
    if (!res.success) return

    setTrialSessionId(res.data.session.id)
    setTrialSessionStatus(res.data.session.status)
    setRemainingTrials(nextRemainingTrials)
    setTrialProvisioning(res.data.session.metadata?.provisioning || null)
    setTrialExpiresAt(res.data.session.expires_at)
    setTrialMessages(
      res.data.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        attachments: Array.isArray(msg.metadata?.attachments) ? msg.metadata.attachments : [],
        time: msg.created_at,
        statusLines: [],
        streaming: false,
      }))
    )
    setTrialLoaded(res.data.session.status !== 'provisioning')
  }, [remainingTrials])

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
    setTrialProvisioning(null)
    setTrialExpiresAt(null)
    setTrialAttachments([])
    setTrialInputCapabilities(null)
    setTrialCloseConfirmVisible(false)
    setEndingTrial(false)
    setTrialSendingElapsedSec(0)
    setTrialUserLlmConfigs([])
    setTrialSelectedUserLlmConfigId(null)
    setTrialUseSessionTempKey(false)
    setTrialTempProvider('openai')
    setTrialTempApiUrl('')
    setTrialTempModel('')
    setTrialTempApiKey('')
    setInstallWizardVisible(false)
    setInstallOptionsLoading(false)
    setInstallPreviewLoading(false)
    setInstallCommandLoading(false)
    setInstallFeedbackSubmitting(false)
    setInstallHistoryLoading(false)
    setInstallOptionsData(null)
    setInstallMode('full')
    setInstallSelectedFiles([])
    setInstallPreviewData(null)
    setInstallCommandData(null)
    setInstallHistoryData({ events: [], summary: null })
    trialStreamingMessageIdRef.current = null
    trialLocalMessageCounterRef.current = 0
  }, [dispatch, id, loadReviews])

  useEffect(() => {
    if (!trialSending) {
      setTrialSendingElapsedSec(0)
      return
    }

    const startedAt = Date.now()
    const timerId = window.setInterval(() => {
      setTrialSendingElapsedSec(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [trialSending])

  useEffect(() => {
    if (!trialVisible || !trialSessionId) return
    if (trialSending) return
    if (!shouldPollTrialSession(trialSessionStatus, trialProvisioning?.stage)) return

    let cancelled = false
    let timerId = null

    const pollSession = async () => {
      try {
        await loadTrialSession(trialSessionId)
      } catch (error) {
        console.error('Failed to poll trial session:', error)
      }

      if (!cancelled) {
        timerId = window.setTimeout(pollSession, TRIAL_POLL_INTERVAL_MS)
      }
    }

    timerId = window.setTimeout(pollSession, TRIAL_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timerId) {
        window.clearTimeout(timerId)
      }
    }
  }, [loadTrialSession, trialVisible, trialSessionId, trialSessionStatus, trialProvisioning?.stage, trialSending])

  useEffect(() => {
    if (!trialVisible || !trialMessagesRef.current) return
    trialMessagesRef.current.scrollTop = trialMessagesRef.current.scrollHeight
  }, [trialVisible, trialMessages, trialSending, trialSessionStatus, trialProvisioning])

  const buildLocalTrialMessage = (payload) => {
    const nextId = `local-${Date.now()}-${trialLocalMessageCounterRef.current}`
    trialLocalMessageCounterRef.current += 1
    return {
      id: nextId,
      statusLines: [],
      streaming: false,
      ...payload,
    }
  }

  const appendTrialMessage = (payload) => {
    setTrialMessages((prev) => [...prev, buildLocalTrialMessage(payload)])
  }

  const updateStreamingAssistantMessage = (updater) => {
    const currentId = trialStreamingMessageIdRef.current
    if (!currentId) return

    setTrialMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== currentId) return msg
        return updater(msg)
      })
    )
  }

  const startStreamingAssistantMessage = (initialStatus) => {
    const messageId = `stream-${Date.now()}-${trialLocalMessageCounterRef.current}`
    trialLocalMessageCounterRef.current += 1
    trialStreamingMessageIdRef.current = messageId

    setTrialMessages((prev) => [
      ...prev,
      {
        id: messageId,
        role: 'assistant',
        content: '',
        statusLines: initialStatus ? [initialStatus] : [],
        streaming: true,
      },
    ])
  }

  const appendStreamingStatusLine = (line) => {
    const nextLine = String(line || '').trim()
    if (!nextLine) return

    updateStreamingAssistantMessage((msg) => {
      const currentLines = Array.isArray(msg.statusLines) ? [...msg.statusLines] : []
      const lastLine = currentLines[currentLines.length - 1]

      if (lastLine === nextLine) {
        return msg
      }

      if (
        (nextLine.startsWith('正在持续执行中') && lastLine?.startsWith('正在持续执行中')) ||
        (nextLine.startsWith('消息已排队，已等待') && lastLine?.startsWith('消息已排队，已等待'))
      ) {
        currentLines[currentLines.length - 1] = nextLine
      } else {
        currentLines.push(nextLine)
      }

      return {
        ...msg,
        statusLines: currentLines.slice(-5),
      }
    })
  }

  const appendStreamingAssistantDelta = (delta) => {
    const nextDelta = typeof delta === 'string' ? delta : ''
    if (!nextDelta) return

    updateStreamingAssistantMessage((msg) => ({
      ...msg,
      content: `${msg.content || ''}${nextDelta}`,
      streaming: true,
    }))
  }

  const finalizeStreamingAssistantMessage = (content) => {
    updateStreamingAssistantMessage((msg) => ({
      ...msg,
      content: content || msg.content,
      streaming: false,
    }))
  }

  const removeStreamingAssistantMessage = () => {
    const currentId = trialStreamingMessageIdRef.current
    if (!currentId) return

    setTrialMessages((prev) => prev.filter((msg) => msg.id !== currentId))
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

  const buildSelectedFilesForMode = (mode, optionsData) => {
    if (!optionsData?.defaults) return []
    if (mode === 'custom') return []
    return optionsData.defaults[mode] || []
  }

  const handleOpenInstallWizard = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }

    setInstallWizardVisible(true)
    setInstallOptionsLoading(true)
    setInstallHistoryLoading(true)
    setInstallPreviewData(null)
    setInstallCommandData(null)
    try {
      const [optionsResponse, historyResponse] = await Promise.all([
        getAgentInstallOptions(id),
        getAgentInstallHistory(id, { limit: 8 }),
      ])
      if (optionsResponse.success) {
        const optionsData = optionsResponse.data
        const nextMode = optionsData.recommendedMode || 'full'
        const nextSelected = buildSelectedFilesForMode(nextMode, optionsData)
        setInstallOptionsData(optionsData)
        setInstallMode(nextMode)
        setInstallSelectedFiles(nextSelected)
        if (nextMode !== 'custom') {
          await handleRunInstallPreview({ mode: nextMode, selectedFiles: nextSelected })
        }
      }
      if (historyResponse.success) {
        setInstallHistoryData(historyResponse.data || { events: [], summary: null })
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '获取安装选项失败')
      setInstallWizardVisible(false)
    } finally {
      setInstallOptionsLoading(false)
      setInstallHistoryLoading(false)
    }
  }

  const handleRunInstallPreview = async (payload = {}) => {
    setInstallPreviewLoading(true)
    try {
      const response = await previewAgentInstallPlan(id, {
        mode: payload.mode || installMode,
        selectedFiles: payload.selectedFiles || installSelectedFiles,
      })
      if (response.success) {
        setInstallPreviewData(response.data)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '安装预检失败')
    } finally {
      setInstallPreviewLoading(false)
    }
  }

  const handleGenerateInstallCommand = async () => {
    setInstallCommandLoading(true)
    try {
      const response = await getAgentInstallCommand(id, {
        mode: installMode,
        selectedFiles: installMode === 'custom' ? installSelectedFiles : undefined,
      })
      if (response.success) {
        setInstallCommandData(response.data)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '获取安装命令失败')
    } finally {
      setInstallCommandLoading(false)
    }
  }

  const handleChangeInstallMode = (event) => {
    const nextMode = event.target.value
    setInstallMode(nextMode)
    if (nextMode === 'custom') {
      setInstallSelectedFiles([])
      setInstallPreviewData(null)
      setInstallCommandData(null)
      return
    }
    const defaults = installOptionsData?.defaults?.[nextMode] || []
    setInstallSelectedFiles(defaults)
    setInstallCommandData(null)
    void handleRunInstallPreview({ mode: nextMode, selectedFiles: defaults })
  }

  const handleChangeInstallSelectedFiles = (checkedValues) => {
    const nextFiles = checkedValues.map((item) => String(item))
    setInstallSelectedFiles(nextFiles)
    setInstallCommandData(null)
  }

  const handleCopyInstallCommand = async () => {
    const command = installCommandData?.installCommand
    if (!command) return

    try {
      await navigator.clipboard.writeText(command)
      message.success('安装命令已复制')
    } catch (error) {
      message.error('复制失败，请手动复制')
    }
  }

  const handleCopyDownloadCommand = async () => {
    const command = installCommandData?.downloadCommand
    if (!command) return

    try {
      await navigator.clipboard.writeText(command)
      message.success('下载命令已复制')
    } catch (error) {
      message.error('复制失败，请手动复制')
    }
  }

  const handleReportInstallFeedback = async (status) => {
    if (!installCommandData?.installCommand || installFeedbackSubmitting) {
      return
    }

    let errorMessage = null
    let reasonCategory = null
    if (status === 'failed') {
      const categoryInput = window.prompt(
        '可选：失败分类（timeout/network/auth/dependency/validation/storage/permission/other）',
        'other'
      )
      const normalizedCategory = String(categoryInput || '').trim().toLowerCase()
      if (normalizedCategory) {
        const supported = new Set([
          'timeout',
          'network',
          'auth',
          'dependency',
          'validation',
          'storage',
          'permission',
          'other',
          'unknown',
        ])
        reasonCategory = supported.has(normalizedCategory) ? normalizedCategory : 'other'
      }
      const reason = window.prompt('可选：填写安装失败原因，便于后续优化（可留空）', '')
      errorMessage = reason ? String(reason).trim() : null
    }

    setInstallFeedbackSubmitting(true)
    try {
      const response = await reportAgentInstallFeedback(id, {
        mode: installMode,
        status,
        includedFiles: installCommandData?.includedFiles || [],
        errorMessage,
        metadata: {
          from: 'agent_detail_install_wizard',
          ...(reasonCategory ? { reason_category: reasonCategory } : {}),
        },
      })
      if (response.success) {
        message.success(status === 'success' ? '已记录安装成功' : '已记录安装失败')
        const historyRes = await getAgentInstallHistory(id, { limit: 8 })
        if (historyRes.success) {
          setInstallHistoryData(historyRes.data || { events: [], summary: null })
        }
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '记录安装反馈失败')
    } finally {
      setInstallFeedbackSubmitting(false)
    }
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

  const loadTrialCapabilities = async (sessionId) => {
    try {
      const res = await getTrialSessionCapabilities(sessionId)
      if (res.success) {
        setTrialInputCapabilities(res.data?.input || null)
      }
    } catch (error) {
      console.error('Failed to load trial capabilities:', error)
    }
  }

  const loadTrialUserLlmConfigs = async () => {
    try {
      const res = await listMyLlmConfigs()
      if (res.success) {
        const configs = res.data?.configs || []
        setTrialUserLlmConfigs(configs)
        const defaultConfig = configs.find((item) => item.is_default && item.is_enabled) || configs.find((item) => item.is_enabled)
        setTrialSelectedUserLlmConfigId(defaultConfig?.id || null)
      }
    } catch (error) {
      console.error('Failed to load user llm configs:', error)
      setTrialUserLlmConfigs([])
      setTrialSelectedUserLlmConfigId(null)
    }
  }

  const openTrialModal = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    setTrialVisible(true)
    await loadTrialUserLlmConfigs()
    if (trialSessionId) {
      try {
        await loadTrialSession(trialSessionId)
        await loadTrialCapabilities(trialSessionId)
      } catch (error) {
        console.error('Failed to refresh existing trial session:', error)
      }
      return
    }

    try {
      const res = await createTrialSession(id)
      if (res.success) {
        setTrialSessionId(res.data.sessionId)
        setTrialSessionStatus(res.data.status)
        setRemainingTrials(res.data.remainingTrials)
        setTrialProvisioning(res.data.provisioning || null)
        setTrialExpiresAt(res.data.expiresAt)
        setTrialMessages([])
        setTrialLoaded(res.data.status !== 'provisioning')
        await loadTrialCapabilities(res.data.sessionId)

        if (res.data.status !== 'provisioning') {
          await loadTrialSession(res.data.sessionId, res.data.remainingTrials)
        }
      }
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data?.error || '无法创建试用会话'
      message.error(errMsg)
      setTrialVisible(false)

      try {
        await refreshRemainingTrials()
      } catch {
        // noop
      }
    }
  }

  const handleEndTrial = async ({ closeModal = true } = {}) => {
    if (!trialSessionId) {
      if (closeModal) setTrialVisible(false)
      return
    }

    try {
      setEndingTrial(true)
      await endTrialSession(trialSessionId)
      message.success('试用会话已结束')
      if (closeModal) {
        setTrialVisible(false)
      }
      setTrialCloseConfirmVisible(false)
      setTrialMessages([])
      setTrialInput('')
      setTrialLoaded(false)
      setTrialSessionId(null)
      setTrialProvisioning(null)
      setTrialExpiresAt(null)
      setTrialInputCapabilities(null)
      setTrialSessionStatus('completed')
      setTrialUseSessionTempKey(false)
      setTrialTempApiKey('')
      trialStreamingMessageIdRef.current = null
      await refreshRemainingTrials()
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.response?.data?.error || '结束试用失败'
      message.error(errMsg)
    } finally {
      setEndingTrial(false)
    }
  }

  const handleRequestCloseTrialModal = () => {
    if (!trialSessionId || ['completed', 'expired', 'failed'].includes(trialSessionStatus)) {
      setTrialVisible(false)
      return
    }

    setTrialCloseConfirmVisible(true)
  }

  const handleKeepTrialSession = () => {
    setTrialCloseConfirmVisible(false)
    setTrialVisible(false)
  }

  const handleOpenTrialImagePicker = () => {
    trialImageInputRef.current?.click()
  }

  const handleRemoveTrialAttachment = (attachmentId) => {
    setTrialAttachments((prev) => prev.filter((item) => item.id !== attachmentId))
  }

  const handleSelectTrialImages = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    if (trialAttachments.length >= TRIAL_MAX_ATTACHMENTS_PER_MESSAGE) {
      message.warning(`单条消息最多 ${TRIAL_MAX_ATTACHMENTS_PER_MESSAGE} 张图片`)
      return
    }

    const availableSlots = Math.max(0, TRIAL_MAX_ATTACHMENTS_PER_MESSAGE - trialAttachments.length)
    const selectedFiles = files.slice(0, availableSlots)
    const nextAttachments = []

    for (const file of selectedFiles) {
      if (!TRIAL_IMAGE_MIME_WHITELIST.has(file.type)) {
        message.warning(`${file.name} 格式不支持，仅支持 PNG/JPEG/WEBP/GIF`)
        continue
      }

      if (file.size > TRIAL_MAX_IMAGE_BYTES) {
        message.warning(`${file.name} 超过 5MB 限制`)
        continue
      }

      try {
        const dataUrl = await readFileAsDataUrl(file)
        nextAttachments.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          kind: 'image',
          mimeType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
          dataUrl,
        })
      } catch (error) {
        message.error(`${file.name} 读取失败`)
      }
    }

    if (nextAttachments.length > 0) {
      setTrialAttachments((prev) => [...prev, ...nextAttachments].slice(0, TRIAL_MAX_ATTACHMENTS_PER_MESSAGE))
    }
  }

  const handleTrialSend = async () => {
    if (trialAttachments.length > 0 && !canUseTrialImageInput) {
      message.warning('当前试用模型未启用图片理解，请先切换支持视觉能力的模型')
      return
    }

    if (
      (!trialInput.trim() && trialAttachments.length === 0) ||
      trialSending ||
      remainingTrials <= 0 ||
      !trialSessionId ||
      !['active', 'provisioning'].includes(trialSessionStatus)
    ) {
      return
    }

    const userMsg = trialInput.trim()
    const outgoingAttachments = [...trialAttachments]
    const runtimeOverride = trialUseSessionTempKey
      ? {
          provider: trialTempProvider,
          apiUrl: trialTempApiUrl,
          model: trialTempModel,
          apiKey: trialTempApiKey,
          authType: trialTempProvider === 'anthropic' ? 'x-api-key' : 'bearer',
        }
      : null

    if (trialUseSessionTempKey && (!trialTempApiUrl.trim() || !trialTempModel.trim() || !trialTempApiKey.trim())) {
      message.warning('请完整填写会话临时 Key 的 Base URL、模型和 API Key')
      return
    }

    const payload = {
      message: userMsg,
      attachments: outgoingAttachments,
      userLlmConfigId: trialSelectedUserLlmConfigId || null,
      runtimeOverride,
    }

    setTrialInput('')
    setTrialAttachments([])
    appendTrialMessage({ role: 'user', content: userMsg, attachments: outgoingAttachments })
    startStreamingAssistantMessage(
      trialSessionStatus === 'provisioning'
        ? '消息已排队，正在等待试用环境就绪'
        : (
            trialSessionStatus === 'active' &&
            Boolean(trialProvisioning?.stage) &&
            !['ready', 'failed'].includes(trialProvisioning.stage)
          )
          ? '消息已发送，正在等待流式引擎完成预热'
          : '消息已发送，正在进入试用沙盒'
    )
    setTrialSending(true)

    const sendWithStream = async (confirmMediumRisk = false) => {
      let finalEvent = null
      await streamTrialSessionMessage(
        trialSessionId,
        {
          ...payload,
          confirmMediumRisk,
        },
        {
          onEvent: ({ event, data }) => {
            if (event === 'status' || event === 'heartbeat') {
              if (data?.sessionStatus) {
                setTrialSessionStatus(data.sessionStatus)
                setTrialLoaded(data.sessionStatus !== 'provisioning')
              }
              if (data?.provisioning) {
                setTrialProvisioning(data.provisioning)
              }
              appendStreamingStatusLine(data?.message)
              return
            }

            if (event === 'delta') {
              appendStreamingAssistantDelta(data?.delta || '')
              return
            }

            if (event === 'done') {
              finalEvent = data
              finalizeStreamingAssistantMessage(data?.response || '')
              setTrialSessionStatus(data?.status || 'active')
              setTrialProvisioning({ stage: 'ready', detail: '试用环境已就绪' })
              setTrialExpiresAt(data?.expiresAt || null)
            }
          },
        }
      )
      return finalEvent
    }

    try {
      let finalEvent = await sendWithStream(false)

      if (!finalEvent && trialSessionId) {
        await loadTrialSession(trialSessionId)
      }
    } catch (error) {
      if (error.response?.data?.error?.code === 'trial_medium_risk_confirmation_required') {
        const findingsSummary = error.response?.data?.error?.summary
        const continueSend = await new Promise((resolve) => {
          Modal.confirm({
            title: '检测到中敏感信息',
            content: findingsSummary || '输入中包含姓名/邮箱/手机号等中敏感信息，确认继续发送吗？',
            okText: '确认继续发送',
            cancelText: '取消',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          })
        })

        if (continueSend) {
          try {
            await sendWithStream(true)
            return
          } catch (retryError) {
            removeStreamingAssistantMessage()
            message.error(retryError.response?.data?.error?.message || '发送失败')
          }
        } else {
          removeStreamingAssistantMessage()
          message.warning('你已取消发送该条消息')
        }
        return
      }

      removeStreamingAssistantMessage()
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
      trialStreamingMessageIdRef.current = null
      setTrialSending(false)
    }
  }

  const handleTabChange = (key) => {
    if (key === 'preview') loadPreview()
    if (key === 'dependencies') loadDependencies()
  }

  const trialStatusMeta = TRIAL_STATUS_META[trialSessionStatus] || { label: trialSessionStatus || '未开始', color: 'default' }
  const provisioningMeta = TRIAL_PROVISIONING_STAGE_META[trialProvisioning?.stage] || null
  const publishStatusMeta = AGENT_PUBLISH_STATUS_META[currentAgent?.publish_status] || {
    label: currentAgent?.publish_status || '未知',
    color: 'default',
  }
  const isTrialPreparing = trialSessionStatus === 'provisioning'
  const isTrialWarming =
    trialSessionStatus === 'active' &&
    Boolean(trialProvisioning?.stage) &&
    !['ready', 'failed'].includes(trialProvisioning.stage)
  const showTrialProvisioning = isTrialPreparing || isTrialWarming
  const canInteractWithTrialSession =
    !!trialSessionId && ['active', 'provisioning'].includes(trialSessionStatus)
  const canUseTrialImageInput = trialInputCapabilities?.imageInputEnabled !== false
  const hasTrialInputPayload = !!trialInput.trim() || trialAttachments.length > 0
  const canSendTrialMessage =
    remainingTrials > 0 &&
    hasTrialInputPayload &&
    !trialSending &&
    canInteractWithTrialSession
  const trialPlaceholder =
    remainingTrials <= 0
      ? '试用次数已用完'
      : isTrialPreparing
        ? '可以先输入问题，消息会在环境就绪后自动发送...'
        : isTrialWarming
          ? '可以先输入问题，后台仍在预热流式引擎，首条回复可能稍慢...'
        : trialSessionStatus === 'failed'
          ? '试用环境准备失败，请重新开始'
          : '输入消息，或上传图片后发送...'
  const installAvailableFiles = installOptionsData?.availableFiles || []
  const installGroupedFiles = installAvailableFiles.reduce((acc, file) => {
    const group = file.group || 'other'
    if (!acc[group]) acc[group] = []
    acc[group].push(file)
    return acc
  }, {})
  const installGroupLabel = {
    core: '核心人格',
    rules: '行为规则',
    capability: '能力扩展',
    docs: '说明文档',
    other: '其他文件',
  }
  const canRunInstallPreview = installMode !== 'custom' || installSelectedFiles.length > 0

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
      label: (
        <span><FileTextOutlined /> 概述</span>
      ),
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
        <span><AppstoreOutlined /> 包内容</span>
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
                    <div style={{ background: 'var(--surface-muted)', padding: 16, borderRadius: 8 }}>
                      <ReactMarkdown>{preview[f.key]}</ReactMarkdown>
                    </div>
                  ),
                }))}
            />
          ) : (
            <p style={{ color: 'var(--ink-muted)' }}>无法加载包内容预览</p>
          )}
        </div>
      ),
    },
    {
      key: 'dependencies',
      label: (
        <span><ApartmentOutlined /> 依赖</span>
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
                <p style={{ color: 'var(--ink-muted)' }}>此 Agent 没有声明 Skill/MCP 依赖</p>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--ink-muted)' }}>无法加载依赖信息</p>
          )}
        </div>
      ),
    },
    {
      key: 'usage',
      label: (
        <span><ReadOutlined /> 使用说明</span>
      ),
      children: (
        <div>
          <h3>安装</h3>
          <pre style={{ background: 'var(--surface-muted)', padding: 16, borderRadius: 8 }}>
            {`# 下载 Agent 包\nclewopen download ${currentAgent.name}\n\n# 安装到本地\nclewopen install ${currentAgent.name}`}
          </pre>

          <h3>基本用法</h3>
          <pre style={{ background: 'var(--surface-muted)', padding: 16, borderRadius: 8 }}>
            {`# 运行 Agent\nclewopen run ${currentAgent.name} --input "your input"`}
          </pre>
        </div>
      ),
    },
    {
      key: 'reviews',
      label: (
        <span><MessageOutlined /> 评价</span>
      ),
      children: (
        <div>
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
                <p style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </Card>
            ))
          ) : (
            <p>暂无评价</p>
          )}

          <Divider />
          <Button type="primary" onClick={handleRate}>
            写评价
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="page-shell" style={{ paddingTop: 10 }}>
      <div style={{ marginBottom: 18 }}>
        <p className="section-label">{currentAgent.category || 'Agent Detail'}</p>
      </div>
      <Row gutter={24}>
        <Col span={16}>
          <Card className="cream-panel">
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)', marginBottom: 12 }}>{currentAgent.name}</h1>
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

            <Tabs
              items={tabItems}
              onChange={handleTabChange}
              className="agent-detail-tabs"
              animated={{ inkBar: true, tabPane: true }}
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card className="cream-panel" style={{ position: 'sticky', top: 86 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: '100%',
                  height: 200,
                  background: 'linear-gradient(135deg, #1f49bc 0%, #5c79d3 100%)',
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
              icon={<LinkOutlined />}
              style={{ marginBottom: 12 }}
              onClick={handleOpenInstallWizard}
              disabled={currentAgent.review_stage !== 'published'}
            >
              安装 Agent
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

            <Divider />

            <div style={{ marginBottom: 16 }}>
              <h4>发布状态</h4>
              <p>
                <strong>状态:</strong>{' '}
                <Tag color={publishStatusMeta.color}>{publishStatusMeta.label}</Tag>
              </p>
              <p>
                <strong>分发模式:</strong> {AGENT_PUBLISH_MODE_META[currentAgent.publish_mode] || currentAgent.publish_mode || '-'}
              </p>
              <p>
                <strong>发布渠道:</strong> {currentAgent.package_registry || '-'}
              </p>
              <p>
                <strong>包名:</strong> {currentAgent.package_name || '-'}
              </p>
              <p>
                <strong>仓库:</strong>{' '}
                {currentAgent.repository_url ? (
                  <a href={currentAgent.repository_url} target="_blank" rel="noreferrer">
                    查看仓库
                  </a>
                ) : (
                  '-'
                )}
              </p>
              <p>
                <strong>最近发布时间:</strong>{' '}
                {currentAgent.last_published_at
                  ? new Date(currentAgent.last_published_at).toLocaleString()
                  : '-'}
              </p>
            </div>

            <div>
              <h4 style={{ marginTop: 0 }}>Agent 信息</h4>
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

      <Modal
        title="安装 Agent"
        open={installWizardVisible}
        onCancel={() => setInstallWizardVisible(false)}
        width={760}
        footer={[
          <Button key="close" onClick={() => setInstallWizardVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        {installOptionsLoading ? (
          <Spin />
        ) : (
          <div>
            <div style={{ marginBottom: 16 }}>
              <strong>选择安装模式</strong>
              <Radio.Group
                onChange={handleChangeInstallMode}
                value={installMode}
                style={{ display: 'block', marginTop: 12 }}
              >
                {Object.entries(INSTALL_MODE_META).map(([key, meta]) => (
                  <Radio key={key} value={key} style={{ display: 'block', marginBottom: 8 }}>
                    {meta.label}
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginLeft: 24 }}>{meta.description}</div>
                  </Radio>
                ))}
              </Radio.Group>
            </div>

            {installMode === 'custom' && (
              <div style={{ marginBottom: 16 }}>
                <strong>选择要导入的文件</strong>
                {Object.entries(installGroupedFiles).map(([group, files]) => (
                  <div key={group} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>
                      {installGroupLabel[group] || group}
                    </div>
                    <Checkbox.Group
                      value={installSelectedFiles}
                      onChange={handleChangeInstallSelectedFiles}
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                    >
                      {files.map((item) => (
                        <Checkbox key={item.path} value={item.path}>
                          {item.path}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Button
                onClick={() => handleRunInstallPreview()}
                loading={installPreviewLoading}
                disabled={!canRunInstallPreview}
              >
                运行安装预检
              </Button>
              <Button
                type="primary"
                onClick={handleGenerateInstallCommand}
                loading={installCommandLoading}
                disabled={!canRunInstallPreview}
              >
                生成安装命令
              </Button>
              <Button onClick={handleCopyInstallCommand} disabled={!installCommandData?.installCommand}>
                复制命令
              </Button>
            </div>

            {installPreviewData && (
              <div style={{ marginBottom: 12 }}>
                <Alert
                  type="info"
                  showIcon
                  message={`预检结果：将导入 ${installPreviewData.summary?.selectedCount || 0} 个文件`}
                  description={`潜在冲突 ${installPreviewData.summary?.conflictsCount || 0}，按模式跳过 ${installPreviewData.summary?.skippedCount || 0}，缺失依赖 ${installPreviewData.summary?.missingDependencyCount || 0}`}
                />
                {Array.isArray(installPreviewData.planDetails?.willInstall) && installPreviewData.planDetails.willInstall.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>将导入文件</div>
                    <div style={{ maxHeight: 120, overflow: 'auto', border: '1px solid var(--line-soft)', borderRadius: 8, padding: 8 }}>
                      {installPreviewData.planDetails.willInstall.map((file) => (
                        <div key={file} style={{ fontSize: 12 }}>{file}</div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(installPreviewData.planDetails?.skippedByMode) && installPreviewData.planDetails.skippedByMode.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>按模式跳过</div>
                    <div style={{ maxHeight: 90, overflow: 'auto', border: '1px dashed var(--line-soft)', borderRadius: 8, padding: 8 }}>
                      {installPreviewData.planDetails.skippedByMode.map((file) => (
                        <div key={file} style={{ fontSize: 12 }}>{file}</div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(installPreviewData.warnings) && installPreviewData.warnings.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {installPreviewData.warnings.map((warning) => (
                      <Alert key={warning} style={{ marginBottom: 8 }} type="warning" showIcon message={warning} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {installCommandData?.installHint && (
              <Alert
                style={{ marginBottom: 12 }}
                type="info"
                showIcon
                message={installCommandData.installHint}
              />
            )}
            {installCommandData?.expiresAt && (
              <p style={{ marginBottom: 8 }}>
                <strong>命令过期时间:</strong> {new Date(installCommandData.expiresAt).toLocaleString()}
              </p>
            )}
            <Input.TextArea
              value={installCommandData?.installCommand || ''}
              placeholder="先运行预检，再生成安装命令"
              autoSize={{ minRows: 3, maxRows: 6 }}
              readOnly
            />
            {Array.isArray(installCommandData?.includedFiles) && installCommandData.includedFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>
                  命令对应文件清单（{installCommandData.includedFiles.length}）
                </div>
                <div style={{ maxHeight: 100, overflow: 'auto', border: '1px solid var(--line-soft)', borderRadius: 8, padding: 8 }}>
                  {installCommandData.includedFiles.map((file) => (
                    <div key={file} style={{ fontSize: 12 }}>{file}</div>
                  ))}
                </div>
              </div>
            )}
            {installCommandData?.installCommand && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <Button
                  size="small"
                  type="primary"
                  loading={installFeedbackSubmitting}
                  onClick={() => handleReportInstallFeedback('success')}
                >
                  我已安装成功
                </Button>
                <Button
                  size="small"
                  danger
                  loading={installFeedbackSubmitting}
                  onClick={() => handleReportInstallFeedback('failed')}
                >
                  安装失败，提交反馈
                </Button>
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="small" onClick={handleCopyDownloadCommand} disabled={!installCommandData?.downloadCommand}>
                复制下载命令
              </Button>
              <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>如安装失败，可先下载 zip 再本地导入</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>最近安装记录</div>
              {installHistoryData?.summary && (
                <div style={{ color: 'var(--ink-muted)', fontSize: 12, marginBottom: 8 }}>
                  总计 {installHistoryData.summary.total || 0} 次，成功 {installHistoryData.summary.successCount || 0} 次，失败 {installHistoryData.summary.failedCount || 0} 次
                </div>
              )}
              {installHistoryLoading ? (
                <Spin size="small" />
              ) : Array.isArray(installHistoryData?.events) && installHistoryData.events.length > 0 ? (
                <div style={{ border: '1px solid var(--line-soft)', borderRadius: 8, padding: 8, maxHeight: 160, overflow: 'auto' }}>
                  {installHistoryData.events.map((event) => (
                    <div key={event.id} style={{ marginBottom: 8, fontSize: 12 }}>
                      <Tag color={event.status === 'success' ? 'success' : 'error'}>
                        {event.status === 'success' ? '成功' : '失败'}
                      </Tag>
                      <span style={{ marginRight: 8 }}>模式: {event.mode}</span>
                      <span style={{ color: 'var(--ink-muted)' }}>{new Date(event.created_at).toLocaleString()}</span>
                      {event.error_message && (
                        <div style={{ color: '#b42318', marginTop: 2 }}>原因: {event.error_message}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>暂无安装记录</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 试用沙盒弹窗 */}
      <Modal
        title={(
          <div>
            <div>{`试用 ${currentAgent.name}`}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
              你可以先输入问题，消息会在试用环境就绪后自动处理
            </div>
          </div>
        )}
        open={trialVisible}
        onCancel={handleRequestCloseTrialModal}
        footer={null}
        width={760}
        rootClassName="agent-trial-modal"
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {trialSessionStatus && (
              <Tag color={trialStatusMeta.color} style={{ fontSize: 11 }}>
                会话状态: {trialStatusMeta.label}
              </Tag>
            )}
          </div>
          <Tag color={remainingTrials > 0 ? 'blue' : 'red'} style={{ fontSize: 11 }}>
            剩余试用次数: {remainingTrials}
          </Tag>
        </div>

        {trialExpiresAt && (
          <div style={{ marginBottom: 12, color: 'var(--ink-muted)', fontSize: 12 }}>
            会话有效期至: {new Date(trialExpiresAt).toLocaleString()}
          </div>
        )}

        {showTrialProvisioning && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                border: '1px solid color-mix(in srgb, var(--accent-blue) 30%, #fff 70%)',
                background: 'color-mix(in srgb, var(--accent-blue) 7%, #fff 93%)',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {provisioningMeta?.label || '正在准备试用环境'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {trialProvisioning?.detail ||
                  (isTrialWarming
                    ? '你已经可以输入问题，后台正在继续预热流式引擎。'
                    : '首次试用可能需要 30-90 秒，请稍候。')}
              </div>
            </div>
            <Progress
              percent={provisioningMeta?.percent || 20}
              status="active"
              size="small"
              style={{ marginTop: 8, marginBottom: 0 }}
            />
          </div>
        )}

        {trialSessionStatus === 'failed' && (
          <div style={{ marginBottom: 12 }}>
            <Alert
              type="error"
              showIcon
              message="试用环境准备失败"
              description="可以关闭后重新发起一次试用，或检查当前 Agent/Provider 配置。"
            />
          </div>
        )}

        {trialInputCapabilities && (
          <div style={{ marginBottom: 12 }}>
            <Alert
              type={trialInputCapabilities.imageInputEnabled ? 'success' : 'warning'}
              showIcon
              message={trialInputCapabilities.imageInputEnabled ? '当前试用模型支持图片输入' : '当前试用模型可能不支持图片理解'}
              description={trialInputCapabilities.reason || '可在管理后台切换支持视觉能力的试用模型。'}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <Alert
            type="info"
            showIcon
            message="隐私保护说明"
            description="试用输入默认最小留存并全链路脱敏，结束会话立即清理；试用数据不会用于模型训练，访问行为会记录审计。"
          />
        </div>

        <div
          style={{
            marginBottom: 12,
            border: '1px solid var(--cream-border)',
            borderRadius: 10,
            padding: 12,
            background: '#fff',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>试用模型 Key 来源</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Select
              value={trialSelectedUserLlmConfigId}
              onChange={(value) => setTrialSelectedUserLlmConfigId(value)}
              placeholder="个人中心已配置 Key（可选）"
              allowClear
              options={trialUserLlmConfigs
                .filter((item) => item.is_enabled)
                .map((item) => ({
                  label: `${item.provider_name} / ${item.model_id}${item.is_default ? '（默认）' : ''}`,
                  value: item.id,
                }))}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch checked={trialUseSessionTempKey} onChange={setTrialUseSessionTempKey} />
              <span style={{ fontSize: 12 }}>启用会话临时 Key（最高优先）</span>
            </div>
          </div>

          {trialUseSessionTempKey && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Select
                value={trialTempProvider}
                onChange={setTrialTempProvider}
                options={[
                  { label: 'OpenAI', value: 'openai' },
                  { label: 'Anthropic', value: 'anthropic' },
                  { label: '其他兼容', value: 'other' },
                ]}
              />
              <Input
                value={trialTempModel}
                onChange={(e) => setTrialTempModel(e.target.value)}
                placeholder="模型名"
              />
              <Input
                value={trialTempApiUrl}
                onChange={(e) => setTrialTempApiUrl(e.target.value)}
                placeholder="Base URL"
              />
              <Input.Password
                value={trialTempApiKey}
                onChange={(e) => setTrialTempApiKey(e.target.value)}
                placeholder="API Key"
              />
            </div>
          )}
        </div>

        <div
          ref={trialMessagesRef}
          style={{
          height: 400,
          overflowY: 'auto',
          border: '1px solid var(--cream-border)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 12,
          background: 'color-mix(in srgb, var(--cream-card) 88%, #fff 12%)',
          }}
        >
          {trialMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ink-muted)', marginTop: 160 }}>
              {isTrialPreparing
                ? '试用环境准备中，你已经可以先输入问题并提前排队'
                : isTrialWarming
                  ? '你已经可以输入问题，系统会边预热边开始响应'
                  : trialLoaded
                    ? '环境已就绪，开始与 Agent 对话吧'
                    : '点击开始后这里会展示试用对话'}
            </div>
          )}
          {trialMessages.map((msg, i) => (
            <div
              key={msg.id || i}
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
                background: msg.role === 'user' ? 'var(--accent-blue)' : '#fff',
                color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--cream-border)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}>
                {msg.role === 'assistant' ? (
                  <div>
                    {msg.content ? <ReactMarkdown>{msg.content}</ReactMarkdown> : null}
                    {msg.streaming && (
                      <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Spin size="small" />
                          <span>
                            {msg.statusLines?.[Math.max((msg.statusLines?.length || 1) - 1, 0)] || '正在处理消息'}
                            {trialSendingElapsedSec > 0 ? `，已等待 ${trialSendingElapsedSec}s` : ''}
                          </span>
                        </div>
                        {msg.statusLines?.slice(0, -1).slice(-3).map((line, statusIndex) => (
                          <div key={`${msg.id}-status-${statusIndex}`} style={{ marginTop: 6 }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {msg.content ? <div style={{ marginBottom: msg.attachments?.length ? 8 : 0 }}>{msg.content}</div> : null}
                    {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {msg.attachments.map((attachment) => (
                          <div
                            key={attachment.id || `${msg.id}-${attachment.fileName}`}
                            style={{
                              background: 'rgba(255,255,255,0.2)',
                              borderRadius: 8,
                              padding: '6px 8px',
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <PictureOutlined />
                              <span>{attachment.fileName || '图片附件'}</span>
                            </div>
                            {attachment.dataUrl && (
                              <img
                                src={attachment.dataUrl}
                                alt={attachment.fileName || 'image'}
                                style={{ marginTop: 6, maxWidth: 180, borderRadius: 6, display: 'block' }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {trialAttachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {trialAttachments.map((attachment) => (
              <div
                key={attachment.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid var(--cream-border)',
                  background: '#fff',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 12,
                }}
              >
                <PictureOutlined />
                <span>{attachment.fileName}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveTrialAttachment(attachment.id)}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea
            value={trialInput}
            onChange={(e) => setTrialInput(e.target.value)}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleTrialSend() } }}
            placeholder={isTrialPreparing ? '可以先输入问题，消息会在环境就绪后自动发送...' : trialPlaceholder}
            disabled={remainingTrials <= 0 || trialSending || !canInteractWithTrialSession}
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{ flex: 1 }}
          />
          <input
            ref={trialImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            style={{ display: 'none' }}
            onChange={handleSelectTrialImages}
          />
          <Button
            icon={<PictureOutlined />}
            onClick={handleOpenTrialImagePicker}
            disabled={
              remainingTrials <= 0 ||
              trialSending ||
              !canInteractWithTrialSession ||
              trialAttachments.length >= TRIAL_MAX_ATTACHMENTS_PER_MESSAGE ||
              !canUseTrialImageInput
            }
          >
            图片
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleTrialSend}
            loading={trialSending}
            disabled={!canSendTrialMessage}
          >
            发送
          </Button>
          <Button danger onClick={() => handleEndTrial()} disabled={!trialSessionId} loading={endingTrial}>
            结束试用
          </Button>
        </div>
      </Modal>

      <Modal
        title="关闭试用窗口"
        open={trialCloseConfirmVisible}
        onCancel={() => setTrialCloseConfirmVisible(false)}
        footer={[
          <Button key="continue" onClick={() => setTrialCloseConfirmVisible(false)}>
            继续试用
          </Button>,
          <Button key="keep" onClick={handleKeepTrialSession}>
            保留会话并关闭
          </Button>,
          <Button key="end" type="primary" danger loading={endingTrial} onClick={() => handleEndTrial()}>
            结束试用并关闭
          </Button>,
        ]}
      >
        <p style={{ marginBottom: 8 }}>当前试用会话仍然存在，你可以选择：</p>
        <p style={{ marginBottom: 8 }}>保留会话并关闭：稍后回到本页面继续当前试用。</p>
        <p style={{ marginBottom: 0 }}>结束试用并关闭：立即销毁当前沙盒并释放会话。</p>
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
