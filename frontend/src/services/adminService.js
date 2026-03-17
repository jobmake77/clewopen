import api from './api'

// ==================== Agent 审核 ====================

export const getAllAgentsAdmin = (params) => {
  return api.get('/agents/admin/all', { params })
}

export const getPendingAgents = (params) => {
  return api.get('/agents/admin/pending', { params })
}

export const approveAgent = (id) => {
  return api.post(`/agents/admin/${id}/approve`)
}

export const rejectAgent = (id, reason) => {
  return api.post(`/agents/admin/${id}/reject`, { reason })
}

export const publishAgent = (id, payload) => {
  return api.post(`/agents/admin/${id}/publish`, payload || {})
}

export const getAgentPublishJobs = (id, params) => {
  return api.get(`/agents/admin/${id}/publish-jobs`, { params })
}

export const getGlobalAgentPublishJobs = (params) => {
  return api.get('/agents/admin/publish-jobs', { params })
}

export const getGlobalAgentPublishJobsSummary = (params) => {
  return api.get('/agents/admin/publish-jobs/summary', { params })
}

export const triggerGlobalPublishJobsAlert = (payload) => {
  return api.post('/agents/admin/publish-jobs/alerts/trigger', payload || {})
}

export const retryAgentPublishJob = (jobId) => {
  return api.post(`/agents/admin/publish-jobs/${jobId}/retry`)
}

export const batchAgentAction = (ids, action, reason) => {
  return api.post('/agents/admin/batch', { ids, action, reason })
}

// ==================== Skill 审核 ====================

export const getAllSkillsAdmin = (params) => {
  return api.get('/skills/admin/all', { params })
}

export const getPendingSkills = (params) => {
  return api.get('/skills/admin/pending', { params })
}

export const approveSkill = (id) => {
  return api.post(`/skills/admin/${id}/approve`)
}

export const rejectSkill = (id, reason) => {
  return api.post(`/skills/admin/${id}/reject`, { reason })
}

// ==================== MCP 审核 ====================

export const getAllMcpsAdmin = (params) => {
  return api.get('/mcps/admin/all', { params })
}

export const getPendingMcps = (params) => {
  return api.get('/mcps/admin/pending', { params })
}

export const approveMcp = (id) => {
  return api.post(`/mcps/admin/${id}/approve`)
}

export const rejectMcp = (id, reason) => {
  return api.post(`/mcps/admin/${id}/reject`, { reason })
}

// ==================== 评价审核 ====================

export const getAllReviews = (params) => {
  return api.get('/reviews', { params })
}

export const approveReview = (id) => {
  return api.post(`/reviews/${id}/approve`)
}

export const rejectReview = (id, reason) => {
  return api.post(`/reviews/${id}/reject`, { reason })
}

export const deleteReview = (id) => {
  return api.delete(`/reviews/${id}`)
}

// ==================== 数据同步 ====================

export const getSyncStatus = () => {
  return api.get('/admin/sync-status')
}

export const triggerSync = () => {
  return api.post('/admin/sync-trigger')
}

export const getSyncHistory = () => {
  return api.get('/admin/sync-history')
}

// ==================== Trial Runtime ====================

export const getTrialRuntimePoolStatus = () => {
  return api.get('/admin/trial-runtime/pool')
}

export const drainTrialRuntimeSlot = (slotId, reason) => {
  return api.post(`/admin/trial-runtime/pool/slots/${slotId}/drain`, { reason })
}

export const recycleTrialRuntimeSlot = (slotId, reason) => {
  return api.post(`/admin/trial-runtime/pool/slots/${slotId}/recycle`, { reason })
}

export const getTrialRuntimeSlotLogs = (slotId, params) => {
  return api.get(`/admin/trial-runtime/pool/slots/${slotId}/logs`, { params })
}
