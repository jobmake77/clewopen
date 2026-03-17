import { query } from '../config/database.js'

const DAILY_LIMIT = 3
const DAILY_TZ = 'Asia/Shanghai'

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

  async countDailyMessageTrials(userId, agentId, timezone = DAILY_TZ) {
    const result = await query(
      `SELECT COUNT(*) AS count
       FROM agent_trials
       WHERE user_id = $1
         AND agent_id = $2
         AND timezone($3, created_at)::date = timezone($3, now())::date`,
      [userId, agentId, timezone]
    )
    return parseInt(result.rows[0]?.count || '0', 10)
  },

  async countDailySessionTrials(userId, agentId, timezone = DAILY_TZ) {
    const result = await query(
      `SELECT COUNT(*) AS count
       FROM trial_sessions ts
       WHERE ts.user_id = $1
         AND ts.agent_id = $2
         AND timezone($3, ts.created_at)::date = timezone($3, now())::date
         AND (
           ts.status IN ('provisioning', 'active', 'cleaning')
           OR EXISTS (
             SELECT 1
             FROM trial_session_messages tsm
             WHERE tsm.session_id = ts.id
               AND tsm.role = 'user'
           )
         )`,
      [userId, agentId, timezone]
    )
    return parseInt(result.rows[0]?.count || '0', 10)
  },

  async getDailyGrantedTrials(userId, agentId, timezone = DAILY_TZ) {
    const result = await query(
      `SELECT COALESCE(SUM(granted_count), 0)::int AS granted
       FROM agent_trial_quota_grants
       WHERE user_id = $1
         AND agent_id = $2
         AND grant_date = timezone($3, now())::date`,
      [userId, agentId, timezone]
    )
    return parseInt(result.rows[0]?.granted || '0', 10)
  },

  async countDailyUsedTrials(userId, agentId, timezone = DAILY_TZ) {
    const [messageCount, sessionCount] = await Promise.all([
      this.countDailyMessageTrials(userId, agentId, timezone),
      this.countDailySessionTrials(userId, agentId, timezone),
    ])
    return messageCount + sessionCount
  },

  async getDailyQuotaSummary(userId, agentId, timezone = DAILY_TZ, baseLimit = DAILY_LIMIT) {
    const [usedCount, grantedCount] = await Promise.all([
      this.countDailyUsedTrials(userId, agentId, timezone),
      this.getDailyGrantedTrials(userId, agentId, timezone),
    ])
    const maxTrials = baseLimit + grantedCount
    return {
      baseLimit,
      usedCount,
      grantedCount,
      maxTrials,
      remainingTrials: Math.max(0, maxTrials - usedCount),
    }
  },

  async grantDailyTrials({ userId, agentId, grantedBy = null, grantedCount = 3, reason = null, timezone = DAILY_TZ }) {
    const result = await query(
      `INSERT INTO agent_trial_quota_grants (
         user_id, agent_id, granted_by, granted_count, grant_date, reason
       ) VALUES ($1, $2, $3, $4, timezone($5, now())::date, $6)
       RETURNING *`,
      [userId, agentId, grantedBy, grantedCount, timezone, reason]
    )
    return result.rows[0] || null
  },

  async listDailyQuotaByUser(userId, timezone = DAILY_TZ, baseLimit = DAILY_LIMIT) {
    const result = await query(
      `WITH message_trials AS (
         SELECT agent_id, COUNT(*)::int AS used_count
         FROM agent_trials
         WHERE user_id = $1
           AND timezone($2, created_at)::date = timezone($2, now())::date
         GROUP BY agent_id
       ),
       session_trials AS (
         SELECT ts.agent_id, COUNT(*)::int AS used_count
         FROM trial_sessions ts
         WHERE ts.user_id = $1
           AND timezone($2, ts.created_at)::date = timezone($2, now())::date
           AND (
             ts.status IN ('provisioning', 'active', 'cleaning')
             OR EXISTS (
               SELECT 1
               FROM trial_session_messages tsm
               WHERE tsm.session_id = ts.id
                 AND tsm.role = 'user'
             )
           )
         GROUP BY ts.agent_id
       ),
       combined_used AS (
         SELECT agent_id, SUM(used_count)::int AS used_count
         FROM (
           SELECT * FROM message_trials
           UNION ALL
           SELECT * FROM session_trials
         ) x
         GROUP BY agent_id
       ),
       daily_grants AS (
         SELECT agent_id, COALESCE(SUM(granted_count), 0)::int AS granted_count
         FROM agent_trial_quota_grants
         WHERE user_id = $1
           AND grant_date = timezone($2, now())::date
         GROUP BY agent_id
       ),
       merged AS (
         SELECT
           COALESCE(c.agent_id, g.agent_id) AS agent_id,
           COALESCE(c.used_count, 0) AS used_count,
           COALESCE(g.granted_count, 0) AS granted_count
         FROM combined_used c
         FULL OUTER JOIN daily_grants g ON g.agent_id = c.agent_id
       )
       SELECT
         m.agent_id,
         a.name AS agent_name,
         m.used_count,
         m.granted_count,
         $3::int AS base_limit,
         ($3::int + m.granted_count) AS max_trials,
         GREATEST(0, ($3::int + m.granted_count) - m.used_count) AS remaining_trials
       FROM merged m
       LEFT JOIN agents a ON a.id = m.agent_id
       ORDER BY m.used_count DESC, m.granted_count DESC`,
      [userId, timezone, baseLimit]
    )
    return result.rows
  },
}

export default AgentTrialModel
