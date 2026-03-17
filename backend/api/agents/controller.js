import AgentModel from '../../models/Agent.js';
import DownloadModel from '../../models/Download.js';
import ReviewModel from '../../models/Review.js';
import NotificationModel from '../../models/Notification.js';
import AgentInstallTokenModel from '../../models/AgentInstallToken.js';
import AgentPublishJobModel from '../../models/AgentPublishJob.js';
import {
  enqueueAgentPublishJob,
  listAgentPublishJobs,
} from '../../services/agentPublishService.js';
import { query } from '../../config/database.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildServerOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = forwardedProto ? String(forwardedProto).split(',')[0] : req.protocol;
  const host = req.get('host');
  return `${proto}://${host}`;
}

function resolveStoredPackagePath(packageUrl) {
  const backendRoot = path.resolve(__dirname, '../..');
  return path.join(backendRoot, String(packageUrl || '').replace(/^\/+/, ''));
}

export const getAgents = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, category, search } = req.query;

    const result = await AgentModel.findAll({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      category,
      search,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAgentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const agent = await AgentModel.findById(id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    res.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    next(error);
  }
};

export const downloadAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // From auth middleware

    // Get agent
    const agent = await AgentModel.findById(id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    // Construct absolute file path
    // package_url format: /storage/agents/xiaohongshu-writer-1.0.0.zip
    const filePath = resolveStoredPackagePath(agent.package_url);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: { message: 'Package file not found' },
      });
    }

    // Record download
    await DownloadModel.create({
      resource_id: id,
      user_id: userId,
      version: agent.version,
      resource_type: 'agent',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    // Send file for download
    const fileName = path.basename(agent.package_url);
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('File download error:', err);
        if (!res.headersSent) {
          next(err);
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const rateAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id; // From auth middleware

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: { message: 'Rating must be between 1 and 5' },
      });
    }

    // Check if agent exists
    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    // Check if user already reviewed
    const existingReview = await ReviewModel.findByUserAndAgent(userId, id);
    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: { message: 'You have already reviewed this agent' },
      });
    }

    // Create review
    const review = await ReviewModel.create({
      resource_id: id,
      user_id: userId,
      rating,
      comment,
      resource_type: 'agent',
      status: 'pending', // Needs approval
    });

    res.json({
      success: true,
      data: {
        review,
        message: 'Review submitted successfully. It will be visible after approval.',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAgentReviews = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 10 } = req.query;

    const result = await AgentModel.getReviews(id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAgentStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get agent to verify it exists
    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    // Get download statistics
    const downloadStats = await AgentModel.getDownloadStats(id);
    const detailedStats = await DownloadModel.getAgentStats(id);

    res.json({
      success: true,
      data: {
        downloads_count: agent.downloads_count,
        rating_average: agent.rating_average,
        reviews_count: agent.reviews_count,
        download_details: {
          total_downloads: detailedStats.total_downloads,
          unique_users: detailedStats.unique_users,
          active_days: detailedStats.active_days,
          last_download_at: downloadStats?.last_download_at || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTrendingAgents = async (req, res, next) => {
  try {
    const { limit = 10, days = 7 } = req.query;

    const agents = await AgentModel.getTrending({
      limit: parseInt(limit),
      days: parseInt(days),
    });

    res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 获取平台统计概览（首页数据看板）
 */
export const getPlatformStats = async (req, res, next) => {
  try {
    // 各维度统计并行查询
    const [agentCount, userCount, skillCount, mcpCount, categoryStats] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM agents WHERE status='approved' AND deleted_at IS NULL`),
      query(`SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*) as total FROM skills WHERE status='approved' AND deleted_at IS NULL`),
      query(`SELECT COUNT(*) as total FROM mcps WHERE status='approved' AND deleted_at IS NULL`),
      query(`SELECT category, COUNT(*) as count FROM agents WHERE status='approved' AND deleted_at IS NULL GROUP BY category ORDER BY count DESC`),
    ]);

    const totalAgents = parseInt(agentCount.rows[0].total);
    const categories = categoryStats.rows.map(row => ({
      category: row.category,
      count: parseInt(row.count),
      percentage: totalAgents > 0 ? parseFloat(((parseInt(row.count) / totalAgents) * 100).toFixed(1)) : 0,
    }));

    res.json({
      success: true,
      data: {
        totalAgents,
        totalUsers: parseInt(userCount.rows[0].total),
        totalSkills: parseInt(skillCount.rows[0].total),
        totalMcps: parseInt(mcpCount.rows[0].total),
        categories,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==================== Admin Functions ====================

/**
 * 获取所有 Agent（管理员视图）
 */
export const getAllAgentsAdmin = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, category, search, reviewStage } = req.query;

    const result = await AgentModel.findAllAdmin({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status,
      category,
      search,
      reviewStage,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 获取待审核 Agent 列表
 */
export const getPendingAgents = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;

    const result = await AgentModel.findAllAdmin({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status: 'pending',
      reviewStage: 'pending_manual',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 批准 Agent
 */
export const approveAgent = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查 Agent 是否存在
    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    // 更新状态为 approved
    const updatedAgent = await AgentModel.updateStatus(id, 'approved', null, {
      review_stage: 'approved',
    });

    // 发送通知给作者
    try {
      await NotificationModel.create({
        user_id: agent.author_id,
        type: 'agent_approved',
        title: 'Agent 审核通过',
        content: `您的 Agent "${agent.name}" 已通过审核，现在已在市场上可见。`,
        related_id: id
      });
    } catch (e) {
      console.error('Failed to create notification:', e);
    }

    res.json({
      success: true,
      data: updatedAgent,
      message: 'Agent approved successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 批量审批 Agent
 */
export const batchApproveAgents = async (req, res, next) => {
  try {
    const { ids, action, reason } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'ids must be a non-empty array' },
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { message: 'action must be approve or reject' },
      });
    }

    const results = { succeeded: [], failed: [] };

    for (const id of ids) {
      try {
        const agent = await AgentModel.findById(id);
        if (!agent) {
          results.failed.push({ id, reason: 'Agent not found' });
          continue;
        }

        const status = action === 'approve' ? 'approved' : 'rejected';
        await AgentModel.updateStatus(id, status, action === 'reject' ? reason : null, {
          review_stage: action === 'approve' ? 'approved' : 'rejected',
        });
        results.succeeded.push(id);
      } catch (err) {
        results.failed.push({ id, reason: err.message });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Batch ${action}: ${results.succeeded.length} succeeded, ${results.failed.length} failed`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 获取 Agent 依赖的 Skill/MCP
 */
export const getAgentDependencies = async (req, res, next) => {
  try {
    const { id } = req.params;

    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    const manifest = agent.manifest || {};
    const deps = manifest.dependencies || {};
    const result = { skills: [], mcps: [] };

    // 查询依赖的 skills
    if (deps.skills && Array.isArray(deps.skills) && deps.skills.length > 0) {
      const placeholders = deps.skills.map((_, i) => `$${i + 1}`).join(', ');
      const skillsResult = await query(
        `SELECT id, name, description, version, category, rating_average, downloads_count
         FROM skills WHERE name IN (${placeholders}) AND deleted_at IS NULL AND status = 'approved'`,
        deps.skills
      );
      result.skills = skillsResult.rows;
    }

    // 查询依赖的 mcps
    if (deps.mcps && Array.isArray(deps.mcps) && deps.mcps.length > 0) {
      const placeholders = deps.mcps.map((_, i) => `$${i + 1}`).join(', ');
      const mcpsResult = await query(
        `SELECT id, name, description, version, category, rating_average, downloads_count
         FROM mcps WHERE name IN (${placeholders}) AND deleted_at IS NULL AND status = 'approved'`,
        deps.mcps
      );
      result.mcps = mcpsResult.rows;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 拒绝 Agent
 */
export const rejectAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // 检查 Agent 是否存在
    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    // 更新状态为 rejected
    const updatedAgent = await AgentModel.updateStatus(id, 'rejected', reason, {
      review_stage: 'rejected',
    });

    // 发送通知给作者
    try {
      await NotificationModel.create({
        user_id: agent.author_id,
        type: 'agent_rejected',
        title: 'Agent 审核未通过',
        content: `您的 Agent "${agent.name}" 未通过审核。${reason ? `原因: ${reason}` : ''}`,
        related_id: id
      });
    } catch (e) {
      console.error('Failed to create notification:', e);
    }

    res.json({
      success: true,
      data: updatedAgent,
      message: 'Agent rejected successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 发布 Agent（审核通过后）
 */
export const publishAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      publish_mode = 'open',
      package_registry = 'none',
      package_name,
      repository_url,
      install_hint,
      github_auto_create = false,
      github_owner = null,
    } = req.body || {};

    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    if (agent.status !== 'approved' || agent.review_stage !== 'approved') {
      return res.status(409).json({
        success: false,
        error: { message: 'Agent 尚未完成审核，不能发布' },
      });
    }

    const normalizedMode = ['open', 'commercial'].includes(String(publish_mode || '').toLowerCase())
      ? String(publish_mode).toLowerCase()
      : 'open';

    const job = await enqueueAgentPublishJob({
      agentId: id,
      requestedBy: req.user?.id || null,
      payload: {
        publish_mode: normalizedMode,
        package_registry,
        package_name: package_name || null,
        repository_url: repository_url || null,
        install_hint: install_hint || null,
        github_auto_create: Boolean(github_auto_create),
        github_owner: github_owner || null,
      },
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        queuedAt: job.queued_at,
      },
      message: '发布任务已创建，正在后台执行',
    });
  } catch (error) {
    next(error);
  }
};

export const getAgentPublishJobs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Number.parseInt(String(req.query?.limit || '10'), 10);

    const agent = await AgentModel.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    const jobs = await listAgentPublishJobs(id, limit);
    res.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    next(error);
  }
};

export const getGlobalPublishJobsAdmin = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      status,
      keyword,
      agentId,
      anomalyOnly,
      recentHours,
    } = req.query || {}

    const result = await AgentPublishJobModel.findAdminList({
      page: Number.parseInt(String(page || '1'), 10),
      pageSize: Number.parseInt(String(pageSize || '20'), 10),
      status: status || null,
      keyword: keyword || '',
      agentId: agentId || null,
      anomalyOnly: ['1', 'true', 'yes'].includes(String(anomalyOnly || '').toLowerCase()),
      recentHours: Number.parseInt(String(recentHours || ''), 10),
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export const getGlobalPublishJobsSummaryAdmin = async (req, res, next) => {
  try {
    const recentHours = Number.parseInt(String(req.query?.recentHours || '24'), 10)
    const topLimit = Number.parseInt(String(req.query?.topLimit || '5'), 10)

    const summary = await AgentPublishJobModel.getAdminSummary({
      recentHours,
      topLimit,
    })

    res.json({
      success: true,
      data: summary,
    })
  } catch (error) {
    next(error)
  }
}

export const triggerGlobalPublishJobsAlertAdmin = async (req, res, next) => {
  try {
    const recentHours = Number.parseInt(String(req.body?.recentHours || '24'), 10)
    const threshold = Math.max(1, Number.parseInt(String(req.body?.threshold || '3'), 10))
    const cooldownMinutes = Math.max(1, Number.parseInt(String(req.body?.cooldownMinutes || '30'), 10))
    const dryRun = Boolean(req.body?.dryRun)

    const summary = await AgentPublishJobModel.getAdminSummary({
      recentHours,
      topLimit: 5,
    })

    const failedCount = Number(summary?.recentWindowTotals?.failed || 0)
    const totalCount = Number(summary?.recentWindowTotals?.total || 0)
    const failureRate = totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : '0.0'

    if (failedCount < threshold) {
      return res.json({
        success: true,
        data: {
          triggered: false,
          reason: 'below-threshold',
          failedCount,
          threshold,
          recentHours,
          failureRate,
        },
        message: '当前失败数未达到阈值，无需触发告警',
      })
    }

    const cooldownResult = await query(
      `SELECT id, created_at
       FROM notifications
       WHERE type = 'publish_ops_alert'
         AND created_at >= (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 minute'))
       ORDER BY created_at DESC
       LIMIT 1`,
      [cooldownMinutes]
    )

    if (cooldownResult.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          triggered: false,
          reason: 'cooldown',
          failedCount,
          threshold,
          recentHours,
          failureRate,
          cooldownMinutes,
          latestAlertAt: cooldownResult.rows[0].created_at,
        },
        message: '告警冷却期内，已跳过本次触发',
      })
    }

    const adminUsersResult = await query(
      `SELECT id
       FROM users
       WHERE role = 'admin' AND deleted_at IS NULL`
    )
    const adminUserIds = adminUsersResult.rows.map((row) => row.id)

    const topReason = summary?.recentFailureReasons?.[0]?.reason || 'unknown'
    const alertTitle = `发布链路告警：最近 ${summary.windowHours} 小时失败 ${failedCount} 次`
    const alertContent =
      `发布任务失败数达到阈值（阈值 ${threshold}，当前 ${failedCount}），` +
      `失败率 ${failureRate}%。Top 原因：${topReason}`

    if (!dryRun) {
      await Promise.all(adminUserIds.map((adminUserId) => NotificationModel.create({
        user_id: adminUserId,
        type: 'publish_ops_alert',
        title: alertTitle,
        content: alertContent,
        related_id: null,
      })))
    }

    return res.json({
      success: true,
      data: {
        triggered: true,
        dryRun,
        recipients: adminUserIds.length,
        failedCount,
        threshold,
        recentHours,
        failureRate,
      },
      message: dryRun ? '演练完成：命中阈值，将触发告警' : '已触发发布链路告警通知',
    })
  } catch (error) {
    next(error)
  }
}

export const retryAgentPublishJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await AgentPublishJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: { message: '发布任务不存在' },
      });
    }

    if (!['failed', 'succeeded'].includes(String(job.status || ''))) {
      return res.status(409).json({
        success: false,
        error: { message: '当前任务状态不支持重试' },
      });
    }

    const newJob = await enqueueAgentPublishJob({
      agentId: job.agent_id,
      requestedBy: req.user?.id || null,
      payload: job.payload || {},
    });

    res.json({
      success: true,
      data: {
        previousJobId: job.id,
        jobId: newJob.id,
        status: newJob.status,
        queuedAt: newJob.queued_at,
      },
      message: '已创建重试任务',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 生成短期安装命令
 */
export const createAgentInstallCommand = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const requestedTtlMinutes = Number.parseInt(String(req.body?.ttlMinutes || ''), 10);
    const ttlMinutes = Number.isFinite(requestedTtlMinutes)
      ? Math.min(30, Math.max(5, requestedTtlMinutes))
      : 20;

    const agent = await AgentModel.findById(id);
    if (!agent || agent.deleted_at) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    if (agent.status !== 'approved' || agent.review_stage !== 'published') {
      return res.status(409).json({
        success: false,
        error: { message: 'Agent 尚未发布，暂不可获取安装命令' },
      });
    }

    const publishMode = agent.publish_mode || 'open';
    const { token, record } = await AgentInstallTokenModel.issue({
      agentId: agent.id,
      userId,
      publishMode,
      maxUses: publishMode === 'commercial' ? 1 : 3,
      ttlMinutes,
      metadata: {
        userAgent: req.get('user-agent') || null,
        ip: req.ip || null,
      },
    });

    const serverOrigin = buildServerOrigin(req);
    const controlledDownloadUrl = `${serverOrigin}/api/agents/install/${token}/download`;
    const fallbackFileName = `${agent.slug || agent.name}-${agent.version}.zip`;

    const openInstallCommand =
      agent.package_name && agent.package_registry && agent.package_registry !== 'none'
        ? `npm install ${agent.package_name}@${agent.version}`
        : `curl -fL "${controlledDownloadUrl}" -o "${fallbackFileName}"`;

    const installCommand =
      publishMode === 'commercial'
        ? `curl -fL "${controlledDownloadUrl}" -o "${fallbackFileName}"`
        : openInstallCommand;

    res.json({
      success: true,
      data: {
        agentId: agent.id,
        publishMode,
        expiresAt: record.expires_at,
        maxUses: record.max_uses,
        installCommand,
        downloadUrl: controlledDownloadUrl,
        installHint:
          agent.install_hint ||
          (publishMode === 'commercial'
            ? '商业版使用短期下载命令，请在有效期内执行'
            : '建议优先通过安装命令进行标准化安装'),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 使用安装 token 下载 Agent 包
 */
export const downloadAgentByInstallToken = async (req, res, next) => {
  try {
    const tokenRecord = await AgentInstallTokenModel.findUsable(req.params.token);
    if (!tokenRecord) {
      return res.status(410).json({
        success: false,
        error: { message: '安装链接已失效或使用次数已耗尽' },
      });
    }

    const agent = await AgentModel.findById(tokenRecord.agent_id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    const filePath = resolveStoredPackagePath(agent.package_url);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent package file not found' },
      });
    }

    const consumed = await AgentInstallTokenModel.consume(req.params.token);
    if (!consumed) {
      return res.status(410).json({
        success: false,
        error: { message: '安装链接已失效或使用次数已耗尽' },
      });
    }

    const fileName = path.basename(agent.package_url);
    res.download(filePath, fileName, (err) => {
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};
