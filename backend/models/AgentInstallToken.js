import crypto from 'crypto'
import { query } from '../config/database.js'

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex')
}

function createRawToken() {
  return crypto.randomBytes(32).toString('base64url')
}

const AgentInstallTokenModel = {
  createRawToken,

  async issue({
    agentId,
    userId,
    publishMode = 'open',
    maxUses = 1,
    ttlMinutes = 20,
    metadata = {},
  }) {
    const rawToken = createRawToken()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlMinutes || 20)) * 60 * 1000)

    const result = await query(
      `INSERT INTO agent_install_tokens (
         agent_id, issued_to_user_id, token_hash, publish_mode, max_uses, expires_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        agentId,
        userId,
        tokenHash,
        publishMode,
        Math.max(1, Number(maxUses || 1)),
        expiresAt,
        JSON.stringify(metadata || {}),
      ]
    )

    return {
      token: rawToken,
      record: result.rows[0],
    }
  },

  async consume(rawToken) {
    const tokenHash = hashToken(rawToken)
    const result = await query(
      `UPDATE agent_install_tokens
       SET used_count = used_count + 1,
           last_used_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         AND used_count < max_uses
       RETURNING *`,
      [tokenHash]
    )

    return result.rows[0] || null
  },

  async findUsable(rawToken) {
    const tokenHash = hashToken(rawToken)
    const result = await query(
      `SELECT *
       FROM agent_install_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         AND used_count < max_uses
       LIMIT 1`,
      [tokenHash]
    )

    return result.rows[0] || null
  },
}

export default AgentInstallTokenModel
