import api from './api'

export async function getComplianceProfile() {
  const response = await api.get('/compliance/public')
  return response || null
}
