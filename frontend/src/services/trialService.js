import api from './api'

export const getTrialHistory = (agentId) => {
  return api.get(`/agents/${agentId}/trial/history`)
}

export const createTrialSession = (agentId) => {
  return api.post(`/agents/${agentId}/trial-sessions`)
}

export const getTrialSession = (sessionId) => {
  return api.get(`/trial-sessions/${sessionId}`)
}

export const sendTrialSessionMessage = (sessionId, message) => {
  return api.post(`/trial-sessions/${sessionId}/messages`, { message })
}

export const endTrialSession = (sessionId) => {
  return api.delete(`/trial-sessions/${sessionId}`)
}
