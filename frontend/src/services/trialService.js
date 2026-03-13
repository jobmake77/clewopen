import api from './api'

const TRIAL_REQUEST_TIMEOUT_MS = 240000

export const getTrialHistory = (agentId) => {
  return api.get(`/agents/${agentId}/trial/history`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const createTrialSession = (agentId) => {
  return api.post(`/agents/${agentId}/trial-sessions`, undefined, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const getTrialSession = (sessionId) => {
  return api.get(`/trial-sessions/${sessionId}`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const sendTrialSessionMessage = (sessionId, message) => {
  return api.post(`/trial-sessions/${sessionId}/messages`, { message }, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}

export const endTrialSession = (sessionId) => {
  return api.delete(`/trial-sessions/${sessionId}`, {
    timeout: TRIAL_REQUEST_TIMEOUT_MS,
  })
}
