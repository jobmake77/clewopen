import { query } from '../config/database.js';

export const CustomOrderModel = {
  async create(data) {
    const sql = `
      INSERT INTO custom_orders (user_id, title, description, budget_min, budget_max, deadline, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      data.user_id, data.title, data.description,
      data.budget_min || null, data.budget_max || null,
      data.deadline || null, data.category || null,
    ];
    const result = await query(sql, params);
    return result.rows[0];
  },

  async findAll({ page = 1, pageSize = 20, status, category }) {
    let sql = `
      SELECT co.*, u.username as user_name, u.avatar_url as user_avatar
      FROM custom_orders co
      LEFT JOIN users u ON co.user_id = u.id
      WHERE co.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND co.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (category) {
      sql += ` AND co.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    sql += ` ORDER BY co.created_at DESC`;

    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const result = await query(sql, params);

    let countSql = `SELECT COUNT(*) as total FROM custom_orders co WHERE co.deleted_at IS NULL`;
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countSql += ` AND co.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (category) {
      countSql += ` AND co.category = $${countParamIndex}`;
      countParams.push(category);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      orders: result.rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async findById(id) {
    const sql = `
      SELECT co.*, u.username as user_name, u.avatar_url as user_avatar
      FROM custom_orders co
      LEFT JOIN users u ON co.user_id = u.id
      WHERE co.id = $1 AND co.deleted_at IS NULL
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async updateStatus(id, status, developerId = null) {
    let sql = `UPDATE custom_orders SET status = $1`;
    const params = [status];
    let paramIndex = 2;

    if (developerId) {
      sql += `, developer_id = $${paramIndex}`;
      params.push(developerId);
      paramIndex++;
    }

    sql += ` WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`;
    params.push(id);

    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  async delete(id) {
    const sql = `
      UPDATE custom_orders SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL RETURNING *
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },
};

export default CustomOrderModel;
