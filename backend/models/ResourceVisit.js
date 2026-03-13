import { query } from '../config/database.js';

export const ResourceVisitModel = {
  async create(visitData) {
    const sql = `
      INSERT INTO resource_visits (
        resource_id, resource_type, user_id, source_type, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const params = [
      visitData.resource_id,
      visitData.resource_type,
      visitData.user_id || null,
      visitData.source_type,
      visitData.ip_address || null,
      visitData.user_agent || null,
    ];

    const result = await query(sql, params);
    return result.rows[0];
  },
};

export default ResourceVisitModel;
