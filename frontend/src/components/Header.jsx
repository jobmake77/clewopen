import { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Button, Dropdown, Avatar, Space, Badge, List, Popover, Empty } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { HomeOutlined, ShoppingOutlined, UserOutlined, LogoutOutlined, LoginOutlined, UploadOutlined, SettingOutlined, BellOutlined, ThunderboltOutlined, ApiOutlined, PlusOutlined } from '@ant-design/icons'
import { logout } from '../store/slices/authSlice'
import api from '../services/api'

const { Header: AntHeader } = AntLayout

function Header() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { isAuthenticated, user } = useSelector((state) => state.auth)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount()
      const interval = setInterval(fetchUnreadCount, 60000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      if (res.success) setUnreadCount(res.data.count)
    } catch (e) { /* ignore */ }
  }

  const fetchNotifications = async () => {
    setNotifLoading(true)
    try {
      const res = await api.get('/notifications', { params: { pageSize: 10 } })
      if (res.success) setNotifications(res.data.notifications)
    } catch (e) { /* ignore */ }
    setNotifLoading(false)
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })))
    } catch (e) { /* ignore */ }
  }

  const menuItems = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: 'Agent 市场',
      onClick: () => navigate('/'),
    },
    {
      key: 'skills',
      icon: <ThunderboltOutlined />,
      label: 'Skill 库',
      onClick: () => navigate('/skills'),
    },
    {
      key: 'mcps',
      icon: <ApiOutlined />,
      label: 'MCP 库',
      onClick: () => navigate('/mcps'),
    },
    {
      key: 'custom',
      icon: <ShoppingOutlined />,
      label: '定制开发',
      onClick: () => navigate('/custom-order'),
    },
  ]

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '用户中心',
      onClick: () => navigate('/user'),
    },
    ...(user?.role === 'admin' ? [{
      key: 'admin',
      icon: <SettingOutlined />,
      label: '管理控制台',
      onClick: () => navigate('/admin'),
    }] : []),
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  const uploadMenuItems = [
    {
      key: 'upload-agent',
      label: '发布 Agent',
      onClick: () => navigate('/upload-agent'),
    },
    {
      key: 'upload-skill',
      label: '发布 Skill',
      onClick: () => navigate('/upload-skill'),
    },
    {
      key: 'upload-mcp',
      label: '发布 MCP',
      onClick: () => navigate('/upload-mcp'),
    },
  ]

  return (
    <AntHeader style={{ display: 'flex', alignItems: 'center', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', marginRight: 50, cursor: 'pointer' }} onClick={() => navigate('/')}>
        OpenCLEW
      </div>
      <Menu
        mode="horizontal"
        items={menuItems}
        style={{ flex: 1, border: 'none' }}
      />
      {isAuthenticated ? (
        <Space size="middle">
          {(user?.role === 'developer' || user?.role === 'admin') && (
            <Dropdown menu={{ items: uploadMenuItems }} placement="bottomRight">
              <Button
                type="primary"
                icon={<PlusOutlined />}
              >
                发布
              </Button>
            </Dropdown>
          )}
          <Popover
            trigger="click"
            placement="bottomRight"
            onOpenChange={(open) => { if (open) fetchNotifications() }}
            content={
              <div style={{ width: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>通知</strong>
                  {unreadCount > 0 && (
                    <Button type="link" size="small" onClick={handleMarkAllRead}>
                      全部已读
                    </Button>
                  )}
                </div>
                {notifications.length > 0 ? (
                  <List
                    size="small"
                    loading={notifLoading}
                    dataSource={notifications}
                    renderItem={(item) => (
                      <List.Item style={{ background: item.read_at ? 'transparent' : '#f0f5ff', padding: '8px' }}>
                        <List.Item.Meta
                          title={<span style={{ fontSize: 13 }}>{item.title}</span>}
                          description={<span style={{ fontSize: 12, color: '#999' }}>{item.content}</span>}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            }
          >
            <Badge count={unreadCount} size="small">
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
            </Badge>
          </Popover>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} src={user?.avatar} />
              <span>{user?.username}</span>
            </Space>
          </Dropdown>
        </Space>
      ) : (
        <Space>
          <Button type="text" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
            登录
          </Button>
          <Button type="primary" onClick={() => navigate('/register')}>
            注册
          </Button>
        </Space>
      )}
    </AntHeader>
  )
}

export default Header
