import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Switch, message, Space, Tag, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getLlmConfigs, createLlmConfig, updateLlmConfig, activateLlmConfig, deleteLlmConfig } from '../../services/adminLlmService'

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
    form.setFieldsValue({ max_tokens: 1024, temperature: 0.7 })
    setModalVisible(true)
  }

  const handleEdit = (record) => {
    setEditingConfig(record)
    form.setFieldsValue({
      provider_name: record.provider_name,
      api_url: record.api_url,
      model_id: record.model_id,
      max_tokens: record.max_tokens,
      temperature: parseFloat(record.temperature),
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
        message.success('已激活')
        loadConfigs()
      }
    } catch (error) {
      message.error('激活失败')
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
      width: 220,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          {!record.is_active && (
            <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => handleActivate(record.id)}>激活</Button>
          )}
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: '#666', margin: 0 }}>配置用于 Agent 试用沙盒的 LLM 服务。激活的配置将用于处理用户的试用请求。</p>
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
          <Form.Item label="Max Tokens" name="max_tokens">
            <InputNumber min={1} max={128000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Temperature" name="temperature">
            <InputNumber min={0} max={2} step={0.1} precision={2} style={{ width: '100%' }} />
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
