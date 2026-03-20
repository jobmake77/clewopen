import { query } from '../config/database.js';

export const CustomOrderModel = {
  allowedStatusTransitions: {
    open: ['in_progress', 'cancelled', 'closed'],
    in_progress: ['awaiting_acceptance', 'cancelled', 'disputed', 'closed'],
    awaiting_acceptance: ['accepted', 'in_progress', 'disputed', 'closed'],
    accepted: ['completed', 'closed'],
    disputed: ['in_progress', 'closed'],
    completed: ['closed'],
    cancelled: [],
    closed: [],
  },

  async create(data) {
    const sql = `
      INSERT INTO custom_orders (
        user_id, title, description, budget_min, budget_max, deadline, category, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
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
      SELECT co.*,
             u.username as user_name,
             u.avatar_url as user_avatar,
             d.username as developer_name
      FROM custom_orders co
      LEFT JOIN users u ON co.user_id = u.id
      LEFT JOIN users d ON co.developer_id = d.id
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
      SELECT co.*,
             u.username as user_name,
             u.avatar_url as user_avatar,
             d.username as developer_name
      FROM custom_orders co
      LEFT JOIN users u ON co.user_id = u.id
      LEFT JOIN users d ON co.developer_id = d.id
      WHERE co.id = $1 AND co.deleted_at IS NULL
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  async updateStatus(id, status, options = {}) {
    const current = await this.findById(id);
    if (!current) return null;

    const currentStatus = current.status;
    const allowed = this.allowedStatusTransitions[currentStatus] || [];
    if (status !== currentStatus && !allowed.includes(status)) {
      throw new Error(`状态流转不合法: ${currentStatus} -> ${status}`);
    }

    const patchFragments = ['status = $1'];
    const params = [status];
    let idx = 2;

    if (options.developerId !== undefined) {
      patchFragments.push(`developer_id = $${idx}`);
      params.push(options.developerId || null);
      idx++;
    }

    if (status === 'awaiting_acceptance') {
      patchFragments.push(`acceptance_deadline = NOW() + INTERVAL '48 hour'`);
    }

    if (status === 'accepted') {
      patchFragments.push(`accepted_at = CURRENT_TIMESTAMP`);
    }

    if (status === 'closed' || status === 'cancelled' || status === 'completed') {
      patchFragments.push(`closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)`);
    }

    params.push(id);
    const sql = `
      UPDATE custom_orders
      SET ${patchFragments.join(', ')}
      WHERE id = $${idx} AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  async canViewOrder(order, user) {
    if (!order || !user) return false;
    if (user.role === 'admin') return true;
    if (order.user_id === user.id) return true;
    if (order.developer_id === user.id) return true;
    return false;
  },

  async createSubmission(data) {
    const sql = `
      INSERT INTO custom_order_submissions (
        order_id, developer_id, agent_id, title, summary, package_url, version_label, status,
        artifact_id, delivery_mode, parsed_manifest
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8, 'repo_artifact', $9)
      RETURNING *
    `;
    const result = await query(sql, [
      data.order_id,
      data.developer_id,
      data.agent_id || null,
      data.title,
      data.summary,
      null,
      data.version_label || null,
      data.artifact_id || null,
      data.parsed_manifest ? JSON.stringify(data.parsed_manifest) : null,
    ]);
    return result.rows[0];
  },

  async listSubmissions(orderId) {
    const result = await query(
      `SELECT s.*, u.username AS developer_name, a.name AS agent_name,
              art.repository AS artifact_repository,
              art.git_path AS artifact_git_path,
              art.file_name AS artifact_file_name,
              art.file_size_bytes AS artifact_file_size_bytes,
              art.sha256 AS artifact_sha256
       FROM custom_order_submissions s
       LEFT JOIN users u ON s.developer_id = u.id
       LEFT JOIN agents a ON s.agent_id = a.id
       LEFT JOIN custom_order_artifacts art ON s.artifact_id = art.id
       WHERE s.order_id = $1
       ORDER BY s.created_at DESC`,
      [orderId]
    );
    return result.rows;
  },

  async findSubmissionById(orderId, submissionId) {
    const result = await query(
      `SELECT s.*,
              art.repository AS artifact_repository,
              art.git_path AS artifact_git_path,
              art.file_name AS artifact_file_name
       FROM custom_order_submissions s
       LEFT JOIN custom_order_artifacts art ON s.artifact_id = art.id
       WHERE s.id = $1 AND s.order_id = $2
       LIMIT 1`,
      [submissionId, orderId]
    );
    return result.rows[0] || null;
  },

  async createArtifact(data) {
    const result = await query(
      `INSERT INTO custom_order_artifacts (
         order_id, developer_id, storage_provider, repository, git_path, git_sha,
         file_name, file_size_bytes, sha256, manifest, metadata
       ) VALUES ($1,$2,'github',$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.order_id,
        data.developer_id,
        data.repository,
        data.git_path,
        data.git_sha,
        data.file_name,
        data.file_size_bytes,
        data.sha256,
        data.manifest ? JSON.stringify(data.manifest) : null,
        JSON.stringify(data.metadata || {}),
      ]
    );
    return result.rows[0] || null;
  },

  async markSubmissionStatus(orderId, submissionId, status) {
    const result = await query(
      `UPDATE custom_order_submissions
       SET status = $1
       WHERE id = $2 AND order_id = $3
       RETURNING *`,
      [status, submissionId, orderId]
    );
    return result.rows[0] || null;
  },

  async createMessage(data) {
    const result = await query(
      `INSERT INTO custom_order_messages (order_id, sender_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.order_id,
        data.sender_id,
        data.role,
        data.content,
        JSON.stringify(data.metadata || {}),
      ]
    );
    return result.rows[0];
  },

  async listMessages(orderId, { limit = 100 } = {}) {
    const result = await query(
      `SELECT m.*, u.username AS sender_name
       FROM custom_order_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.order_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2`,
      [orderId, limit]
    );
    return result.rows;
  },

  async createDispute(data) {
    const result = await query(
      `INSERT INTO custom_order_disputes (
         order_id, buyer_id, developer_id, reason, evidence, status
       )
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [
        data.order_id,
        data.buyer_id,
        data.developer_id || null,
        data.reason,
        JSON.stringify(data.evidence || []),
      ]
    );
    return result.rows[0];
  },

  async listDisputes(orderId) {
    const result = await query(
      `SELECT d.*,
              buyer.username AS buyer_name,
              dev.username AS developer_name,
              resolver.username AS resolver_name
       FROM custom_order_disputes d
       LEFT JOIN users buyer ON d.buyer_id = buyer.id
       LEFT JOIN users dev ON d.developer_id = dev.id
       LEFT JOIN users resolver ON d.resolver_id = resolver.id
       WHERE d.order_id = $1
       ORDER BY d.created_at DESC`,
      [orderId]
    );
    return result.rows;
  },

  async resolveDispute(orderId, disputeId, payload) {
    const result = await query(
      `UPDATE custom_order_disputes
       SET status = $1,
           resolution = $2,
           resolver_id = $3,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND order_id = $5
       RETURNING *`,
      [
        payload.status,
        payload.resolution || null,
        payload.resolver_id || null,
        disputeId,
        orderId,
      ]
    );
    return result.rows[0] || null;
  },

  async assignDeveloper(orderId, developerId) {
    const result = await query(
      `UPDATE custom_orders
       SET developer_id = $1, status = 'in_progress'
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [developerId, orderId]
    );
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
