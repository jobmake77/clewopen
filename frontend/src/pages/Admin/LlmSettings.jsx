import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Select, message, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, SyncOutlined } from '@ant-design/icons'
import { getLlmConfigs, createLlmConfig, updateLlmConfig, activateLlmConfig, healthCheckLlmConfig, deleteLlmConfig } from '../../services/adminLlmService'

function LlmSettings() {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const res = await getLlmConfigs()
      if (res.success) setConfigs(res.data)
    } catch (error) {
      message.error('加载 LLM 配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingConfig(null)
    form.resetFields()
    form.setFieldsValue({
      role: 'trial',
      priority: 100,
      is_enabled: true,
      auth_type: 'bearer',
      max_tokens: 1024,
      temperature: 0.7,
      capabilities: ['chat', 'trial'],
      enable_stream: false,
      include_max_completion_tokens: false,
      include_max_output_tokens: false,
      legacy_openai_format: true,
    })
    setModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingConfig(record)
    form.setFieldsValue({
      provider_name: record.provider_name,
      api_url: record.api_url,
      model_id: record.model_id,
      role: record.role,
      priority: record.priority,
      is_enabled: record.is_enabled,
      auth_type: record.auth_type || 'bearer',
      max_tokens: record.max_tokens,
      temperature: parseFloat(record.temperature),
      capabilities: record.capabilities || ['chat', 'trial'],
      enable_stream: record.enable_stream,
      reasoning_effort: record.reasoning_effort,
      include_max_completion_tokens: record.include_max_completion_tokens,
      include_max_output_tokens: record.include_max_output_tokens,
      legacy_openai_format: record.legacy_openai_format,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      if (editingConfig) {
        const res = await updateLlmConfig(editingConfig.id, values)
        if (res.success) {
          message.success('更新成功')
        }
      } else {
        const res = await createLlmConfig(values)
        if (res.success) {
          message.success('创建成功')
        }
      }
      setModalVisible(false)
      loadConfigs()
    } catch (error) {
      message.error(error.response?.data?.error || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleActivate = async (id) => {
    try {
      const res = await activateLlmConfig(id)
      if (res.success) {
        const poolRefresh = res.data?.poolRefresh
        if (poolRefresh?.message) {
          message.success(`已激活。${poolRefresh.message}`)
        } else {
          message.success('已激活')
        }
        loadConfigs()
      }
    } catch (error) {
      message.error('激活失败')
    }
  }

  const handleHealthCheck = async (id) => {
    try {
      const res = await healthCheckLlmConfig(id)
      if (res.success) {
        message.success(`健康检查成功: ${res.data.response}`)
        loadConfigs()
      }
    } catch (error) {
      message.error(error.response?.data?.error || '健康检查失败')
      loadConfigs()
    }
  }

  const handleDelete = async (id) => {
    try {
      const res = await deleteLlmConfig(id)
      if (res.success) {
        message.success('已删除')
        loadConfigs()
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns = [
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 90,
      render: (role) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: 'Provider',
      dataIndex: 'provider_name',
      key: 'provider_name',
      width: 150,
    },
    {
      title: 'Model',
      dataIndex: 'model_id',
      key: 'model_id',
      width: 200,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: 'API URL',
      dataIndex: 'api_url',
      key: 'api_url',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active) => active ? <Tag color="green">激活</Tag> : <Tag>未激活</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 80,
      render: (enabled) => enabled ? <Tag color="green">启用</Tag> : <Tag color="default">停用</Tag>,
    },
    {
      title: '健康',
      dataIndex: 'last_health_status',
      key: 'last_health_status',
      width: 110,
      render: (status) => {
        const colorMap = {
          healthy: 'green',
          unhealthy: 'red',
          degraded: 'orange',
          unknown: 'default',
        }
        return <Tag color={colorMap[status] || 'default'}>{status || 'unknown'}</Tag>
      },
    },
    {
      title: 'Max Tokens',
      dataIndex: 'max_tokens',
      key: 'max_tokens',
      width: 100,
    },
    {
      title: 'Temperature',
      dataIndex: 'temperature',
      key: 'temperature',
      width: 110,
      render: (v) => parseFloat(v).toFixed(2),
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          {!record.is_active && (
            <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => handleActivate(record.id)}>激活</Button>
          )}
          <Button type="link" size="small" icon={<SyncOutlined />} onClick={() => handleHealthCheck(record.id)}>检查</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="admin-section">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: 'var(--ink-muted)', margin: 0 }}>配置用于 Agent 试用沙盒的多 Provider 路由池。系统会优先使用同角色下已激活且优先级最高的配置，失败时可自动切换到备用配置。</p>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增配置</Button>
      </div>

      <Table
        columns={columns}
        dataSource={configs}
        loading={loading}
        rowKey="id"
        pagination={false}
      />

      <Modal
        title={editingConfig ? '编辑 LLM 配置' : '新增 LLM 配置'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="角色" name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { value: 'trial', label: 'trial' },
                { value: 'default', label: 'default' },
                { value: 'background', label: 'background' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Provider 名称" name="provider_name" rules={[{ required: true, message: '请输入 Provider 名称' }]}>
            <Input placeholder="例如：OpenAI、Anthropic、DeepSeek" />
          </Form.Item>
          <Form.Item label="API URL" name="api_url" rules={[{ required: true, message: '请输入 API URL' }]}>
            <Input placeholder="例如：https://api.openai.com/v1/chat/completions" />
          </Form.Item>
          <Form.Item label="API Key" name="api_key" rules={editingConfig ? [] : [{ required: true, message: '请输入 API Key' }]}>
            <Input.Password placeholder={editingConfig ? '留空则不修改' : '请输入 API Key'} />
          </Form.Item>
          <Form.Item label="Model ID" name="model_id" rules={[{ required: true, message: '请输入 Model ID' }]}>
            <Input placeholder="例如：gpt-4o、claude-sonnet-4-20250514" />
          </Form.Item>
          <Form.Item label="优先级" name="priority" tooltip="数值越小优先级越高">
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="认证方式" name="auth_type">
            <Select
              options={[
                { value: 'bearer', label: 'bearer' },
                { value: 'x-api-key', label: 'x-api-key' },
                { value: 'custom', label: 'custom' },
                { value: 'none', label: 'none' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Max Tokens" name="max_tokens">
            <InputNumber min={1} max={128000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Temperature" name="temperature">
            <InputNumber min={0} max={2} step={0.1} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Capabilities" name="capabilities" tooltip="用于描述该 Provider 适合的能力">
            <Select
              mode="tags"
              tokenSeparators={[',']}
              options={[
                { value: 'chat', label: 'chat' },
                { value: 'trial', label: 'trial' },
                { value: 'reasoning', label: 'reasoning' },
                { value: 'fallback', label: 'fallback' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Reasoning Effort" name="reasoning_effort">
            <Select
              allowClear
              options={[
                { value: 'low', label: 'low' },
                { value: 'medium', label: 'medium' },
                { value: 'high', label: 'high' },
              ]}
            />
          </Form.Item>
          <Form.Item name="is_enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="enable_stream" valuePropName="checked">
            <Switch checkedChildren="Stream 开" unCheckedChildren="Stream 关" />
          </Form.Item>
          <Form.Item name="include_max_completion_tokens" valuePropName="checked">
            <Switch checkedChildren="max_completion_tokens 开" unCheckedChildren="max_completion_tokens 关" />
          </Form.Item>
          <Form.Item name="include_max_output_tokens" valuePropName="checked">
            <Switch checkedChildren="max_output_tokens 开" unCheckedChildren="max_output_tokens 关" />
          </Form.Item>
          <Form.Item name="legacy_openai_format" valuePropName="checked">
            <Switch checkedChildren="legacy format 开" unCheckedChildren="legacy format 关" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              {editingConfig ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default LlmSettings
