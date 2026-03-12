import { useEffect, useState } from 'react'
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
  Spin
} from 'antd'
import {
  UserOutlined,
  DownloadOutlined,
  StarOutlined,
  EditOutlined,
  LockOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { updateProfile } from '../../store/slices/authSlice'
import api from '../../services/api'
import authService from '../../services/authService'
import './index.css'

const { TextArea } = Input

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
  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()

  useEffect(() => {
    if (activeTab === 'downloads') {
      loadDownloads()
    } else if (activeTab === 'agents') {
      loadMyAgents()
    }
  }, [activeTab])

  const loadDownloads = async () => {
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
  }

  const loadMyAgents = async () => {
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
  }

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
        <Card>
          <div className="profile-header">
            <Avatar size={100} icon={<UserOutlined />} src={user.avatar} />
            <div className="profile-info">
              <h2>{user.username}</h2>
              <p style={{ color: '#666' }}>{user.email}</p>
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
      key: 'downloads',
      label: (
        <span>
          <DownloadOutlined />
          下载记录
        </span>
      ),
      children: (
        <Card>
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
        <Card>
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
                            <p style={{ color: '#ff4d4f', margin: '4px 0 0' }}>
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
