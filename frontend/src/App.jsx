import { Routes, Route, useNavigate } from 'react-router-dom'
import { Layout, Result, Button } from 'antd'
import MarketPlace from './pages/MarketPlace'
import AgentDetail from './pages/AgentDetail'
import SkillMarket from './pages/SkillMarket'
import McpMarket from './pages/McpMarket'
import SkillDetail from './pages/SkillDetail'
import McpDetail from './pages/McpDetail'
import CustomOrder from './pages/CustomOrder'
import UserCenter from './pages/UserCenter'
import UploadAgent from './pages/UploadAgent'
import UploadSkill from './pages/UploadSkill'
import UploadMcp from './pages/UploadMcp'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Register from './pages/Register'
import PrivacyPolicy from './pages/Legal/PrivacyPolicy'
import TermsOfService from './pages/Legal/TermsOfService'
import AiUsageGuide from './pages/Legal/AiUsageGuide'
import ComplaintPolicy from './pages/Legal/ComplaintPolicy'
import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

const { Content } = Layout

function NotFound() {
  const navigate = useNavigate()
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在。"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          返回首页
        </Button>
      }
    />
  )
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* 认证页面（无 Header/Footer） */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 主应用页面（有 Header/Footer） */}
        <Route
          path="/*"
          element={
            <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
              <Header />
              <Content style={{ padding: '24px 20px 36px' }}>
                <Routes>
                  <Route path="/" element={<MarketPlace />} />
                  <Route path="/agent/:id" element={<AgentDetail />} />
                  <Route path="/skills" element={<SkillMarket />} />
                  <Route path="/skills/:id" element={<SkillDetail />} />
                  <Route path="/mcps" element={<McpMarket />} />
                  <Route path="/mcps/:id" element={<McpDetail />} />
                  <Route path="/custom-order" element={<CustomOrder />} />
                  <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                  <Route path="/legal/terms" element={<TermsOfService />} />
                  <Route path="/legal/ai-usage" element={<AiUsageGuide />} />
                  <Route path="/legal/complaint" element={<ComplaintPolicy />} />
                  <Route
                    path="/user"
                    element={
                      <ProtectedRoute>
                        <UserCenter />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/upload-agent"
                    element={
                      <ProtectedRoute>
                        <UploadAgent />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/upload-skill"
                    element={
                      <ProtectedRoute>
                        <UploadSkill />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/upload-mcp"
                    element={
                      <ProtectedRoute>
                        <UploadMcp />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Content>
              <Footer />
            </Layout>
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
