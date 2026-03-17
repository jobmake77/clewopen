import { query } from '../config/database.js';

/**
 * 创建通用资源 Model（Agent/Skill/MCP 共用结构）
 */
export function createResourceModel(tableName) {
  const resourceType = tableName === 'skills' ? 'skill' : 'mcp';

  return {
    async findAll({ page = 1, pageSize = 20, category, search, status = 'approved', sort, sourceType, sourcePlatform }) {
      let sql = `
        SELECT
          a.*,
          u.username as author_name,
          u.avatar_url as author_avatar,
          COALESCE(v.visits_count, 0) as visits_count
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN (
          SELECT resource_id, COUNT(*)::int AS visits_count
          FROM resource_visits
          WHERE resource_type = '${resourceType}'
          GROUP BY resource_id
        ) v ON v.resource_id = a.id
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

      if (sourceType) {
        sql += ` AND a.source_type = $${paramIndex}`;
        params.push(sourceType);
        paramIndex++;
      }

      if (sourcePlatform) {
        sql += ` AND a.source_platform = $${paramIndex}`;
        params.push(sourcePlatform);
        paramIndex++;
      }

      if (sort === 'downloads') {
        sql += ` ORDER BY a.downloads_count DESC`;
      } else if (sort === 'rating') {
        sql += ` ORDER BY a.rating_average DESC`;
      } else if (sort === 'stars') {
        sql += ` ORDER BY a.github_stars DESC NULLS LAST, COALESCE(v.visits_count, 0) DESC`;
      } else if (sort === 'visits') {
        sql += ` ORDER BY COALESCE(v.visits_count, 0) DESC, a.github_stars DESC NULLS LAST`;
      } else {
        sql += ` ORDER BY CASE WHEN a.source_type = 'external' THEN COALESCE(v.visits_count, 0) ELSE a.downloads_count END DESC, a.github_stars DESC NULLS LAST, a.created_at DESC`;
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
        countParamIndex++;
      }

      if (sourceType) {
        countSql += ` AND a.source_type = $${countParamIndex}`;
        countParams.push(sourceType);
        countParamIndex++;
      }

      if (sourcePlatform) {
        countSql += ` AND a.source_platform = $${countParamIndex}`;
        countParams.push(sourcePlatform);
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
        SELECT
          a.*,
          u.username as author_name,
          u.email as author_email,
          u.avatar_url as author_avatar,
          u.bio as author_bio,
          COALESCE(v.visits_count, 0) as visits_count
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN (
          SELECT resource_id, COUNT(*)::int AS visits_count
          FROM resource_visits
          WHERE resource_type = '${resourceType}'
          GROUP BY resource_id
        ) v ON v.resource_id = a.id
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
          package_url, external_url, manifest, status,
          source_type, source_platform, source_id, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;
      const params = [
        data.author_id, data.name, data.slug, data.description, data.version,
        data.category, data.tags, data.package_url || null, data.external_url || null,
        JSON.stringify(data.manifest), data.status || 'pending',
        data.source_type || 'uploaded',
        data.source_platform || 'manual',
        data.source_id || `uploaded:${data.slug}`,
        data.last_synced_at || null,
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
        LEFT JOIN downloads d ON a.id = d.resource_id AND d.resource_type = '${resourceType}'
        WHERE a.id = $1 AND a.deleted_at IS NULL
        GROUP BY a.id, a.downloads_count
      `;
      const result = await query(sql, [resourceId]);
      return result.rows[0] || null;
    },

    async getTrending({ limit = 10, days = 7, sourceType, sourcePlatform }) {
      const safeDays = Math.max(1, parseInt(days, 10) || 7);
      const sql = `
        SELECT
          a.*,
          u.username as author_name,
          u.avatar_url as author_avatar,
          COALESCE(v.visits_count, 0) as visits_count,
          GREATEST(
            0,
            COALESCE(s.current_stars, a.github_stars, 0) - COALESCE(s.baseline_stars, COALESCE(s.current_stars, a.github_stars, 0))
          )::int AS stars_growth_7d
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN (
          SELECT resource_id, COUNT(*)::int AS visits_count
          FROM resource_visits
          WHERE resource_type = '${resourceType}'
          GROUP BY resource_id
        ) v ON v.resource_id = a.id
        LEFT JOIN LATERAL (
          SELECT
            cur.stars AS current_stars,
            COALESCE(prev.stars, earliest.stars, cur.stars) AS baseline_stars
          FROM (
            SELECT stars, snapshot_date
            FROM resource_star_snapshots
            WHERE resource_type = $4
              AND resource_id = a.id
            ORDER BY snapshot_date DESC
            LIMIT 1
          ) cur
          LEFT JOIN LATERAL (
            SELECT stars
            FROM resource_star_snapshots
            WHERE resource_type = $4
              AND resource_id = a.id
              AND snapshot_date <= (CURRENT_DATE - ($5::int))
            ORDER BY snapshot_date DESC
            LIMIT 1
          ) prev ON TRUE
          LEFT JOIN LATERAL (
            SELECT stars
            FROM resource_star_snapshots
            WHERE resource_type = $4
              AND resource_id = a.id
            ORDER BY snapshot_date ASC
            LIMIT 1
          ) earliest ON TRUE
        ) s ON TRUE
        WHERE a.deleted_at IS NULL AND a.status = 'approved'
          AND ($2::text IS NULL OR a.source_type = $2)
          AND ($3::text IS NULL OR a.source_platform = $3)
        ORDER BY
          CASE WHEN a.source_type = 'external' THEN GREATEST(
            0,
            COALESCE(s.current_stars, a.github_stars, 0) - COALESCE(s.baseline_stars, COALESCE(s.current_stars, a.github_stars, 0))
          ) ELSE 0 END DESC NULLS LAST,
          CASE WHEN a.source_type = 'external' THEN COALESCE(s.current_stars, a.github_stars, 0) ELSE 0 END DESC NULLS LAST,
          CASE WHEN a.source_type = 'external' THEN COALESCE(v.visits_count, 0) ELSE a.downloads_count END DESC,
          a.rating_average DESC,
          a.created_at DESC
        LIMIT $1
      `;
      const result = await query(sql, [limit, sourceType || null, sourcePlatform || null, resourceType, safeDays]);
      return result.rows;
    },

    async findAllAdmin({ page = 1, pageSize = 20, status, category, search, sourceType, sourcePlatform }) {
      let sql = `
        SELECT
          a.*,
          u.username as author_name,
          u.avatar_url as author_avatar,
          COALESCE(v.visits_count, 0) as visits_count
        FROM ${tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN (
          SELECT resource_id, COUNT(*)::int AS visits_count
          FROM resource_visits
          WHERE resource_type = '${resourceType}'
          GROUP BY resource_id
        ) v ON v.resource_id = a.id
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

      if (sourceType) {
        sql += ` AND a.source_type = $${paramIndex}`;
        params.push(sourceType);
        paramIndex++;
      }

      if (sourcePlatform) {
        sql += ` AND a.source_platform = $${paramIndex}`;
        params.push(sourcePlatform);
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
        countParamIndex++;
      }

      if (sourceType) {
        countSql += ` AND a.source_type = $${countParamIndex}`;
        countParams.push(sourceType);
        countParamIndex++;
      }

      if (sourcePlatform) {
        countSql += ` AND a.source_platform = $${countParamIndex}`;
        countParams.push(sourcePlatform);
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
