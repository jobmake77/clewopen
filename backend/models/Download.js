import { query } from '../config/database.js';

export const DownloadModel = {
  // Record a download
  async create(downloadData) {
    const sql = `
      INSERT INTO downloads (agent_id, user_id, version, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const params = [
      downloadData.agent_id,
      downloadData.user_id,
      downloadData.version,
      downloadData.ip_address || null,
      downloadData.user_agent || null,
    ];

    const result = await query(sql, params);
    return result.rows[0];
  },

  // Check if user has downloaded an agent
  async hasUserDownloaded(userId, agentId) {
    const sql = `
      SELECT COUNT(*) as count
      FROM downloads
      WHERE user_id = $1 AND agent_id = $2
    `;

    const result = await query(sql, [userId, agentId]);
    return parseInt(result.rows[0].count) > 0;
  },

  // Get download statistics for an agent
  async getAgentStats(agentId) {
    const sql = `
      SELECT
        COUNT(*) as total_downloads,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT DATE(downloaded_at)) as active_days
      FROM downloads
      WHERE agent_id = $1
    `;

    const result = await query(sql, [agentId]);
    return result.rows[0];
  },

  // Get download history for a user
  async getUserDownloads(userId, { page = 1, pageSize = 20 }) {
    const sql = `
      SELECT
        d.*,
        a.name as agent_name,
        a.slug as agent_slug,
        a.category
      FROM downloads d
      LEFT JOIN agents a ON d.agent_id = a.id
      WHERE d.user_id = $1
      ORDER BY d.downloaded_at DESC
      LIMIT $2 OFFSET $3
    `;

    const offset = (page - 1) * pageSize;
    const result = await query(sql, [userId, pageSize, offset]);

    const countResult = await query(
      'SELECT COUNT(*) as total FROM downloads WHERE user_id = $1',
      [userId]
    );

    return {
      downloads: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  },
};

export default DownloadModel;
