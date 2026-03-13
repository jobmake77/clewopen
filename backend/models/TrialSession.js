import { query } from '../config/database.js'

const TrialSessionModel = {
  async countUserTrials(userId, agentId) {
    const result = await query(
      'SELECT COUNT(*) AS count FROM trial_sessions WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId]
    )
    return parseInt(result.rows[0].count, 10)
  },

  async countActiveUserSessions(userId) {
    const result = await query(
      `SELECT COUNT(*) AS count
       FROM trial_sessions
       WHERE user_id = $1 AND status IN ('provisioning', 'active')`,
      [userId]
    )
    return parseInt(result.rows[0].count, 10)
  },

  async findActiveByUserAndAgent(userId, agentId) {
    const result = await query(
      `SELECT
         ts.*,
         a.name AS agent_name,
         a.description AS agent_description,
         a.status AS agent_status,
         a.package_url,
         u.username
       FROM trial_sessions ts
       JOIN agents a ON a.id = ts.agent_id
       JOIN users u ON u.id = ts.user_id
       WHERE ts.user_id = $1
         AND ts.agent_id = $2
         AND ts.status IN ('provisioning', 'active')
       ORDER BY ts.created_at DESC
       LIMIT 1`,
      [userId, agentId]
    )
    return result.rows[0] || null
  },

  async create(data) {
    const result = await query(
      `INSERT INTO trial_sessions (
         user_id, agent_id, status, runtime_type, sandbox_ref, workspace_path,
         expires_at, last_activity_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.user_id,
        data.agent_id,
        data.status || 'provisioning',
        data.runtime_type || 'prompt',
        data.sandbox_ref || null,
        data.workspace_path || null,
        data.expires_at,
        data.last_activity_at || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    )
    return result.rows[0]
  },

  async findById(id) {
    const result = await query(
      `SELECT
         ts.*,
         a.name AS agent_name,
         a.description AS agent_description,
         a.status AS agent_status,
         a.package_url,
         u.username
       FROM trial_sessions ts
       JOIN agents a ON a.id = ts.agent_id
       JOIN users u ON u.id = ts.user_id
       WHERE ts.id = $1`,
      [id]
    )
    return result.rows[0] || null
  },

  async update(id, data) {
    const fields = []
    const params = []
    let paramIndex = 1

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      fields.push(`${key} = $${paramIndex}`)
      params.push(key === 'metadata' ? JSON.stringify(value) : value)
      paramIndex++
    }

    if (fields.length === 0) {
      return this.findById(id)
    }

    const result = await query(
      `UPDATE trial_sessions
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      [...params, id]
    )
    return result.rows[0] || null
  },

  async listExpired(now = new Date()) {
    const result = await query(
      `SELECT *
       FROM trial_sessions
       WHERE status IN ('provisioning', 'active', 'cleaning')
         AND expires_at < $1
       ORDER BY expires_at ASC
       LIMIT 100`,
      [now]
    )
    return result.rows
  },

  async listActiveContainerSessionIds() {
    const result = await query(
      `SELECT id
       FROM trial_sessions
       WHERE runtime_type = 'container'
         AND status IN ('provisioning', 'active', 'cleaning')`
    )
    return result.rows.map((row) => row.id)
  },

  async listMessages(sessionId) {
    const result = await query(
      `SELECT *
       FROM trial_session_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    )
    return result.rows
  },
}

export default TrialSessionModel
