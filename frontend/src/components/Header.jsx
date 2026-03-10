import { Layout as AntLayout, Menu, Button, Dropdown, Avatar, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { HomeOutlined, ShoppingOutlined, UserOutlined, LogoutOutlined, LoginOutlined, UploadOutlined, SettingOutlined } from '@ant-design/icons'
import { logout } from '../store/slices/authSlice'

const { Header: AntHeader } = AntLayout

function Header() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { isAuthenticated, user } = useSelector((state) => state.auth)

  const menuItems = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: 'Agent 市场',
      onClick: () => navigate('/'),
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
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => navigate('/upload-agent')}
            >
              发布 Agent
            </Button>
          )}
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
