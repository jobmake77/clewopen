import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Card, message, Divider } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { login, clearError } from '../store/slices/authSlice'
import './Login.css'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error, isAuthenticated } = useSelector((state) => state.auth)
  const [form] = Form.useForm()

  useEffect(() => {
    // 如果已登录，跳转到首页
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    // 显示错误信息
    if (error) {
      message.error(error)
      dispatch(clearError())
    }
  }, [error, dispatch])

  const onFinish = async (values) => {
    try {
      await dispatch(login(values)).unwrap()
      message.success('登录成功')
      navigate('/')
    } catch (err) {
      // 错误已在 useEffect 中处理
    }
  }

  return (
    <div className="login-container">
      <Card className="login-card" title="登录 OpenCLEW">
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="邮箱"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>

          <Divider plain>还没有账号？</Divider>

          <div style={{ textAlign: 'center' }}>
            <Link to="/register">
              <Button type="link">立即注册</Button>
            </Link>
          </div>
        </Form>

        <div className="test-accounts">
          <Divider plain>测试账号</Divider>
          <div className="test-account-list">
            <div>
              <strong>普通用户:</strong> user1@example.com / password123
            </div>
            <div>
              <strong>开发者:</strong> dev1@example.com / password123
            </div>
            <div>
              <strong>管理员:</strong> admin@clewopen.com / password123
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
