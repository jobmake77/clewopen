import { query } from '../config/database.js'
import { decryptSecret, encryptSecret } from '../utils/secretCrypto.js'

function hydrateApiKey(row) {
  if (!row || row.api_key == null) return row
  return {
    ...row,
    api_key: decryptSecret(row.api_key),
  }
}

const LlmConfigModel = {
  async findAll() {
    const result = await query(
      `SELECT
         id, provider_name, api_url, model_id, is_active, is_enabled, role,
         priority, max_tokens, temperature, capabilities, metadata,
         last_health_status, last_health_checked_at, last_health_error,
         auth_type, enable_stream, reasoning_effort,
         include_max_completion_tokens, include_max_output_tokens,
         legacy_openai_format, created_at, updated_at
       FROM llm_configs
       ORDER BY role ASC, is_active DESC, priority ASC, created_at DESC`
    )
    return result.rows
  },

  async findActive(role = 'trial') {
    const result = await query(
      'SELECT * FROM llm_configs WHERE is_active = true AND role = $1 LIMIT 1',
      [role]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async findById(id) {
    const result = await query(
      'SELECT * FROM llm_configs WHERE id = $1 LIMIT 1',
      [id]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async findRoutingCandidates(role = 'trial') {
    const result = await query(
      `SELECT *
       FROM llm_configs
       WHERE role = $1
         AND is_enabled = true
       ORDER BY is_active DESC, priority ASC, updated_at DESC, created_at DESC`,
      [role]
    )
    return result.rows.map(hydrateApiKey)
  },

  async findByFingerprint({ provider_name, api_url, model_id, role = 'trial' }) {
    const result = await query(
      `SELECT *
       FROM llm_configs
       WHERE provider_name = $1 AND api_url = $2 AND model_id = $3 AND role = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [provider_name, api_url, model_id, role]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async create(data) {
    const result = await query(
      `INSERT INTO llm_configs (
         provider_name, api_url, api_key, model_id, role, priority, is_enabled,
         max_tokens, temperature, capabilities, metadata, auth_type, enable_stream,
         reasoning_effort, include_max_completion_tokens, include_max_output_tokens,
         legacy_openai_format
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING
         id, provider_name, api_url, model_id, role, priority, is_active, is_enabled,
         max_tokens, temperature, capabilities, metadata, auth_type, enable_stream,
         reasoning_effort, include_max_completion_tokens, include_max_output_tokens,
         legacy_openai_format, created_at`,
      [
        data.provider_name,
        data.api_url,
        encryptSecret(data.api_key),
        data.model_id,
        data.role || 'trial',
        data.priority ?? 100,
        data.is_enabled ?? true,
        data.max_tokens || 1024,
        data.temperature || 0.7,
        JSON.stringify(data.capabilities || ['chat', 'trial']),
        JSON.stringify(data.metadata || {}),
        data.auth_type || (String(data.provider_name).toLowerCase() === 'anthropic' ? 'x-api-key' : 'bearer'),
        data.enable_stream ?? false,
        data.reasoning_effort || null,
        data.include_max_completion_tokens ?? false,
        data.include_max_output_tokens ?? false,
        data.legacy_openai_format ?? true,
      ]
    )
    return result.rows[0]
  },

  async update(id, data) {
    const fields = []
    const params = []
    let idx = 1

    for (const key of [
      'provider_name', 'api_url', 'api_key', 'model_id', 'role', 'priority', 'is_enabled',
      'max_tokens', 'temperature', 'auth_type', 'enable_stream', 'reasoning_effort',
      'include_max_completion_tokens', 'include_max_output_tokens', 'legacy_openai_format'
    ]) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`)
        params.push(key === 'api_key' ? encryptSecret(data[key]) : data[key])
        idx++
      }
    }

    for (const key of ['capabilities', 'metadata']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`)
        params.push(JSON.stringify(data[key]))
        idx++
      }
    }

    if (fields.length === 0) throw new Error('No fields to update')

    fields.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id)

    const result = await query(
      `UPDATE llm_configs
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING
         id, provider_name, api_url, model_id, role, priority, is_active, is_enabled,
         max_tokens, temperature, capabilities, metadata,
         last_health_status, last_health_checked_at, last_health_error,
         auth_type, enable_stream, reasoning_effort,
         include_max_completion_tokens, include_max_output_tokens,
         legacy_openai_format, updated_at`,
      params
    )
    return hydrateApiKey(result.rows[0])
  },

  async setActive(id, role = 'trial') {
    // Deactivate all, then activate the specified one
    await query('UPDATE llm_configs SET is_active = false WHERE role = $1', [role])
    const result = await query(
      `UPDATE llm_configs
       SET is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, provider_name, api_url, model_id, role, is_active, is_enabled`,
      [id]
    )
    return result.rows[0]
  },

  async updateHealth(id, status, errorMessage = null) {
    const result = await query(
      `UPDATE llm_configs
       SET last_health_status = $1,
           last_health_checked_at = CURRENT_TIMESTAMP,
           last_health_error = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, last_health_status, last_health_checked_at, last_health_error`,
      [status, errorMessage, id]
    )
    return result.rows[0] || null
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
