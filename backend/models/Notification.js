import { query } from '../config/database.js'

export const NotificationModel = {
  async create(data) {
    const sql = `
      INSERT INTO notifications (user_id, type, title, content, related_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    const result = await query(sql, [
      data.user_id,
      data.type,
      data.title,
      data.content,
      data.related_id || null
    ])
    return result.rows[0]
  },

  async findByUser(userId, { page = 1, pageSize = 20, unreadOnly = false }) {
    const offset = (page - 1) * pageSize
    let sql = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `
    const params = [userId]
    let paramIndex = 2

    if (unreadOnly) {
      sql += ` AND read_at IS NULL`
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(pageSize, offset)

    const result = await query(sql, params)

    const countSql = `
      SELECT COUNT(*) as total FROM notifications
      WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
    `
    const countResult = await query(countSql, [userId])

    return {
      notifications: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  },

  async getUnreadCount(userId) {
    const sql = `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`
    const result = await query(sql, [userId])
    return parseInt(result.rows[0].count)
  },

  async markAsRead(id, userId) {
    const sql = `
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `
    const result = await query(sql, [id, userId])
    return result.rows[0] || null
  },

  async markAllAsRead(userId) {
    const sql = `
      UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read_at IS NULL
    `
    await query(sql, [userId])
  }
}

export default NotificationModel
