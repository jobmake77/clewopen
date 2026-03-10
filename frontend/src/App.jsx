import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import MarketPlace from './pages/MarketPlace'
import AgentDetail from './pages/AgentDetail'
import CustomOrder from './pages/CustomOrder'
import UserCenter from './pages/UserCenter'
import UploadAgent from './pages/UploadAgent'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Register from './pages/Register'
import Header from './components/Header'
import Footer from './components/Footer'

const { Content } = Layout

function App() {
  return (
    <Routes>
      {/* 认证页面（无 Header/Footer） */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 主应用页面（有 Header/Footer） */}
      <Route
        path="/*"
        element={
          <Layout style={{ minHeight: '100vh' }}>
            <Header />
            <Content style={{ padding: '24px 50px' }}>
              <Routes>
                <Route path="/" element={<MarketPlace />} />
                <Route path="/agent/:id" element={<AgentDetail />} />
                <Route path="/custom-order" element={<CustomOrder />} />
                <Route path="/user" element={<UserCenter />} />
                <Route path="/upload-agent" element={<UploadAgent />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </Content>
            <Footer />
          </Layout>
        }
      />
    </Routes>
  )
}

export default App
