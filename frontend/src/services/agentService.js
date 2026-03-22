import api from './api'

export const getAgents = (params) => {
  return api.get('/agents', { params })
}

export const getAgentById = (id) => {
  return api.get(`/agents/${id}`)
}

export const downloadAgent = async (id) => {
  const response = await api.post(`/agents/${id}/download`, {}, {
    responseType: 'blob'
  })
  return response
}

export const rateAgent = (id, rating, comment) => {
  return api.post(`/agents/${id}/rate`, { rating, comment })
}

export const getAgentInstallCommand = (id, payload = {}) => {
  return api.post(`/agents/${id}/install-command`, payload)
}

export const getAgentInstallOptions = (id) => {
  return api.get(`/agents/${id}/install-options`)
}

export const previewAgentInstallPlan = (id, payload = {}) => {
  return api.post(`/agents/${id}/install-preview`, payload)
}

export const getAgentInstallHistory = (id, params = {}) => {
  return api.get(`/agents/${id}/install-history`, { params })
}

export const reportAgentInstallFeedback = (id, payload = {}) => {
  return api.post(`/agents/${id}/install-feedback`, payload)
}

export const getAgentReviews = (id, params = {}) => {
  return api.get(`/agents/${id}/reviews`, { params })
}

export const searchAgents = (keyword) => {
  return api.get('/agents/search', { params: { keyword } })
}

export const uploadAgent = (formData) => {
  return api.post('/agents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const updateAgent = (id, formData) => {
  return api.put(`/agents/${id}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export const deleteAgent = (id) => {
  return api.delete(`/agents/${id}`)
}

export const getTrendingAgents = (params) => {
  return api.get('/agents/trending', { params })
}

export const getPlatformStats = () => {
  return api.get('/agents/platform-stats')
}
