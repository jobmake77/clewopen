import { query } from '../config/database.js'
import { decryptSecret, encryptSecret } from '../utils/secretCrypto.js'

function hydrateApiKey(row) {
  if (!row || row.api_key == null) return row
  return {
    ...row,
    api_key: decryptSecret(row.api_key),
  }
}

const ALLOWED_UPDATE_FIELDS = [
  'provider_name',
  'api_url',
  'api_key',
  'model_id',
  'auth_type',
  'is_default',
  'is_enabled',
]

const UserLlmConfigModel = {
  async findByUser(userId) {
    const result = await query(
      `SELECT id, user_id, provider_name, api_url, model_id, auth_type, is_default, is_enabled, metadata, created_at, updated_at
       FROM user_llm_configs
       WHERE user_id = $1
       ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
      [userId]
    )
    return result.rows
  },

  async findById(id) {
    const result = await query(
      `SELECT *
       FROM user_llm_configs
       WHERE id = $1
       LIMIT 1`,
      [id]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async findUserConfigById(userId, id) {
    const result = await query(
      `SELECT *
       FROM user_llm_configs
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, id]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async findUserDefault(userId) {
    const result = await query(
      `SELECT *
       FROM user_llm_configs
       WHERE user_id = $1
         AND is_enabled = true
       ORDER BY is_default DESC, updated_at DESC, created_at DESC
       LIMIT 1`,
      [userId]
    )
    return hydrateApiKey(result.rows[0]) || null
  },

  async create(data) {
    if (data.is_default) {
      await query(
        `UPDATE user_llm_configs
         SET is_default = false, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [data.user_id]
      )
    }

    const result = await query(
      `INSERT INTO user_llm_configs (
         user_id, provider_name, api_url, api_key, model_id, auth_type,
         is_default, is_enabled, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, user_id, provider_name, api_url, model_id, auth_type, is_default, is_enabled, metadata, created_at, updated_at`,
      [
        data.user_id,
        data.provider_name,
        data.api_url,
        encryptSecret(data.api_key),
        data.model_id,
        data.auth_type || 'bearer',
        data.is_default ?? false,
        data.is_enabled ?? true,
        JSON.stringify(data.metadata || {}),
      ]
    )

    return result.rows[0] || null
  },

  async update(userId, id, patch) {
    const payload = {}
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (patch[key] !== undefined) {
        payload[key] = patch[key]
      }
    }

    if (Object.keys(payload).length === 0 && patch.metadata === undefined) {
      return this.findUserConfigById(userId, id)
    }

    if (payload.is_default === true) {
      await query(
        `UPDATE user_llm_configs
         SET is_default = false, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND id <> $2`,
        [userId, id]
      )
    }

    const fields = []
    const params = []
    let idx = 1

    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (payload[key] === undefined) continue
      fields.push(`${key} = $${idx}`)
      params.push(key === 'api_key' ? encryptSecret(payload[key]) : payload[key])
      idx += 1
    }

    if (patch.metadata !== undefined) {
      fields.push(`metadata = $${idx}`)
      params.push(JSON.stringify(patch.metadata || {}))
      idx += 1
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    params.push(userId)
    params.push(id)

    const result = await query(
      `UPDATE user_llm_configs
       SET ${fields.join(', ')}
       WHERE user_id = $${idx} AND id = $${idx + 1}
       RETURNING id, user_id, provider_name, api_url, model_id, auth_type, is_default, is_enabled, metadata, created_at, updated_at`,
      params
    )
    return result.rows[0] || null
  },

  async remove(userId, id) {
    const result = await query(
      `DELETE FROM user_llm_configs
       WHERE user_id = $1 AND id = $2
       RETURNING id`,
      [userId, id]
    )
    return result.rows[0] || null
  },
}

export default UserLlmConfigModel
