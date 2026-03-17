import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';

export const UserModel = {
  // Find user by email
  async findByEmail(email) {
    const sql = 'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL';
    const result = await query(sql, [email]);
    return result.rows[0] || null;
  },

  // Find user by username
  async findByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL';
    const result = await query(sql, [username]);
    return result.rows[0] || null;
  },

  // Find user by ID
  async findById(id) {
    const sql = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async findAllAdmin({ page = 1, pageSize = 20, search = '', role }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (safePage - 1) * safePageSize;

    const conditions = ['deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (role && ['user', 'developer', 'admin'].includes(role)) {
      conditions.push(`role = $${idx}`);
      params.push(role);
      idx += 1;
    }

    const normalizedSearch = String(search || '').trim();
    if (normalizedSearch) {
      conditions.push(`(
        username ILIKE $${idx}
        OR email ILIKE $${idx}
      )`);
      params.push(`%${normalizedSearch}%`);
      idx += 1;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const listSql = `
      SELECT id, username, email, role, avatar_url, bio, created_at, updated_at, last_login_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM users
      ${whereClause}
    `;

    const listResult = await query(listSql, [...params, safePageSize, offset]);
    const countResult = await query(countSql, params);

    return {
      users: listResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil((parseInt(countResult.rows[0]?.total || '0', 10)) / safePageSize),
    };
  },

  // Create new user
  async create(userData) {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(userData.password, salt);

    const sql = `
      INSERT INTO users (username, email, password_hash, role, bio, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, role, bio, avatar_url as avatar, created_at
    `;

    const params = [
      userData.username,
      userData.email,
      passwordHash,
      userData.role || 'user',
      userData.bio || null,
      userData.avatar || userData.avatar_url || null,
    ];

    const result = await query(sql, params);
    return result.rows[0];
  },

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  },

  // Update user
  async update(id, userData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    // Build dynamic update query
    const allowedFields = ['username', 'bio', 'avatar', 'avatar_url'];
    Object.keys(userData).forEach((key) => {
      if (userData[key] !== undefined && allowedFields.includes(key)) {
        const dbField = key === 'avatar' ? 'avatar_url' : key;
        fields.push(`${dbField} = $${paramIndex}`);
        params.push(userData[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING id, username, email, role, bio, avatar_url as avatar, updated_at
    `;
    params.push(id);

    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  // Update password
  async updatePassword(id, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const sql = `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await query(sql, [passwordHash, id]);
    return result.rows[0] || null;
  },

  // Update last login
  async updateLastLogin(id) {
    const sql = `
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING last_login_at
    `;

    const result = await query(sql, [id]);
    return result.rows[0];
  },

  // Soft delete user
  async delete(id) {
    const sql = `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  // Get user's agents
  async getAgents(userId, { page = 1, pageSize = 20 }) {
    const sql = `
      SELECT *
      FROM agents
      WHERE author_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const offset = (page - 1) * pageSize;
    const result = await query(sql, [userId, pageSize, offset]);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM agents WHERE author_id = $1 AND deleted_at IS NULL',
      [userId]
    );

    return {
      agents: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  },

  // Get user's downloads
  async getDownloads(userId, { page = 1, pageSize = 20 }) {
    const sql = `
      SELECT
        d.*,
        a.name as agent_name,
        a.slug as agent_slug
      FROM downloads d
      LEFT JOIN agents a ON d.resource_id = a.id AND d.resource_type = 'agent'
      WHERE d.user_id = $1
      ORDER BY d.downloaded_at DESC
      LIMIT $2 OFFSET $3
    `;

    const offset = (page - 1) * pageSize;
    const result = await query(sql, [userId, pageSize, offset]);

    // Get total count
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

export default UserModel;
