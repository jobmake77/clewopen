import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/auth.js'
import { runSync, getSyncStatus, getSyncHistory } from '../../services/syncService.js'
import { query } from '../../config/database.js'

const router = Router()

// 所有路由均需管理员权限
router.use(authenticate, authorize('admin'))

// GET /api/admin/sync-status — 获取同步状态 + DB 计数
router.get('/sync-status', async (req, res) => {
  try {
    const status = getSyncStatus()

    const [mcpCount, skillCount, mcpBreakdown, skillBreakdown] = await Promise.all([
      query('SELECT COUNT(*) FROM mcps WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) FROM skills WHERE deleted_at IS NULL'),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE source_type = 'external') AS external_count,
          COUNT(*) FILTER (WHERE source_type = 'uploaded') AS uploaded_count
        FROM mcps
        WHERE deleted_at IS NULL
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE source_type = 'external') AS external_count,
          COUNT(*) FILTER (WHERE source_type = 'uploaded') AS uploaded_count,
          COUNT(*) FILTER (WHERE source_platform = 'github') AS github_count,
          COUNT(*) FILTER (WHERE source_platform = 'openclaw') AS openclaw_count
        FROM skills
        WHERE deleted_at IS NULL
      `),
    ])

    res.json({
      success: true,
      data: {
        ...status,
        totalMcps: parseInt(mcpCount.rows[0].count, 10),
        totalSkills: parseInt(skillCount.rows[0].count, 10),
        mcpBreakdown: {
          external: parseInt(mcpBreakdown.rows[0].external_count || '0', 10),
          uploaded: parseInt(mcpBreakdown.rows[0].uploaded_count || '0', 10),
        },
        skillBreakdown: {
          external: parseInt(skillBreakdown.rows[0].external_count || '0', 10),
          uploaded: parseInt(skillBreakdown.rows[0].uploaded_count || '0', 10),
          github: parseInt(skillBreakdown.rows[0].github_count || '0', 10),
          openclaw: parseInt(skillBreakdown.rows[0].openclaw_count || '0', 10),
        },
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } })
  }
})

// POST /api/admin/sync-trigger — 手动触发同步
router.post('/sync-trigger', async (req, res) => {
  const status = getSyncStatus()
  if (status.isSyncing) {
    return res.status(409).json({
      success: false,
      error: { message: '同步正在进行中，请稍后再试' },
    })
  }

  // 异步执行，立即返回
  res.json({ success: true, message: '同步已触发' })

  await runSync()
})

// GET /api/admin/sync-history — 返回最近 20 条同步记录
router.get('/sync-history', (req, res) => {
  res.json({
    success: true,
    data: getSyncHistory(),
  })
})

export default router
