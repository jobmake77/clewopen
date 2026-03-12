import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'
import { message } from 'antd'
import { useEffect, useRef } from 'react'

function ProtectedRoute({ children, requiredRole, requireAuth = true }) {
  const { isAuthenticated, user } = useSelector((state) => state.auth)
  const warned = useRef(false)

  useEffect(() => {
    if (!warned.current) {
      if (requireAuth && !isAuthenticated) {
        message.warning('请先登录')
        warned.current = true
      } else if (requiredRole && user?.role !== requiredRole) {
        message.error('无权访问')
        warned.current = true
      }
    }
  }, [isAuthenticated, user, requireAuth, requiredRole])

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return children
}

export default ProtectedRoute
