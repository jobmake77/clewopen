import { useCallback, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Avatar,
  Button,
  Form,
  Input,
  message,
  List,
  Tag,
  Empty,
  Modal,
  Spin,
  Select,
  Switch,
  Space,
} from 'antd'
import {
  UserOutlined,
  DownloadOutlined,
  StarOutlined,
  EditOutlined,
  LockOutlined,
  ReloadOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { updateProfile } from '../../store/slices/authSlice'
import api from '../../services/api'
import authService from '../../services/authService'
import {
  createMyLlmConfig,
  deleteMyLlmConfig,
  listMyLlmConfigs,
  testMyLlmConfigConnection,
  updateMyLlmConfig,
} from '../../services/userLlmConfigService'
import openaiIcon from '../../assets/provider-icons/openai.svg'
import anthropicIcon from '../../assets/provider-icons/anthropic.svg'
import geminiIcon from '../../assets/provider-icons/gemini.svg'
import kimiIcon from '../../assets/provider-icons/kimi.ico'
import minimaxIcon from '../../assets/provider-icons/minimax.svg'
import './index.css'

const { TextArea } = Input

const llmProviderOptions = [
  {
    label: 'OpenAI',
    value: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    authType: 'bearer',
  },
  {
    label: 'Claude Code',
    value: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-7-sonnet-latest',
    authType: 'x-api-key',
  },
  {
    label: 'Gemini',
    value: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-pro',
    authType: 'bearer',
  },
  {
    label: 'Kimi',
    value: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    authType: 'bearer',
  },
  {
    label: 'MiniMax',
    value: 'minimax',
    baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    model: 'MiniMax-Text-01',
    authType: 'bearer',
  },
]

const providerLabelMap = llmProviderOptions.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const providerIconMap = {
  openai: { src: openaiIcon, alt: 'OpenAI' },
  anthropic: { src: anthropicIcon, alt: 'Claude Code' },
  gemini: { src: geminiIcon, alt: 'Gemini' },
  kimi: { src: kimiIcon, alt: 'Kimi' },
  minimax: { src: minimaxIcon, alt: 'MiniMax' },
}

const llmProviderCatalog = [
  {
    id: 'custom-openai',
    title: 'Custom API (OpenAI-compatible)',
    desc: '自定义 OpenAI 兼容 API 端点',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    authType: 'bearer',
  },
  {
    id: 'claude-code',
    title: 'Claude Code',
    desc: 'Anthropic 官方 API',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-7-sonnet-latest',
    authType: 'x-api-key',
  },
  {
    id: 'gemini',
    title: 'Gemini',
    desc: 'Google Gemini 兼容接口',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-pro',
    authType: 'bearer',
  },
  {
    id: 'kimi',
    title: 'Kimi',
    desc: 'Moonshot 官方 API',
    provider: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    authType: 'bearer',
  },
  {
    id: 'minimax',
    title: 'MiniMax',
    desc: 'MiniMax 官方 API',
    provider: 'minimax',
    baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    model: 'MiniMax-Text-01',
    authType: 'bearer',
  },
]

function ProviderBadge({ provider }) {
  const meta = providerIconMap[provider]
  if (!meta) {
    return (
      <span className="provider-icon provider-icon-default" aria-hidden>
        AI
      </span>
    )
  }
  return (
    <span className="provider-icon" aria-hidden>
      <img className="provider-icon-img" src={meta.src} alt={meta.alt} />
    </span>
  )
}

function UserCenter() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user, isAuthenticated, loading } = useSelector((state) => state.auth)
  const [activeTab, setActiveTab] = useState('profile')
  const [downloads, setDownloads] = useState([])
  const [myAgents, setMyAgents] = useState([])
  const [loadingDownloads, setLoadingDownloads] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [llmConfigs, setLlmConfigs] = useState([])
  const [loadingLlmConfigs, setLoadingLlmConfigs] = useState(false)
  const [savingLlmConfig, setSavingLlmConfig] = useState(false)
  const [testingLlmConfig, setTestingLlmConfig] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [llmForm] = Form.useForm()

  const loadDownloads = useCallback(async () => {
    if (!user?.id) return
    setLoadingDownloads(true)
    try {
      const response = await api.get(`/users/${user.id}/downloads`)
      if (response.success) {
        setDownloads(response.data.downloads || [])
      }
    } catch (error) {
      console.error('Failed to load downloads:', error)
    } finally {
      setLoadingDownloads(false)
    }
  }, [user?.id])

  const loadMyAgents = useCallback(async () => {
    if (!user?.id) return
    setLoadingAgents(true)
    try {
      const response = await api.get(`/users/${user.id}/agents`)
      if (response.success) {
        setMyAgents(response.data.agents || [])
      }
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }, [user?.id])

  const loadMyLlmConfigs = useCallback(async () => {
    if (!user?.id) return
    setLoadingLlmConfigs(true)
    try {
      const response = await listMyLlmConfigs()
      if (response.success) {
        setLlmConfigs(response.data?.configs || [])
      }
    } catch (error) {
      console.error('Failed to load llm configs:', error)
    } finally {
      setLoadingLlmConfigs(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (activeTab === 'downloads') {
      loadDownloads()
    } else if (activeTab === 'agents') {
      loadMyAgents()
    } else if (activeTab === 'llm-config') {
      loadMyLlmConfigs()
    }
  }, [activeTab, loadDownloads, loadMyAgents, loadMyLlmConfigs])

  const handleEditProfile = () => {
    form.setFieldsValue({
      username: user.username,
      bio: user.bio
    })
    setEditModalVisible(true)
  }

  const handleUpdateProfile = async (values) => {
    try {
      await dispatch(updateProfile(values)).unwrap()
      message.success('资料更新成功')
      setEditModalVisible(false)
    } catch (error) {
      message.error(error || '更新失败')
    }
  }

  const handleChangePassword = async (values) => {
    try {
      await authService.changePassword(values.currentPassword, values.newPassword)
      message.success('密码修改成功')
      setPasswordModalVisible(false)
      passwordForm.resetFields()
    } catch (error) {
      message.error(error.response?.data?.error || '修改失败')
    }
  }

  const handleCreateLlmConfig = async (values) => {
    setSavingLlmConfig(true)
    try {
      await createMyLlmConfig(values)
      message.success('模型配置已保存')
      llmForm.resetFields()
      setConnectModalOpen(false)
      await loadMyLlmConfigs()
    } catch (error) {
      message.error(error.response?.data?.error?.message || '保存失败')
    } finally {
      setSavingLlmConfig(false)
    }
  }

  const handleTestLlmConfigDraft = async () => {
    try {
      const values = await llmForm.validateFields(['provider', 'apiUrl', 'model', 'apiKey', 'authType'])
      setTestingLlmConfig(true)
      const response = await testMyLlmConfigConnection({
        provider: values.provider,
        apiUrl: values.apiUrl,
        model: values.model,
        apiKey: values.apiKey,
        authType: values.authType,
      })
      if (response.success) {
        message.success(`连接成功（${response.data?.latencyMs || '-'}ms）`)
      }
    } catch (error) {
      if (error?.errorFields) return
      message.error(error.response?.data?.error?.message || '连接测试失败')
    } finally {
      setTestingLlmConfig(false)
    }
  }

  const handleTestSavedLlmConfig = async (record) => {
    setTestingLlmConfig(true)
    try {
      const response = await testMyLlmConfigConnection({ configId: record.id })
      if (response.success) {
        message.success(`连接成功（${response.data?.latencyMs || '-'}ms）`)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '连接测试失败')
    } finally {
      setTestingLlmConfig(false)
    }
  }

  const handleProviderChange = (provider) => {
    const preset = llmProviderOptions.find((item) => item.value === provider)
    if (!preset) return
    llmForm.setFieldsValue({
      apiUrl: preset.baseUrl,
      model: preset.model,
      authType: preset.authType,
    })
  }

  const handleOpenConnectModal = (providerConfig) => {
    setSelectedProvider(providerConfig)
    llmForm.setFieldsValue({
      provider: providerConfig.provider,
      apiUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      authType: providerConfig.authType,
      apiKey: '',
      isDefault: false,
    })
    setConnectModalOpen(true)
  }

  const handleToggleLlmConfig = async (record, patch) => {
    setSavingLlmConfig(true)
    try {
      await updateMyLlmConfig(record.id, patch)
      await loadMyLlmConfigs()
      message.success('配置已更新')
    } catch (error) {
      message.error(error.response?.data?.error?.message || '更新失败')
    } finally {
      setSavingLlmConfig(false)
    }
  }

  const handleDeleteLlmConfig = async (record) => {
    setSavingLlmConfig(true)
    try {
      await deleteMyLlmConfig(record.id)
      await loadMyLlmConfigs()
      message.success('配置已删除')
    } catch (error) {
      message.error(error.response?.data?.error?.message || '删除失败')
    } finally {
      setSavingLlmConfig(false)
    }
  }

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'profile',
      label: (
        <span>
          <UserOutlined />
          个人资料
        </span>
      ),
      children: (
        <Card className="cream-panel">
          <div className="profile-header">
            <Avatar size={100} icon={<UserOutlined />} src={user.avatar} />
            <div className="profile-info">
              <h2>{user.username}</h2>
              <p style={{ color: 'var(--ink-muted)' }}>{user.email}</p>
              <Tag color={user.role === 'developer' ? 'blue' : 'default'}>
                {user.role === 'developer' ? '开发者' : user.role === 'admin' ? '管理员' : '普通用户'}
              </Tag>
            </div>
          </div>

          <div className="profile-details">
            <div className="detail-item">
              <strong>个人简介:</strong>
              <p>{user.bio || '暂无简介'}</p>
            </div>
            <div className="detail-item">
              <strong>注册时间:</strong>
              <p>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</p>
            </div>
          </div>

          <div className="profile-actions">
            <Button type="primary" icon={<EditOutlined />} onClick={handleEditProfile}>
              编辑资料
            </Button>
            <Button icon={<LockOutlined />} onClick={() => setPasswordModalVisible(true)}>
              修改密码
            </Button>
          </div>

        </Card>
      )
    },
    {
      key: 'llm-config',
      label: (
        <span>
          <ApiOutlined />
          模型配置
        </span>
      ),
      children: (
        <div className="llm-config-page">
          <Card className="cream-panel llm-config-intro">
            <Space align="start">
              <CheckCircleOutlined style={{ color: 'var(--status-success)', marginTop: 4 }} />
              <div>
                <h3 style={{ margin: '0 0 4px' }}>个人模型配置（BYOK）</h3>
                <p style={{ color: 'var(--ink-muted)', margin: 0 }}>
                  Key 仅服务端加密存储，前端不回显明文。试用优先级：会话临时输入 &gt; 个人默认配置 &gt; 平台临时 Key。
                </p>
              </div>
            </Space>
            <div className="llm-provider-chips">
              {llmProviderOptions.map((provider) => (
                <Tag key={provider.value} className="llm-provider-chip">
                  {provider.label}
                </Tag>
              ))}
            </div>
          </Card>

          <div className="llm-config-grid">
            <Card className="cream-panel llm-provider-catalog" title="添加提供商">
              <p className="llm-provider-catalog-hint">选择要连接的提供商。大多数情况下只需填写 API 密钥。</p>
              <List
                dataSource={llmProviderCatalog}
                renderItem={(item) => (
                  <List.Item
                    className="llm-provider-row"
                    actions={[
                      <Button key={`${item.id}-connect`} icon={<PlusOutlined />} onClick={() => handleOpenConnectModal(item)}>
                        连接
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={10}>
                          <ProviderBadge provider={item.provider} />
                          <span>{item.title}</span>
                        </Space>
                      }
                      description={item.desc}
                    />
                  </List.Item>
                )}
              />
            </Card>

            <Card className="cream-panel llm-config-list" title="已保存配置">
              {loadingLlmConfigs ? (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <Spin />
                </div>
              ) : llmConfigs.length > 0 ? (
                <List
                  dataSource={llmConfigs}
                  renderItem={(item) => (
                    <List.Item
                      className="llm-config-item"
                      actions={[
                        <Button
                          key={`${item.id}-default`}
                          type={item.is_default ? 'primary' : 'default'}
                          size="small"
                          onClick={() => handleToggleLlmConfig(item, { isDefault: true, isEnabled: true })}
                          loading={savingLlmConfig}
                        >
                          {item.is_default ? '默认中' : '设为默认'}
                        </Button>,
                        <Switch
                          key={`${item.id}-enabled`}
                          checked={item.is_enabled}
                          onChange={(checked) => handleToggleLlmConfig(item, { isEnabled: checked })}
                          loading={savingLlmConfig}
                        />,
                        <Button
                          key={`${item.id}-test`}
                          size="small"
                          onClick={() => handleTestSavedLlmConfig(item)}
                          loading={testingLlmConfig}
                        >
                          测试连接
                        </Button>,
                        <Button
                          key={`${item.id}-delete`}
                          danger
                          size="small"
                          onClick={() => handleDeleteLlmConfig(item)}
                          loading={savingLlmConfig}
                        >
                          删除
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={8} wrap>
                            <span>{providerLabelMap[item.provider_name] || item.provider_name} / {item.model_id}</span>
                            {item.is_default ? <Tag color="blue">默认</Tag> : null}
                            {!item.is_enabled ? <Tag>已停用</Tag> : null}
                          </Space>
                        }
                        description={
                          <div className="llm-config-item-desc">
                            <div className="llm-config-item-provider">
                              <ProviderBadge provider={item.provider_name} />
                              <strong>{providerLabelMap[item.provider_name] || item.provider_name}</strong>
                            </div>
                            <div><strong>URL:</strong> {item.api_url}</div>
                            <div><strong>Auth:</strong> {item.auth_type || 'bearer'}</div>
                            <div><strong>Key:</strong> {item.apiKeyMasked || '已保存（不回显）'}</div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="你还没有配置个人模型 Key" />
              )}
            </Card>
          </div>

          <Modal
            title={selectedProvider ? `连接 ${selectedProvider.title}` : '连接模型提供商'}
            open={connectModalOpen}
            onCancel={() => setConnectModalOpen(false)}
            footer={null}
            width={620}
          >
            <Form form={llmForm} layout="vertical" onFinish={handleCreateLlmConfig}>
              <Form.Item
                name="provider"
                label="模型厂商"
                rules={[{ required: true, message: '请选择模型厂商' }]}
              >
                <Select
                  placeholder="选择厂商"
                  options={llmProviderOptions.map((item) => ({ label: item.label, value: item.value }))}
                  onChange={handleProviderChange}
                />
              </Form.Item>

              <Form.Item
                name="apiUrl"
                label="Base URL"
                rules={[{ required: true, message: '请输入 Base URL' }]}
              >
                <Input placeholder="https://api.example.com/v1/chat/completions" />
              </Form.Item>

              <Form.Item
                name="model"
                label="默认模型"
                rules={[{ required: true, message: '请输入模型名称' }]}
              >
                <Input placeholder="例如 gpt-4o / claude-3-7-sonnet-latest" />
              </Form.Item>

              <Form.Item
                name="authType"
                label="认证方式"
                initialValue="bearer"
                rules={[{ required: true, message: '请选择认证方式' }]}
              >
                <Select
                  options={[
                    { label: 'Bearer Token', value: 'bearer' },
                    { label: 'x-api-key', value: 'x-api-key' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="apiKey"
                label="API Key"
                rules={[{ required: true, message: '请输入 API Key' }]}
              >
                <Input.Password placeholder="sk-..." />
              </Form.Item>

              <Form.Item name="isDefault" label="设为默认配置" valuePropName="checked">
                <Switch />
              </Form.Item>

              <Space style={{ width: '100%' }}>
                <Button type="default" onClick={handleTestLlmConfigDraft} loading={testingLlmConfig} block>
                  测试连接
                </Button>
                <Button type="primary" htmlType="submit" loading={savingLlmConfig} block>
                  保存配置
                </Button>
              </Space>
            </Form>
          </Modal>
        </div>
      )
    },
    {
      key: 'downloads',
      label: (
        <span>
          <DownloadOutlined />
          下载记录
        </span>
      ),
      children: (
        <Card className="cream-panel">
          {loadingDownloads ? (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <Spin />
            </div>
          ) : downloads.length > 0 ? (
            <List
              dataSource={downloads}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key={`view-${item.agent_id}`}
                      type="link"
                      onClick={() => navigate(`/agent/${item.agent_id}`)}
                    >
                      查看详情
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={item.agent_name}
                    description={`下载时间: ${new Date(item.downloaded_at).toLocaleString()}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无下载记录" />
          )}
        </Card>
      )
    }
  ]

  // 如果是开发者，添加"我的 Agent"标签
  if (user.role === 'developer' || user.role === 'admin') {
    tabItems.push({
      key: 'agents',
      label: (
        <span>
          <StarOutlined />
          我的 Agent
        </span>
      ),
      children: (
        <Card className="cream-panel">
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" onClick={() => navigate('/upload-agent')}>
              上传新 Agent
            </Button>
          </div>

          {loadingAgents ? (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <Spin />
            </div>
          ) : myAgents.length > 0 ? (
            <List
              dataSource={myAgents}
              renderItem={(item) => {
                const statusMap = {
                  pending: { color: 'orange', text: '待审核' },
                  approved: { color: 'green', text: '已通过' },
                  rejected: { color: 'red', text: '已拒绝' }
                }
                const statusInfo = statusMap[item.status] || { color: 'default', text: item.status }
                const rejectionReason = item.metadata?.rejection_reason

                return (
                  <List.Item
                    actions={[
                      <span key="downloads">
                        <DownloadOutlined /> {item.downloads_count || 0}
                      </span>,
                      <span key="rating">
                        <StarOutlined /> {item.rating_average || 0}
                      </span>,
                      item.status === 'approved' ? (
                        <Button
                          key="view"
                          type="link"
                          onClick={() => navigate(`/agent/${item.id}`)}
                        >
                          查看
                        </Button>
                      ) : null,
                      item.status === 'rejected' ? (
                        <Button
                          key="resubmit"
                          type="link"
                          icon={<ReloadOutlined />}
                          onClick={() => navigate('/upload-agent')}
                        >
                          重新提交
                        </Button>
                      ) : null
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={
                        <span>
                          {item.name}
                          <Tag color={statusInfo.color} style={{ marginLeft: 8 }}>
                            {statusInfo.text}
                          </Tag>
                        </span>
                      }
                      description={
                        <div>
                          <p style={{ margin: 0 }}>{item.description}</p>
                          {item.status === 'rejected' && rejectionReason && (
                            <p style={{ color: 'var(--status-danger)', margin: '4px 0 0' }}>
                              拒绝原因: {rejectionReason}
                            </p>
                          )}
                        </div>
                      }
                    />
                    <div>
                      <Tag color="blue">{item.category}</Tag>
                      <Tag>v{item.version}</Tag>
                    </div>
                  </List.Item>
                )
              }}
            />
          ) : (
            <Empty description="暂无发布的 Agent" />
          )}
        </Card>
      )
    })
  }

  return (
    <div className="user-center">
      <p className="section-label">User Center</p>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      {/* 编辑资料弹窗 */}
      <Modal
        title="编辑资料"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          onFinish={handleUpdateProfile}
          layout="vertical"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 位' }
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="bio"
            label="个人简介"
          >
            <TextArea rows={4} placeholder="介绍一下自己..." />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={passwordModalVisible}
        onCancel={() => setPasswordModalVisible(false)}
        footer={null}
      >
        <Form
          form={passwordForm}
          onFinish={handleChangePassword}
          layout="vertical"
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' }
            ]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserCenter
