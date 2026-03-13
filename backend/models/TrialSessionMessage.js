import { query } from '../config/database.js'

const TrialSessionMessageModel = {
  async create(data) {
    const result = await query(
      `INSERT INTO trial_session_messages (
         session_id, role, content, usage_prompt_tokens, usage_completion_tokens, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.session_id,
        data.role,
        data.content,
        data.usage_prompt_tokens || null,
        data.usage_completion_tokens || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    )
    return result.rows[0]
  },
}

export default TrialSessionMessageModel
