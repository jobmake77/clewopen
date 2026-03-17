import { query } from '../config/database.js';

export const AgentModel = {
  // Get all agents with filters
  async findAll({ page = 1, pageSize = 20, category, search, status = 'approved' }) {
    let sql = `
      SELECT
        a.*,
        u.username as author_name,
        u.avatar_url as author_avatar
      FROM agents a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.deleted_at IS NULL
        AND a.status = $1
    `;

    const params = [status];
    let paramIndex = 2;

    // Category filter
    if (category && category !== '全部') {
      sql += ` AND a.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search filter (full-text search)
    if (search) {
      sql += ` AND a.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
      params.push(search);
      paramIndex++;
    }

    // Order by
    sql += ` ORDER BY a.created_at DESC`;

    // Pagination
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM agents a
      WHERE a.deleted_at IS NULL AND a.status = $1
    `;
    const countParams = [status];
    let countParamIndex = 2;

    if (category && category !== '全部') {
      countSql += ` AND a.category = $${countParamIndex}`;
      countParams.push(category);
      countParamIndex++;
    }

    if (search) {
      countSql += ` AND a.search_vector @@ plainto_tsquery('simple', $${countParamIndex})`;
      countParams.push(search);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      agents: result.rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
    };
  },

  // Get agent by ID
  async findById(id) {
    const sql = `
      SELECT
        a.*,
        u.username as author_name,
        u.email as author_email,
        u.avatar_url as author_avatar,
        u.bio as author_bio
      FROM agents a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.id = $1 AND a.deleted_at IS NULL
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  // Get agent by slug
  async findBySlug(slug) {
    const sql = `
      SELECT
        a.*,
        u.username as author_name,
        u.email as author_email,
        u.avatar_url as author_avatar,
        u.bio as author_bio
      FROM agents a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.slug = $1 AND a.deleted_at IS NULL
    `;

    const result = await query(sql, [slug]);
    return result.rows[0] || null;
  },

  // Create new agent
  async create(agentData) {
    const sql = `
      INSERT INTO agents (
        author_id, name, slug, description, version,
        category, tags,
        package_url, manifest, status, review_stage, auto_review_result,
        publish_mode, publish_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const params = [
      agentData.author_id,
      agentData.name,
      agentData.slug,
      agentData.description,
      agentData.version,
      agentData.category,
      agentData.tags,
      agentData.package_url,
      JSON.stringify(agentData.manifest),
      agentData.status || 'pending',
      agentData.review_stage || 'pending_auto',
      JSON.stringify(agentData.auto_review_result || {}),
      agentData.publish_mode || 'open',
      agentData.publish_status || 'not_published',
    ];

    const result = await query(sql, params);
    return result.rows[0];
  },

  // Update agent
  async update(id, agentData) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.keys(agentData).forEach((key) => {
      if (agentData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        params.push(key === 'manifest' ? JSON.stringify(agentData[key]) : agentData[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE agents
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;
    params.push(id);

    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  // Soft delete agent
  async delete(id) {
    const sql = `
      UPDATE agents
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  // Get agent reviews
  async getReviews(agentId, { page = 1, pageSize = 10 }) {
    const sql = `
      SELECT
        r.*,
        u.username,
        u.avatar_url
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.resource_id = $1
        AND r.resource_type = 'agent'
        AND r.deleted_at IS NULL
        AND r.status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const offset = (page - 1) * pageSize;
    const result = await query(sql, [agentId, pageSize, offset]);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM reviews WHERE resource_id = $1 AND resource_type = \'agent\' AND deleted_at IS NULL AND status = \'approved\'',
      [agentId]
    );

    return {
      reviews: result.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  },

  // Increment download count (handled by trigger, but can be called manually)
  async incrementDownloads(agentId) {
    const sql = `
      UPDATE agents
      SET downloads_count = downloads_count + 1
      WHERE id = $1
      RETURNING downloads_count
    `;

    const result = await query(sql, [agentId]);
    return result.rows[0];
  },

  // Get download statistics for an agent
  async getDownloadStats(agentId) {
    const sql = `
      SELECT
        a.downloads_count,
        COUNT(DISTINCT d.user_id) as unique_downloaders,
        COUNT(d.id) as total_download_records,
        MAX(d.downloaded_at) as last_download_at
      FROM agents a
      LEFT JOIN downloads d ON a.id = d.resource_id AND d.resource_type = 'agent'
      WHERE a.id = $1 AND a.deleted_at IS NULL
      GROUP BY a.id, a.downloads_count
    `;

    const result = await query(sql, [agentId]);
    return result.rows[0] || null;
  },

  // Get trending agents by download count
  async getTrending({ limit = 10, days = 7 }) {
    const sql = `
      SELECT
        a.*,
        u.username as author_name,
        u.avatar_url as author_avatar,
        COUNT(d.id) as recent_downloads
      FROM agents a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN downloads d ON a.id = d.resource_id AND d.resource_type = 'agent'
        AND d.downloaded_at >= NOW() - INTERVAL '1 day' * $2
      WHERE a.deleted_at IS NULL
        AND a.status = 'approved'
      GROUP BY a.id, u.username, u.avatar_url
      ORDER BY recent_downloads DESC, a.downloads_count DESC
      LIMIT $1
    `;

    const result = await query(sql, [limit, days]);
    return result.rows;
  },

  // ==================== Admin Methods ====================

  // Get all agents for admin (including pending, rejected)
  async findAllAdmin({ page = 1, pageSize = 20, status, category, search, reviewStage }) {
    let sql = `
      SELECT
        a.*,
        u.username as author_name,
        u.avatar_url as author_avatar
      FROM agents a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.deleted_at IS NULL
    `;

    const params = [];
    let paramIndex = 1;

    // Status filter
    if (status) {
      sql += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (reviewStage) {
      sql += ` AND a.review_stage = $${paramIndex}`;
      params.push(reviewStage);
      paramIndex++;
    }

    // Category filter
    if (category && category !== '全部') {
      sql += ` AND a.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search filter
    if (search) {
      sql += ` AND a.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
      params.push(search);
      paramIndex++;
    }

    // Order by
    sql += ` ORDER BY a.created_at DESC`;

    // Pagination
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM agents a
      WHERE a.deleted_at IS NULL
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countSql += ` AND a.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (reviewStage) {
      countSql += ` AND a.review_stage = $${countParamIndex}`;
      countParams.push(reviewStage);
      countParamIndex++;
    }

    if (category && category !== '全部') {
      countSql += ` AND a.category = $${countParamIndex}`;
      countParams.push(category);
      countParamIndex++;
    }

    if (search) {
      countSql += ` AND a.search_vector @@ plainto_tsquery('simple', $${countParamIndex})`;
      countParams.push(search);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      agents: result.rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
    };
  },

  // Update agent status
  async updateStatus(id, status, reason = null, options = {}) {
    const nextReviewStage = options.review_stage || (
      status === 'approved'
        ? 'approved'
        : status === 'rejected'
          ? 'rejected'
          : undefined
    );

    let sql = `
      UPDATE agents
      SET status = $1, updated_at = CURRENT_TIMESTAMP
    `;
    const params = [status];
    let paramIndex = 2;

    // If approved, set published_at
    if (status === 'approved') {
      sql += `, published_at = CURRENT_TIMESTAMP`;
    }

    if (nextReviewStage) {
      sql += `, review_stage = $${paramIndex}`;
      params.push(nextReviewStage);
      paramIndex++;
    }

    if (options.auto_review_result !== undefined) {
      sql += `, auto_review_result = $${paramIndex}::jsonb`;
      params.push(JSON.stringify(options.auto_review_result || {}));
      paramIndex++;
    }

    if (options.publish_status) {
      sql += `, publish_status = $${paramIndex}`;
      params.push(options.publish_status);
      paramIndex++;
    }

    // If rejected, optionally store reason in metadata
    if (status === 'rejected' && reason) {
      sql += `, metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{rejection_reason}', $${paramIndex}::jsonb)`;
      params.push(JSON.stringify(reason));
      paramIndex++;
    }

    sql += ` WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`;
    params.push(id);

    const result = await query(sql, params);
    return result.rows[0] || null;
  },

  async markPublished(id, publishData = {}) {
    const result = await query(
      `UPDATE agents
       SET
         review_stage = 'published',
         publish_status = 'published',
         publish_mode = COALESCE($2, publish_mode),
         package_registry = COALESCE($3, package_registry),
         package_name = COALESCE($4, package_name),
         repository_url = COALESCE($5, repository_url),
         install_hint = COALESCE($6, install_hint),
         last_published_version = version,
         last_published_at = CURRENT_TIMESTAMP,
         published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        publishData.publish_mode || null,
        publishData.package_registry || null,
        publishData.package_name || null,
        publishData.repository_url || null,
        publishData.install_hint || null,
      ]
    );

    return result.rows[0] || null;
  },
};

export default AgentModel;
