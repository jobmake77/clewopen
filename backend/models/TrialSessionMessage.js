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

  async purgeBySession(sessionId) {
    const result = await query(
      `DELETE FROM trial_session_messages
       WHERE session_id = $1`,
      [sessionId]
    )
    return result.rowCount || 0
  },

  async countDailyByUserAndKeySource(userId, keySource, timezone = 'Asia/Shanghai') {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM trial_session_messages tsm
       JOIN trial_sessions ts ON ts.id = tsm.session_id
       WHERE ts.user_id = $1
         AND tsm.role = 'user'
         AND COALESCE(tsm.metadata->>'keySource', 'platform_temp') = $2
         AND (tsm.created_at AT TIME ZONE $3)::date = (NOW() AT TIME ZONE $3)::date`,
      [userId, keySource, timezone]
    )
    return Number(result.rows[0]?.count || 0)
  },
}

export default TrialSessionMessageModel
