import AgentModel from '../../models/Agent.js';
import DownloadModel from '../../models/Download.js';
import ReviewModel from '../../models/Review.js';
import NotificationModel from '../../models/Notification.js';
import { query } from '../../config/database.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const backendRoot = path.resolve(__dirname, '../..');
    const filePath = path.join(backendRoot, agent.package_url);

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
    const { page = 1, pageSize = 20, status, category, search } = req.query;

    const result = await AgentModel.findAllAdmin({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status,
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
    const updatedAgent = await AgentModel.updateStatus(id, 'approved');

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
        await AgentModel.updateStatus(id, status, action === 'reject' ? reason : null);
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
    const updatedAgent = await AgentModel.updateStatus(id, 'rejected', reason);

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
