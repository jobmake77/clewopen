import { query } from '../config/database.js';

/**
 * 创建通用资源 Model（Agent/Skill/MCP 共用结构）
 */
export function createResourceModel(tableName) {
  return {
    async findAll({ page = 1, pageSize = 20, category, search, status = 'approved', sort }) {
      let sql = `
        SELECT a.*, u.username as author_name, u.avatar_url as author_avatar
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.deleted_at IS NULL AND a.status = $1
      `;
      const params = [status];
      let paramIndex = 2;

      if (category && category !== '全部') {
        sql += ` AND a.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (search) {
        sql += ` AND a.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
        params.push(search);
        paramIndex++;
      }

      if (sort === 'downloads') {
        sql += ` ORDER BY a.downloads_count DESC`;
      } else if (sort === 'rating') {
        sql += ` ORDER BY a.rating_average DESC`;
      } else if (sort === 'stars') {
        sql += ` ORDER BY a.github_stars DESC`;
      } else {
        sql += ` ORDER BY a.created_at DESC`;
      }

      const offset = (page - 1) * pageSize;
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(pageSize, offset);

      const result = await query(sql, params);

      let countSql = `
        SELECT COUNT(*) as total FROM ${tableName} a
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
        items: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async findById(id) {
      const sql = `
        SELECT a.*, u.username as author_name, u.email as author_email,
               u.avatar_url as author_avatar, u.bio as author_bio
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.id = $1 AND a.deleted_at IS NULL
      `;
      const result = await query(sql, [id]);
      return result.rows[0] || null;
    },

    async create(data) {
      const sql = `
        INSERT INTO ${tableName} (
          author_id, name, slug, description, version,
          category, tags,
          package_url, manifest, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const params = [
        data.author_id, data.name, data.slug, data.description, data.version,
        data.category, data.tags, data.package_url,
        JSON.stringify(data.manifest), data.status || 'pending',
      ];
      const result = await query(sql, params);
      return result.rows[0];
    },

    async update(id, data) {
      const fields = [];
      const params = [];
      let paramIndex = 1;

      Object.keys(data).forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          params.push(key === 'manifest' ? JSON.stringify(data[key]) : data[key]);
          paramIndex++;
        }
      });

      if (fields.length === 0) throw new Error('No fields to update');

      const sql = `
        UPDATE ${tableName} SET ${fields.join(', ')}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING *
      `;
      params.push(id);
      const result = await query(sql, params);
      return result.rows[0] || null;
    },

    async delete(id) {
      const sql = `
        UPDATE ${tableName} SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL RETURNING *
      `;
      const result = await query(sql, [id]);
      return result.rows[0] || null;
    },

    async getReviews(resourceId, { page = 1, pageSize = 10 }, resourceType) {
      const sql = `
        SELECT r.*, u.username, u.avatar_url
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.resource_id = $1 AND r.resource_type = $2
          AND r.deleted_at IS NULL AND r.status = 'approved'
        ORDER BY r.created_at DESC
        LIMIT $3 OFFSET $4
      `;
      const offset = (page - 1) * pageSize;
      const result = await query(sql, [resourceId, resourceType, pageSize, offset]);

      const countResult = await query(
        `SELECT COUNT(*) as total FROM reviews WHERE resource_id = $1 AND resource_type = $2 AND deleted_at IS NULL AND status = 'approved'`,
        [resourceId, resourceType]
      );

      return {
        reviews: result.rows,
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      };
    },

    async getDownloadStats(resourceId) {
      const sql = `
        SELECT
          a.downloads_count,
          COUNT(DISTINCT d.user_id) as unique_downloaders,
          COUNT(d.id) as total_download_records,
          MAX(d.downloaded_at) as last_download_at
        FROM ${tableName} a
        LEFT JOIN downloads d ON a.id = d.resource_id AND d.resource_type = '${tableName === 'skills' ? 'skill' : 'mcp'}'
        WHERE a.id = $1 AND a.deleted_at IS NULL
        GROUP BY a.id, a.downloads_count
      `;
      const result = await query(sql, [resourceId]);
      return result.rows[0] || null;
    },

    async getTrending({ limit = 10 }) {
      const sql = `
        SELECT a.*, u.username as author_name, u.avatar_url as author_avatar
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.deleted_at IS NULL AND a.status = 'approved'
        ORDER BY a.github_stars DESC, a.downloads_count DESC
        LIMIT $1
      `;
      const result = await query(sql, [limit]);
      return result.rows;
    },

    async findAllAdmin({ page = 1, pageSize = 20, status, category, search }) {
      let sql = `
        SELECT a.*, u.username as author_name, u.avatar_url as author_avatar
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.deleted_at IS NULL
      `;
      const params = [];
      let paramIndex = 1;

      if (status) {
        sql += ` AND a.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (category && category !== '全部') {
        sql += ` AND a.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (search) {
        sql += ` AND a.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
        params.push(search);
        paramIndex++;
      }

      sql += ` ORDER BY a.created_at DESC`;

      const offset = (page - 1) * pageSize;
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(pageSize, offset);

      const result = await query(sql, params);

      let countSql = `SELECT COUNT(*) as total FROM ${tableName} a WHERE a.deleted_at IS NULL`;
      const countParams = [];
      let countParamIndex = 1;

      if (status) {
        countSql += ` AND a.status = $${countParamIndex}`;
        countParams.push(status);
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
        items: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async updateStatus(id, status, reason = null) {
      let sql = `UPDATE ${tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP`;
      const params = [status];
      let paramIndex = 2;

      if (status === 'approved') {
        sql += `, published_at = CURRENT_TIMESTAMP`;
      }

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
  };
}
