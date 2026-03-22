import api from './api'

export function listMyLlmConfigs() {
  return api.get('/users/me/llm-configs')
}

export function createMyLlmConfig(payload) {
  return api.post('/users/me/llm-configs', payload)
}

export function updateMyLlmConfig(configId, payload) {
  return api.put(`/users/me/llm-configs/${configId}`, payload)
}

export function deleteMyLlmConfig(configId) {
  return api.delete(`/users/me/llm-configs/${configId}`)
}
