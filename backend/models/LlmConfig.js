import { query } from '../config/database.js'

const LlmConfigModel = {
  async findAll() {
    const result = await query(
      'SELECT id, provider_name, api_url, model_id, is_active, max_tokens, temperature, created_at, updated_at FROM llm_configs ORDER BY created_at DESC'
    )
    return result.rows
  },

  async findActive() {
    const result = await query(
      'SELECT * FROM llm_configs WHERE is_active = true LIMIT 1'
    )
    return result.rows[0] || null
  },

  async create(data) {
    const result = await query(
      `INSERT INTO llm_configs (provider_name, api_url, api_key, model_id, max_tokens, temperature)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, provider_name, api_url, model_id, is_active, max_tokens, temperature, created_at`,
      [data.provider_name, data.api_url, data.api_key, data.model_id, data.max_tokens || 1024, data.temperature || 0.7]
    )
    return result.rows[0]
  },

  async update(id, data) {
    const fields = []
    const params = []
    let idx = 1

    for (const key of ['provider_name', 'api_url', 'api_key', 'model_id', 'max_tokens', 'temperature']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`)
        params.push(data[key])
        idx++
      }
    }

    if (fields.length === 0) throw new Error('No fields to update')

    fields.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id)

    const result = await query(
      `UPDATE llm_configs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, provider_name, api_url, model_id, is_active, max_tokens, temperature, updated_at`,
      params
    )
    return result.rows[0]
  },

  async setActive(id) {
    // Deactivate all, then activate the specified one
    await query('UPDATE llm_configs SET is_active = false')
    const result = await query(
      'UPDATE llm_configs SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, provider_name, api_url, model_id, is_active',
      [id]
    )
    return result.rows[0]
  },

  async delete(id) {
    const result = await query(
      'DELETE FROM llm_configs WHERE id = $1 RETURNING id',
      [id]
    )
    return result.rows[0]
  },
}

export default LlmConfigModel
