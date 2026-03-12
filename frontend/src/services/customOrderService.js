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

export const deleteCustomOrder = (id) => {
  return api.delete(`/custom-orders/${id}`)
}
