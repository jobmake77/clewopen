import { query } from '../config/database.js'

const AgentTrialModel = {
  async countTrials(userId, agentId) {
    const result = await query(
      'SELECT COUNT(*) as count FROM agent_trials WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId]
    )
    return parseInt(result.rows[0].count)
  },

  async create({ user_id, agent_id, message_content, response_content }) {
    const result = await query(
      `INSERT INTO agent_trials (user_id, agent_id, message_content, response_content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, agent_id, message_content, response_content]
    )
    return result.rows[0]
  },

  async getHistory(userId, agentId) {
    const result = await query(
      `SELECT id, message_content, response_content, created_at
       FROM agent_trials
       WHERE user_id = $1 AND agent_id = $2
       ORDER BY created_at ASC`,
      [userId, agentId]
    )
    return result.rows
  },
}

export default AgentTrialModel
