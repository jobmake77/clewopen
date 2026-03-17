import { query } from '../config/database.js'

const AgentPublishJobModel = {
  async create({ agentId, requestedBy, payload = {} }) {
    const result = await query(
      `INSERT INTO agent_publish_jobs (
         agent_id, requested_by, payload
       ) VALUES ($1, $2, $3::jsonb)
       RETURNING *`,
      [agentId, requestedBy || null, JSON.stringify(payload || {})]
    )
    return result.rows[0] || null
  },

  async claimNextQueued() {
    const result = await query(
      `WITH next_job AS (
         SELECT id
         FROM agent_publish_jobs
         WHERE status = 'queued'
         ORDER BY queued_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE agent_publish_jobs j
       SET status = 'running',
           started_at = CURRENT_TIMESTAMP
       FROM next_job
       WHERE j.id = next_job.id
       RETURNING j.*`
    )
    return result.rows[0] || null
  },

  async markSucceeded(id, resultPayload = {}) {
    const result = await query(
      `UPDATE agent_publish_jobs
       SET status = 'succeeded',
           finished_at = CURRENT_TIMESTAMP,
           result = $2::jsonb,
           error_message = NULL
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(resultPayload || {})]
    )
    return result.rows[0] || null
  },

  async markFailed(id, errorMessage, resultPayload = {}) {
    const result = await query(
      `UPDATE agent_publish_jobs
       SET status = 'failed',
           finished_at = CURRENT_TIMESTAMP,
           error_message = $2,
           result = $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [id, String(errorMessage || 'unknown publish error'), JSON.stringify(resultPayload || {})]
    )
    return result.rows[0] || null
  },

  async findLatestByAgentId(agentId, limit = 10) {
    const result = await query(
      `SELECT *
       FROM agent_publish_jobs
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, Math.max(1, Number(limit || 10))]
    )
    return result.rows
  },

  async findById(id) {
    const result = await query(
      `SELECT *
       FROM agent_publish_jobs
       WHERE id = $1
       LIMIT 1`,
      [id]
    )
    return result.rows[0] || null
  },

  async findAdminList({ page = 1, pageSize = 20, status, keyword, agentId, anomalyOnly = false, recentHours }) {
    const safePage = Math.max(1, Number.parseInt(String(page || 1), 10))
    const safePageSize = Math.min(100, Math.max(1, Number.parseInt(String(pageSize || 20), 10)))
    const offset = (safePage - 1) * safePageSize
    const conditions = []
    const params = []
    let index = 1

    if (status && ['queued', 'running', 'succeeded', 'failed'].includes(String(status))) {
      conditions.push(`j.status = $${index}`)
      params.push(String(status))
      index += 1
    }

    if (agentId) {
      conditions.push(`j.agent_id = $${index}`)
      params.push(String(agentId))
      index += 1
    }

    if (anomalyOnly) {
      conditions.push(`(j.status = 'failed' OR COALESCE(j.error_message, '') <> '')`)
    }

    const normalizedRecentHours = Number.parseInt(String(recentHours || ''), 10)
    if (Number.isFinite(normalizedRecentHours) && normalizedRecentHours > 0) {
      conditions.push(`j.created_at >= (CURRENT_TIMESTAMP - ($${index}::int * INTERVAL '1 hour'))`)
      params.push(normalizedRecentHours)
      index += 1
    }

    const normalizedKeyword = String(keyword || '').trim()
    if (normalizedKeyword) {
      conditions.push(`(
        j.id::text ILIKE $${index}
        OR COALESCE(j.error_message, '') ILIKE $${index}
        OR COALESCE(j.payload::text, '') ILIKE $${index}
        OR COALESCE(j.result::text, '') ILIKE $${index}
        OR COALESCE(a.name, '') ILIKE $${index}
        OR COALESCE(a.slug, '') ILIKE $${index}
      )`)
      params.push(`%${normalizedKeyword}%`)
      index += 1
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(safePageSize)
    params.push(offset)

    const sql = `
      SELECT
        j.*,
        a.name AS agent_name,
        a.slug AS agent_slug,
        u.username AS requested_by_name,
        COUNT(*) OVER() AS total_count
      FROM agent_publish_jobs j
      LEFT JOIN agents a ON a.id = j.agent_id
      LEFT JOIN users u ON u.id = j.requested_by
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}
    `

    const result = await query(sql, params)
    const rows = result.rows || []
    const total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0

    return {
      items: rows.map((row) => {
        const { total_count, ...rest } = row
        return rest
      }),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: total > 0 ? Math.ceil(total / safePageSize) : 0,
    }
  },

  async getAdminSummary({ recentHours = 24, topLimit = 5 }) {
    const safeHours = Math.max(1, Math.min(168, Number.parseInt(String(recentHours || 24), 10)))
    const safeTopLimit = Math.max(1, Math.min(20, Number.parseInt(String(topLimit || 5), 10)))

    const countsResult = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
         COUNT(*) FILTER (WHERE status = 'running')::int AS running,
         COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM agent_publish_jobs`
    )

    const recentFailedResult = await query(
      `SELECT
         j.agent_id,
         COALESCE(a.name, a.slug, j.agent_id::text) AS agent_name,
         COUNT(*)::int AS failed_count,
         MAX(j.created_at) AS latest_failed_at
       FROM agent_publish_jobs j
       LEFT JOIN agents a ON a.id = j.agent_id
       WHERE j.status = 'failed'
         AND j.created_at >= (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour'))
       GROUP BY j.agent_id, a.name, a.slug
       ORDER BY failed_count DESC, latest_failed_at DESC
       LIMIT $2`,
      [safeHours, safeTopLimit]
    )

    const recentFailureReasonsResult = await query(
      `SELECT
         COALESCE(NULLIF(BTRIM(j.error_message), ''), 'unknown') AS reason,
         COUNT(*)::int AS failed_count,
         MAX(j.created_at) AS latest_failed_at
       FROM agent_publish_jobs j
       WHERE j.status = 'failed'
         AND j.created_at >= (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour'))
       GROUP BY COALESCE(NULLIF(BTRIM(j.error_message), ''), 'unknown')
       ORDER BY failed_count DESC, latest_failed_at DESC
       LIMIT $2`,
      [safeHours, safeTopLimit]
    )

    const recentWindowCountsResult = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
         COUNT(*) FILTER (WHERE status = 'running')::int AS running,
         COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM agent_publish_jobs
       WHERE created_at >= (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour'))`,
      [safeHours]
    )

    const durationStatsResult = await query(
      `SELECT
         COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - started_at))), 0)::float AS avg_duration_seconds,
         COALESCE(
           AVG(
             EXTRACT(EPOCH FROM (finished_at - started_at))
           ) FILTER (
             WHERE created_at >= (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour'))
           ),
           0
         )::float AS recent_avg_duration_seconds
       FROM agent_publish_jobs
       WHERE started_at IS NOT NULL
         AND finished_at IS NOT NULL
         AND status IN ('succeeded', 'failed')`,
      [safeHours]
    )

    return {
      totals: countsResult.rows[0] || {
        total: 0,
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
      },
      recentWindowTotals: recentWindowCountsResult.rows[0] || {
        total: 0,
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
      },
      durationStats: durationStatsResult.rows[0] || {
        avg_duration_seconds: 0,
        recent_avg_duration_seconds: 0,
      },
      recentFailedAgents: recentFailedResult.rows || [],
      recentFailureReasons: recentFailureReasonsResult.rows || [],
      windowHours: safeHours,
    }
  },
}

export default AgentPublishJobModel
