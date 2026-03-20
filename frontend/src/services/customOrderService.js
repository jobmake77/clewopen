import api from './api'

export const getCustomOrders = (params) => {
  return api.get('/custom-orders', { params })
}

export const getCustomOrderById = (id) => {
  return api.get(`/custom-orders/${id}`)
}

export const createCustomOrder = (data) => {
  return api.post('/custom-orders', data)
}

export const updateCustomOrderStatus = (id, status) => {
  return api.put(`/custom-orders/${id}/status`, { status })
}

export const assignCustomOrderDeveloper = (id, developer_id) => {
  return api.post(`/custom-orders/${id}/assign`, { developer_id })
}

export const getCustomOrderSubmissions = (id) => {
  return api.get(`/custom-orders/${id}/submissions`)
}

export const createCustomOrderSubmission = (id, data) => {
  const formData = new FormData()
  formData.append('title', data.title)
  formData.append('summary', data.summary)
  if (data.agent_id) formData.append('agent_id', data.agent_id)
  if (data.version_label) formData.append('version_label', data.version_label)
  if (data.package) formData.append('package', data.package)
  return api.post(`/custom-orders/${id}/submissions`, formData)
}

export const requestCustomOrderAcceptance = (id) => {
  return api.post(`/custom-orders/${id}/request-acceptance`)
}

export const acceptCustomOrder = (id) => {
  return api.post(`/custom-orders/${id}/accept`)
}

export const getCustomOrderMessages = (id, params) => {
  return api.get(`/custom-orders/${id}/messages`, { params })
}

export const createCustomOrderMessage = (id, data) => {
  return api.post(`/custom-orders/${id}/messages`, data)
}

export const getCustomOrderDisputes = (id) => {
  return api.get(`/custom-orders/${id}/disputes`)
}

export const createCustomOrderDispute = (id, data) => {
  return api.post(`/custom-orders/${id}/disputes`, data)
}

export const resolveCustomOrderDispute = (id, disputeId, data) => {
  return api.post(`/custom-orders/${id}/disputes/${disputeId}/resolve`, data)
}

export const downloadCustomOrderSubmissionArtifact = (id, submissionId) => {
  return api.get(`/custom-orders/${id}/submissions/${submissionId}/artifact/download`, {
    responseType: 'blob',
  })
}

export const getCustomOrderInstallCommand = (id, submissionId, params) => {
  return api.get(`/custom-orders/${id}/submissions/${submissionId}/artifact/install-command`, { params })
}

export const createCustomOrderSubmissionTrialSession = (id, submissionId) => {
  return api.post(`/custom-orders/${id}/submissions/${submissionId}/trial-sessions`)
}

export const deleteCustomOrder = (id) => {
  return api.delete(`/custom-orders/${id}`)
}
