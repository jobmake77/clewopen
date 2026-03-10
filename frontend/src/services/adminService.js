import api from './api'

// ==================== Agent 审核 ====================

/**
 * 获取所有 Agent（管理员视图）
 */
export const getAllAgentsAdmin = (params) => {
  return api.get('/agents/admin/all', { params })
}

/**
 * 获取待审核 Agent 列表
 */
export const getPendingAgents = (params) => {
  return api.get('/agents/admin/pending', { params })
}

/**
 * 批准 Agent
 */
export const approveAgent = (id) => {
  return api.post(`/agents/admin/${id}/approve`)
}

/**
 * 拒绝 Agent
 */
export const rejectAgent = (id, reason) => {
  return api.post(`/agents/admin/${id}/reject`, { reason })
}

// ==================== 评价审核 ====================

/**
 * 获取所有评价（管理员视图）
 */
export const getAllReviews = (params) => {
  return api.get('/reviews', { params })
}

/**
 * 批准评价
 */
export const approveReview = (id) => {
  return api.post(`/reviews/${id}/approve`)
}

/**
 * 拒绝评价
 */
export const rejectReview = (id, reason) => {
  return api.post(`/reviews/${id}/reject`, { reason })
}

/**
 * 删除评价
 */
export const deleteReview = (id) => {
  return api.delete(`/reviews/${id}`)
}
