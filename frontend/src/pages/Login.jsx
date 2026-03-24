import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { Form, Input, Button, Card, message, Divider, Tabs } from 'antd'
import { LockOutlined, MailOutlined, GithubOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { login, clearError, getCurrentUser } from '../store/slices/authSlice'
import authService from '../services/authService'
import { hasSupabaseAuthConfig, supabase } from '../services/supabaseClient'
import './Login.css'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { loading, error, isAuthenticated } = useSelector((state) => state.auth)
  const [form] = Form.useForm()
  const [emailCodeForm] = Form.useForm()
  const [countdown, setCountdown] = useState(0)
  const oauthToken = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (error) {
      message.error(error)
      dispatch(clearError())
    }
  }, [error, dispatch])

  useEffect(() => {
    if (!hasSupabaseAuthConfig || !supabase) return
    if (oauthToken) return

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) return

      try {
        await authService.exchangeSupabaseSession(accessToken)
        const me = await dispatch(getCurrentUser()).unwrap()
        authService.setUser(me)
        await supabase.auth.signOut()
        message.success('登录成功')
        navigate('/')
      } catch {
        message.error('Supabase 登录态同步失败，请重试')
      }
    }
    bootstrap()
  }, [dispatch, navigate, oauthToken])

  useEffect(() => {
    if (!oauthToken) return
    message.warning('OAuth 登录回调参数无效，请使用 Supabase 登录方式')
  }, [oauthToken])

  useEffect(() => {
    if (!countdown) return undefined
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const onFinish = async (values) => {
    try {
      await dispatch(login(values)).unwrap()
      message.success('登录成功')
      navigate('/')
    } catch {}
  }

  const onSendCode = async () => {
    try {
      if (!hasSupabaseAuthConfig || !supabase) {
        message.error('未配置 Supabase Auth，请先配置 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY')
        return
      }
      const values = await emailCodeForm.validateFields(['email'])
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: values.email,
        options: {
          shouldCreateUser: true,
        },
      })
      if (otpError) {
        throw otpError
      }
      setCountdown(60)
      message.success('验证码已发送，请查收邮箱')
    } catch (error) {
      message.error(error?.message || '发送验证码失败')
    }
  }

  const onEmailCodeLogin = async (values) => {
    try {
      if (!hasSupabaseAuthConfig || !supabase) {
        message.error('未配置 Supabase Auth，请先配置 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY')
        return
      }
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: values.email,
        token: values.code,
        type: 'email',
      })
      if (verifyError || !data.session?.access_token) {
        throw verifyError || new Error('验证码校验失败')
      }

      await authService.exchangeSupabaseSession(data.session.access_token)
      const me = await dispatch(getCurrentUser()).unwrap()
      authService.setUser(me)
      await supabase.auth.signOut()
      message.success('登录成功')
      navigate('/')
    } catch (error) {
      message.error(error?.message || '邮箱登录失败')
    }
  }

  const handleGithubLogin = async () => {
    try {
      if (!hasSupabaseAuthConfig || !supabase) {
        message.error('未配置 Supabase Auth，请先配置 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY')
        return
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      })
      if (oauthError) throw oauthError
    } catch (e) {
      message.error(e?.message || 'GitHub 登录暂不可用')
    }
  }

  return (
    <div className="login-container">
      <Card
        className="login-card cream-panel"
        title={
          <div>
            <p className="section-label" style={{ marginBottom: 8 }}>Welcome Back</p>
            <div style={{ fontSize: 'clamp(26px, 4.8vw, 30px)', fontFamily: '"Playfair Display", Georgia, serif' }}>登录 ClewOpen</div>
          </div>
        }
      >
        <Tabs
          defaultActiveKey="email-code"
          items={[
            {
              key: 'email-code',
              label: '邮箱验证码',
              children: (
                <Form form={emailCodeForm} name="email-code-login" onFinish={onEmailCodeLogin} autoComplete="off" size="large">
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱地址' }
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="邮箱" />
                  </Form.Item>
                  <Form.Item name="username" extra="首次使用邮箱登录时可选填用户名">
                    <Input placeholder="用户名（可选）" />
                  </Form.Item>
                  <Form.Item
                    name="code"
                    rules={[
                      { required: true, message: '请输入验证码' },
                      { len: 6, message: '验证码为 6 位数字' },
                    ]}
                  >
                    <Input
                      prefix={<SafetyCertificateOutlined />}
                      placeholder="6 位验证码"
                      maxLength={6}
                      suffix={(
                        <Button type="link" onClick={onSendCode} disabled={countdown > 0}>
                          {countdown > 0 ? `${countdown}s` : '获取验证码'}
                        </Button>
                      )}
                    />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      邮箱登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'password',
              label: '密码登录',
              children: (
                <Form form={form} name="login" onFinish={onFinish} autoComplete="off" size="large">
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱地址' }
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="邮箱" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少 6 位' }
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />

        <Button icon={<GithubOutlined />} onClick={handleGithubLogin} block style={{ marginBottom: 12 }}>
          使用 GitHub 登录
        </Button>

        <Divider plain>还没有账号？</Divider>
        <div style={{ textAlign: 'center' }}>
          <Link to="/register">
            <Button type="link">立即注册</Button>
          </Link>
        </div>

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
