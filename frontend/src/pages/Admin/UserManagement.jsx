import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import {
  getAllAgentsAdmin,
  getAllUsersAdmin,
  getUserTrialQuotasAdmin,
  grantUserAgentTrialQuotaAdmin,
} from '../../services/adminService'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [quotaModalVisible, setQuotaModalVisible] = useState(false)
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [quotaUser, setQuotaUser] = useState(null)
  const [quotas, setQuotas] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(undefined)
  const [grantLoading, setGrantLoading] = useState(false)
  const currentPage = pagination.current
  const currentPageSize = pagination.pageSize

  const loadUsers = useCallback(async (options = {}) => {
    const page = options.page ?? currentPage
    const pageSize = options.pageSize ?? currentPageSize
    const nextSearch = options.search ?? search
    const nextRole = options.role ?? roleFilter

    setLoading(true)
    try {
      const response = await getAllUsersAdmin({
        page,
        pageSize,
        search: nextSearch?.trim() || undefined,
        role: nextRole === 'all' ? undefined : nextRole,
      })
      if (response.success) {
        setUsers(response.data.users || [])
        setPagination((prev) => ({
          ...prev,
          current: response.data.page || page,
          pageSize: response.data.pageSize || pageSize,
          total: response.data.total || 0,
        }))
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载用户失败')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [currentPage, currentPageSize, roleFilter, search])

  const loadAgents = useCallback(async () => {
    try {
      const response = await getAllAgentsAdmin({
        page: 1,
        pageSize: 200,
        status: 'approved',
      })
      if (response.success) {
        setAgents(response.data.agents || [])
      }
    } catch {
      setAgents([])
    }
  }, [])

  useEffect(() => {
    loadUsers({ page: 1 })
    loadAgents()
  }, [loadAgents, loadUsers])

  const loadUserQuotas = useCallback(async (userId) => {
    setQuotaLoading(true)
    try {
      const response = await getUserTrialQuotasAdmin(userId)
      if (response.success) {
        setQuotaUser(response.data.user || null)
        setQuotas(response.data.quotas || [])
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '加载试用配额失败')
      setQuotaUser(null)
      setQuotas([])
    } finally {
      setQuotaLoading(false)
    }
  }, [])

  const openQuotaModal = async (user) => {
    setQuotaModalVisible(true)
    setSelectedAgentId(undefined)
    await loadUserQuotas(user.id)
  }

  const grantQuota = async (agentId) => {
    if (!quotaUser?.id || !agentId) {
      message.warning('请选择 Agent')
      return
    }

    setGrantLoading(true)
    try {
      const response = await grantUserAgentTrialQuotaAdmin(quotaUser.id, agentId, {
        grantedCount: 3,
        reason: 'admin-reset',
      })
      if (response.success) {
        message.success(response.message || '已重置用户试用次数')
        await loadUserQuotas(quotaUser.id)
      }
    } catch (error) {
      message.error(error.response?.data?.error?.message || '重置失败')
    } finally {
      setGrantLoading(false)
    }
  }

  return (
    <div className="admin-section">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          style={{ width: 260 }}
          placeholder="搜索用户名/邮箱"
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onPressEnter={() => loadUsers({ page: 1, search })}
        />
        <Select
          style={{ width: 140 }}
          value={roleFilter}
          onChange={(value) => {
            setRoleFilter(value)
            loadUsers({ page: 1, role: value })
          }}
          options={[
            { value: 'all', label: '全部角色' },
            { value: 'user', label: '普通用户' },
            { value: 'developer', label: '开发者' },
            { value: 'admin', label: '管理员' },
          ]}
        />
        <Button onClick={() => loadUsers({ page: 1, search })}>搜索</Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
        columns={[
          {
            title: '用户名',
            dataIndex: 'username',
            key: 'username',
            width: 180,
          },
          {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
          },
          {
            title: '角色',
            dataIndex: 'role',
            key: 'role',
            width: 120,
            render: (value) => {
              const map = {
                admin: { color: 'red', label: '管理员' },
                developer: { color: 'blue', label: '开发者' },
                user: { color: 'default', label: '普通用户' },
              }
              const meta = map[value] || { color: 'default', label: value || '-' }
              return <Tag color={meta.color}>{meta.label}</Tag>
            },
          },
          {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 180,
            render: (value) => value ? new Date(value).toLocaleString() : '-',
          },
          {
            title: '最近登录',
            dataIndex: 'last_login_at',
            key: 'last_login_at',
            width: 180,
            render: (value) => value ? new Date(value).toLocaleString() : '-',
          },
          {
            title: '操作',
            key: 'actions',
            width: 180,
            render: (_, record) => (
              <Button size="small" onClick={() => openQuotaModal(record)}>
                Agent 试用管理
              </Button>
            ),
          },
        ]}
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => {
            loadUsers({ page, pageSize })
          },
        }}
      />

      <Modal
        title={`Agent 试用管理 · ${quotaUser?.username || ''}`}
        open={quotaModalVisible}
        onCancel={() => setQuotaModalVisible(false)}
        footer={null}
        width={980}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            style={{ width: 340 }}
            placeholder="选择 Agent，为该用户新增 3 次今日试用"
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            options={agents.map((agent) => ({
              value: agent.id,
              label: `${agent.name} (${agent.version})`,
            }))}
            showSearch
            optionFilterProp="label"
          />
          <Button
            type="primary"
            loading={grantLoading}
            disabled={!selectedAgentId}
            onClick={() => grantQuota(selectedAgentId)}
          >
            重置 +3 次
          </Button>
          <Button
            onClick={() => quotaUser?.id && loadUserQuotas(quotaUser.id)}
            loading={quotaLoading}
          >
            刷新
          </Button>
        </Space>

        <Table
          rowKey="agent_id"
          loading={quotaLoading}
          dataSource={quotas}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          columns={[
            {
              title: 'Agent',
              dataIndex: 'agent_name',
              key: 'agent_name',
              render: (value, record) => value || record.agent_id,
            },
            {
              title: '今日已用',
              dataIndex: 'used_count',
              key: 'used_count',
              width: 110,
            },
            {
              title: '补偿次数',
              dataIndex: 'granted_count',
              key: 'granted_count',
              width: 110,
            },
            {
              title: '今日总额度',
              dataIndex: 'max_trials',
              key: 'max_trials',
              width: 120,
            },
            {
              title: '剩余次数',
              dataIndex: 'remaining_trials',
              key: 'remaining_trials',
              width: 110,
              render: (value) => (
                <Tag color={Number(value || 0) > 0 ? 'green' : 'red'}>
                  {value}
                </Tag>
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: 120,
              render: (_, record) => (
                <Button
                  size="small"
                  loading={grantLoading}
                  onClick={() => grantQuota(record.agent_id)}
                >
                  重置 +3 次
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  )
}

export default UserManagement
