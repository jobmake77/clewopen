import { query } from '../config/database.js';

export const ReviewModel = {
  // Create review (supports resource_type for skill/mcp)
  async create(reviewData) {
    const sql = `
      INSERT INTO reviews (resource_id, user_id, rating, comment, status, resource_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const params = [
      reviewData.resource_id || reviewData.agent_id,
      reviewData.user_id,
      reviewData.rating,
      reviewData.comment || null,
      reviewData.status || 'pending',
      reviewData.resource_type || 'agent',
    ];

    const result = await query(sql, params);
    return result.rows[0];
  },

  // Find review by ID
  async findById(id) {
    const sql = `
      SELECT
        r.*,
        u.username,
        u.avatar_url
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  // Check if user already reviewed an agent (only pending or approved reviews)
  async findByUserAndAgent(userId, agentId) {
    const sql = `
      SELECT * FROM reviews
      WHERE user_id = $1 AND resource_id = $2
        AND deleted_at IS NULL
        AND status IN ('pending', 'approved')
    `;

    const result = await query(sql, [userId, agentId]);
    return result.rows[0] || null;
  },

  // Check if user already reviewed a resource (generic version)
  async findByUserAndResource(userId, resourceId, resourceType = 'agent') {
    const sql = `
      SELECT * FROM reviews
      WHERE user_id = $1 AND resource_id = $2 AND resource_type = $3
        AND deleted_at IS NULL
        AND status IN ('pending', 'approved')
    `;

    const result = await query(sql, [userId, resourceId, resourceType]);
    return result.rows[0] || null;
  },

  // Update review
  async update(id, reviewData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    Object.keys(reviewData).forEach((key) => {
      if (reviewData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        params.push(reviewData[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE reviews
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;
    params.push(id);

    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  // Soft delete review
  async delete(id) {
    const sql = `
      UPDATE reviews
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },
};

export default ReviewModel;
