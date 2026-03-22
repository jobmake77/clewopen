import { query } from '../config/database.js'

const AgentInstallEventModel = {
  async create({
    userId,
    agentId,
    mode = 'full',
    status,
    includedFiles = [],
    errorMessage = null,
    source = 'agent_detail_modal',
    metadata = {},
  }) {
    const result = await query(
      `INSERT INTO agent_install_events (
         user_id, agent_id, mode, status, included_files, error_message, source, metadata
       ) VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8::jsonb)
       RETURNING *`,
      [
        userId,
        agentId,
        mode,
        status,
        Array.isArray(includedFiles) ? includedFiles : [],
        errorMessage,
        source,
        JSON.stringify(metadata || {}),
      ]
    )
    return result.rows[0]
  },

  async listByUserAndAgent(userId, agentId, limit = 20) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20))
    const result = await query(
      `SELECT id, user_id, agent_id, mode, status, included_files, error_message, source, metadata, created_at
       FROM agent_install_events
       WHERE user_id = $1
         AND agent_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, agentId, safeLimit]
    )
    return result.rows
  },
}

export default AgentInstallEventModel
