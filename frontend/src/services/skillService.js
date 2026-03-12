import api from './api'

export const getSkills = (params) => {
  return api.get('/skills', { params })
}

export const getSkillById = (id) => {
  return api.get(`/skills/${id}`)
}

export const downloadSkill = async (id) => {
  return api.post(`/skills/${id}/download`, {}, { responseType: 'blob' })
}

export const rateSkill = (id, rating, comment) => {
  return api.post(`/skills/${id}/rate`, { rating, comment })
}

export const getSkillReviews = (id, params = {}) => {
  return api.get(`/skills/${id}/reviews`, { params })
}

export const uploadSkill = (formData) => {
  return api.post('/skills/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const deleteSkill = (id) => {
  return api.delete(`/skills/${id}`)
}

export const getTrendingSkills = (params) => {
  return api.get('/skills/trending', { params })
}
