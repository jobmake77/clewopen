import { query } from '../config/database.js';

export const ReviewModel = {
  // Create review
  async create(reviewData) {
    const sql = `
      INSERT INTO reviews (agent_id, user_id, rating, comment, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const params = [
      reviewData.agent_id,
      reviewData.user_id,
      reviewData.rating,
      reviewData.comment || null,
      reviewData.status || 'pending',
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
        u.avatar_url,
        a.name as agent_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN agents a ON r.agent_id = a.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  // Check if user already reviewed an agent (only pending or approved reviews)
  async findByUserAndAgent(userId, agentId) {
    const sql = `
      SELECT * FROM reviews
      WHERE user_id = $1 AND agent_id = $2
        AND deleted_at IS NULL
        AND status IN ('pending', 'approved')
    `;

    const result = await query(sql, [userId, agentId]);
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
