import pg from 'pg'
import dotenv from 'dotenv'
import { buildDbPoolConfig } from '../config/dbPoolConfig.js'

dotenv.config()

const { Pool } = pg

async function main() {
  const pool = new Pool(buildDbPoolConfig(process.env))
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO resource_star_snapshots (resource_type, resource_id, stars, snapshot_date)
       SELECT 'skill', id, COALESCE(github_stars, 0), CURRENT_DATE
       FROM skills
       WHERE deleted_at IS NULL AND status = 'approved'
       ON CONFLICT (resource_type, resource_id, snapshot_date)
       DO UPDATE SET
         stars = EXCLUDED.stars,
         updated_at = CURRENT_TIMESTAMP`
    )

    await client.query(
      `INSERT INTO resource_star_snapshots (resource_type, resource_id, stars, snapshot_date)
       SELECT 'mcp', id, COALESCE(github_stars, 0), CURRENT_DATE
       FROM mcps
       WHERE deleted_at IS NULL AND status = 'approved'
       ON CONFLICT (resource_type, resource_id, snapshot_date)
       DO UPDATE SET
         stars = EXCLUDED.stars,
         updated_at = CURRENT_TIMESTAMP`
    )

    const result = await client.query(
      `SELECT resource_type, COUNT(*)::int AS count
       FROM resource_star_snapshots
       WHERE snapshot_date = CURRENT_DATE
       GROUP BY resource_type
       ORDER BY resource_type`
    )

    await client.query('COMMIT')
    console.log('✅ resource_star_snapshots 已补齐（今天）')
    for (const row of result.rows) {
      console.log(`${row.resource_type}: ${row.count}`)
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    console.error(`❌ backfill 失败: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
