import api from './api'

export const trialAgent = (agentId, message) => {
  return api.post(`/agents/${agentId}/trial`, { message })
}

export const getTrialHistory = (agentId) => {
  return api.get(`/agents/${agentId}/trial/history`)
}
