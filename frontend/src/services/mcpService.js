import api from './api'

export const getMcps = (params) => {
  return api.get('/mcps', { params })
}

export const getMcpById = (id) => {
  return api.get(`/mcps/${id}`)
}

export const visitMcp = (id) => {
  return api.post(`/mcps/${id}/visit`)
}

export const downloadMcp = async (id) => {
  return api.post(`/mcps/${id}/download`, {}, { responseType: 'blob' })
}

export const rateMcp = (id, rating, comment) => {
  return api.post(`/mcps/${id}/rate`, { rating, comment })
}

export const getMcpReviews = (id, params = {}) => {
  return api.get(`/mcps/${id}/reviews`, { params })
}

export const uploadMcp = (formData) => {
  return api.post('/mcps/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const deleteMcp = (id) => {
  return api.delete(`/mcps/${id}`)
}

export const getTrendingMcps = (params) => {
  return api.get('/mcps/trending', { params })
}
