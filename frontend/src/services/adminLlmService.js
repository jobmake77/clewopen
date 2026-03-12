import api from './api'

export const getLlmConfigs = () => api.get('/admin/llm-configs')

export const createLlmConfig = (data) => api.post('/admin/llm-configs', data)

export const updateLlmConfig = (id, data) => api.put(`/admin/llm-configs/${id}`, data)

export const activateLlmConfig = (id) => api.post(`/admin/llm-configs/${id}/activate`)

export const deleteLlmConfig = (id) => api.delete(`/admin/llm-configs/${id}`)
