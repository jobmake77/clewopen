import AgentModel from '../../models/Agent.js';
import DownloadModel from '../../models/Download.js';
import ReviewModel from '../../models/Review.js';
import NotificationModel from '../../models/Notification.js';
import AgentInstallTokenModel from '../../models/AgentInstallToken.js';
import AgentInstallEventModel from '../../models/AgentInstallEvent.js';
import AgentPublishJobModel from '../../models/AgentPublishJob.js';
import {
  enqueueAgentPublishJob,
  listAgentPublishJobs,
} from '../../services/agentPublishService.js';
import { query } from '../../config/database.js';
import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
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

const INSTALL_MODE_FULL = 'full';
const INSTALL_MODE_ENHANCE = 'enhance';
const INSTALL_MODE_CUSTOM = 'custom';
const SUPPORTED_INSTALL_MODES = new Set([
  INSTALL_MODE_FULL,
  INSTALL_MODE_ENHANCE,
  INSTALL_MODE_CUSTOM,
]);
const ENHANCE_EXCLUDE_BASENAMES = new Set(['memory.md', 'soul.md']);

function buildNormalizedErrorReasonSql(errorExpr, metadataExpr = null) {
  const metadataCategoryExpr = metadataExpr
    ? `LOWER(COALESCE(NULLIF(BTRIM(${metadataExpr} ->> 'reason_category'), ''), ''))`
    : `''`
  return `
    CASE
      WHEN ${metadataCategoryExpr} IN ('timeout','network','auth','dependency','validation','storage','permission','other','unknown')
        THEN ${metadataCategoryExpr}
      WHEN ${errorExpr} IS NULL OR BTRIM(${errorExpr}) = '' THEN 'unknown'
      WHEN LOWER(${errorExpr}) LIKE '%timeout%' OR LOWER(${errorExpr}) LIKE '%timed out%' THEN 'timeout'
      WHEN LOWER(${errorExpr}) LIKE '%network%' OR LOWER(${errorExpr}) LIKE '%enotfound%' OR LOWER(${errorExpr}) LIKE '%econn%' THEN 'network'
      WHEN LOWER(${errorExpr}) LIKE '%unauthorized%' OR LOWER(${errorExpr}) LIKE '%forbidden%' OR LOWER(${errorExpr}) LIKE '%401%' OR LOWER(${errorExpr}) LIKE '%403%' OR LOWER(${errorExpr}) LIKE '%auth%' THEN 'auth'
      WHEN LOWER(${errorExpr}) LIKE '%dependency%' OR LOWER(${errorExpr}) LIKE '%module not found%' OR LOWER(${errorExpr}) LIKE '%not found%' THEN 'dependency'
      WHEN LOWER(${errorExpr}) LIKE '%invalid%' OR LOWER(${errorExpr}) LIKE '%parse%' OR LOWER(${errorExpr}) LIKE '%manifest%' THEN 'validation'
      WHEN LOWER(${errorExpr}) LIKE '%disk%' OR LOWER(${errorExpr}) LIKE '%storage%' OR LOWER(${errorExpr}) LIKE '%space%' THEN 'storage'
      WHEN LOWER(${errorExpr}) LIKE '%permission%' OR LOWER(${errorExpr}) LIKE '%denied%' OR LOWER(${errorExpr}) LIKE '%eacces%' THEN 'permission'
      ELSE 'other'
    END
  `
}

function getReasonSuggestedAction(reasonCategory) {
  const key = String(reasonCategory || 'unknown').toLowerCase()
  const mapping = {
    timeout: '优先检查 trial/runtime 网络连通性与上游响应时延，必要时延长超时并重试。',
    network: '检查 DNS、出口网络、目标域名可达性与代理配置，确认无临时封禁。',
    auth: '检查 API Key/Token 是否过期、权限范围是否正确，并核验请求头格式。',
    dependency: '检查 Agent manifest 依赖声明，确认所需 Skill/MCP 已同步可用。',
    validation: '检查 ZIP 包结构与 manifest 字段合法性，重点核对必填文件与版本格式。',
    storage: '检查磁盘空间、对象存储配额和 I/O 错误，必要时执行清理任务。',
    permission: '检查运行账号与目录权限（读写/执行），确认容器挂载路径权限正确。',
    other: '查看最近失败样本日志，按高频关键词补充新的归一规则与专项告警。',
    unknown: '先抓取最近失败原文进行人工分类，再补充自动归一规则。',
  }
  return mapping[key] || mapping.unknown
}

function normalizeZipEntryName(name) {
  return String(name || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

function getEntryBasename(entryName) {
  const normalized = normalizeZipEntryName(entryName);
  const parts = normalized.split('/');
  return (parts[parts.length - 1] || '').toLowerCase();
}

function getInstallFileGroup(entryName) {
  const normalized = normalizeZipEntryName(entryName).toLowerCase();
  const basename = getEntryBasename(entryName);

  if (basename === 'identity.md' || basename === 'soul.md' || basename === 'memory.md') {
    return 'core';
  }
  if (basename === 'rules.md' || basename === 'agents.md') {
    return 'rules';
  }
  if (basename === 'tools.md' || basename === 'skills.md' || basename === 'mcp.md') {
    return 'capability';
  }
  if (basename === 'manifest.json' || basename === 'readme.md' || normalized.includes('/docs/')) {
    return 'docs';
  }
  return 'other';
}

function buildInstallModes(availableFiles) {
  const all = availableFiles.map((item) => item.path);
  const enhance = availableFiles
    .filter((item) => !ENHANCE_EXCLUDE_BASENAMES.has(item.basename))
    .map((item) => item.path);
  return {
    full: all,
    enhance,
    custom: [],
  };
}

function resolveSelectedFiles({ mode, selectedFiles, availableFilePaths, defaults }) {
  const availableSet = new Set(availableFilePaths);
  if (mode === INSTALL_MODE_FULL) {
    return defaults.full;
  }
  if (mode === INSTALL_MODE_ENHANCE) {
    return defaults.enhance;
  }
  if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
    const error = new Error('custom 模式必须至少选择 1 个文件');
    error.statusCode = 400;
    throw error;
  }
  const normalized = selectedFiles
    .map((item) => normalizeZipEntryName(item))
    .filter((item) => Boolean(item));
  const unique = [...new Set(normalized)];
  const invalid = unique.filter((item) => !availableSet.has(item));
  if (invalid.length > 0) {
    const error = new Error(`存在无效文件路径: ${invalid.slice(0, 3).join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  return unique;
}

async function listAgentPackageInstallFiles(packageUrl) {
  const filePath = resolveStoredPackagePath(packageUrl);
  await fs.access(filePath);
  const zip = new AdmZip(filePath);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => normalizeZipEntryName(entry.entryName))
    .filter((entryName) => {
      if (!entryName) return false;
      const basename = getEntryBasename(entryName);
      return basename.endsWith('.md') || basename === 'manifest.json';
    });

  const uniqueEntries = [...new Set(entries)];
  const installFiles = uniqueEntries.map((entryName) => ({
    path: entryName,
    basename: getEntryBasename(entryName),
    group: getInstallFileGroup(entryName),
  }));

  return installFiles.sort((a, b) => a.path.localeCompare(b.path));
}

async function resolveMissingDependencies(manifestDependencies = {}) {
  const declaredSkills = Array.isArray(manifestDependencies.skills)
    ? manifestDependencies.skills.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const declaredMcps = Array.isArray(manifestDependencies.mcps)
    ? manifestDependencies.mcps.filter((item) => typeof item === 'string' && item.trim())
    : [];

  const found = {
    skills: [],
    mcps: [],
  };

  if (declaredSkills.length > 0) {
    const result = await query(
      `SELECT name
       FROM skills
       WHERE status = 'approved'
         AND deleted_at IS NULL
         AND name = ANY($1::text[])`,
      [declaredSkills]
    );
    found.skills = result.rows.map((row) => row.name);
  }

  if (declaredMcps.length > 0) {
    const result = await query(
      `SELECT name
       FROM mcps
       WHERE status = 'approved'
         AND deleted_at IS NULL
         AND name = ANY($1::text[])`,
      [declaredMcps]
    );
    found.mcps = result.rows.map((row) => row.name);
  }

  return {
    skills: declaredSkills.filter((item) => !found.skills.includes(item)),
    mcps: declaredMcps.filter((item) => !found.mcps.includes(item)),
    packages: Array.isArray(manifestDependencies.packages) ? manifestDependencies.packages : [],
  };
}

function buildInstallWarnings({ mode, selectedFiles, missingDependencies, publishMode }) {
  const warnings = [];
  const lowerFileNames = selectedFiles.map((item) => getEntryBasename(item));

  if (mode === INSTALL_MODE_FULL || lowerFileNames.includes('memory.md') || lowerFileNames.includes('soul.md')) {
    warnings.push('当前安装可能覆盖本地 MEMORY/SOUL 配置，建议先备份当前工作区。');
  }

  if (missingDependencies.skills.length > 0 || missingDependencies.mcps.length > 0) {
    warnings.push('检测到部分 Skill/MCP 依赖未在平台可用，落地效果可能受影响。');
  }

  if (publishMode === 'commercial') {
    warnings.push('商业分发链接具有时效与次数限制，请尽快执行安装。');
  }

  return warnings;
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

export const getGlobalInstallEventsSummaryAdmin = async (req, res, next) => {
  try {
    const requestedDays = Number.parseInt(String(req.query?.recentDays || '7'), 10)
    const recentDays = Number.isFinite(requestedDays)
      ? Math.min(30, Math.max(1, requestedDays))
      : 7
    const normalizedReasonSql = buildNormalizedErrorReasonSql('error_message', 'metadata')

    const totalsResult = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM agent_install_events`
    )
    const recentTotalsResult = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM agent_install_events
       WHERE created_at >= NOW() - ($1::text || ' day')::interval`,
      [String(recentDays)]
    )
    const topFailedAgentsResult = await query(
      `SELECT
         e.agent_id,
         a.name AS agent_name,
         COUNT(*)::int AS failed_count,
         MAX(e.created_at) AS latest_failed_at
       FROM agent_install_events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.status = 'failed'
         AND e.created_at >= NOW() - ($1::text || ' day')::interval
       GROUP BY e.agent_id, a.name
       ORDER BY failed_count DESC, latest_failed_at DESC
       LIMIT 10`,
      [String(recentDays)]
    )
    const topFailureReasonsResult = await query(
      `SELECT
         reason_category,
         MIN(raw_reason) AS sample_reason,
         COUNT(*)::int AS failed_count,
         MAX(created_at) AS latest_failed_at
       FROM (
         SELECT
           ${normalizedReasonSql} AS reason_category,
           COALESCE(NULLIF(TRIM(error_message), ''), 'unknown') AS raw_reason,
           created_at
         FROM agent_install_events
         WHERE status = 'failed'
           AND created_at >= NOW() - ($1::text || ' day')::interval
       ) t
       GROUP BY reason_category
       ORDER BY failed_count DESC, latest_failed_at DESC
       LIMIT 10`,
      [String(recentDays)]
    )

    const totals = totalsResult.rows[0] || { total: 0, success_count: 0, failed_count: 0 }
    const recentWindowTotals = recentTotalsResult.rows[0] || { total: 0, success_count: 0, failed_count: 0 }
    const recentTotal = Number(recentWindowTotals.total || 0)
    const recentSuccessRate = recentTotal > 0
      ? Number((Number(recentWindowTotals.success_count || 0) / recentTotal).toFixed(4))
      : 0

    res.json({
      success: true,
      data: {
        windowDays: recentDays,
        totals,
        recentWindowTotals,
        recentSuccessRate,
        topFailedAgents: topFailedAgentsResult.rows || [],
        topFailureReasons: (topFailureReasonsResult.rows || []).map((item) => ({
          reason: item.reason_category,
          sampleReason: item.sample_reason,
          failed_count: item.failed_count,
          latest_failed_at: item.latest_failed_at,
        })),
        suggestedActions: (topFailureReasonsResult.rows || []).map((item) => ({
          reason: item.reason_category,
          action: getReasonSuggestedAction(item.reason_category),
          failed_count: item.failed_count,
          sampleReason: item.sample_reason,
        })),
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getGlobalInstallEventsAdmin = async (req, res, next) => {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10)
    const requestedPageSize = Number.parseInt(String(req.query?.pageSize || '20'), 10)
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(100, Math.max(1, requestedPageSize))
      : 20
    const status = String(req.query?.status || 'all').trim().toLowerCase()
    const mode = String(req.query?.mode || 'all').trim().toLowerCase()
    const reasonCategory = String(req.query?.reasonCategory || 'all').trim().toLowerCase()
    const keyword = String(req.query?.keyword || '').trim()
    const normalizedReasonSql = buildNormalizedErrorReasonSql('e.error_message', 'e.metadata')

    const whereParts = []
    const params = []
    let paramIndex = 1

    if (status !== 'all') {
      whereParts.push(`e.status = $${paramIndex}`)
      params.push(status)
      paramIndex += 1
    }
    if (mode !== 'all') {
      whereParts.push(`e.mode = $${paramIndex}`)
      params.push(mode)
      paramIndex += 1
    }
    if (reasonCategory !== 'all') {
      whereParts.push(`${normalizedReasonSql} = $${paramIndex}`)
      params.push(reasonCategory)
      paramIndex += 1
    }
    if (keyword) {
      whereParts.push(`(
        a.name ILIKE $${paramIndex}
        OR u.username ILIKE $${paramIndex}
        OR COALESCE(e.error_message, '') ILIKE $${paramIndex}
      )`)
      params.push(`%${keyword}%`)
      paramIndex += 1
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const listResult = await query(
      `SELECT
         e.*,
         a.name AS agent_name,
         a.slug AS agent_slug,
         u.username AS username,
         ${normalizedReasonSql} AS normalized_reason
       FROM agent_install_events e
       LEFT JOIN agents a ON a.id = e.agent_id
       LEFT JOIN users u ON u.id = e.user_id
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    )
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM agent_install_events e
       LEFT JOIN agents a ON a.id = e.agent_id
       LEFT JOIN users u ON u.id = e.user_id
       ${whereClause}`,
      params
    )

    res.json({
      success: true,
      data: {
        items: listResult.rows || [],
        page,
        pageSize,
        total: Number(countResult.rows?.[0]?.total || 0),
      },
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
 * 获取 Agent 安装选项
 */
export const getAgentInstallOptions = async (req, res, next) => {
  try {
    const { id } = req.params;
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
        error: { message: 'Agent 尚未发布，暂不可获取安装选项' },
      });
    }

    const availableFiles = await listAgentPackageInstallFiles(agent.package_url);
    const defaults = buildInstallModes(availableFiles);
    const recommendedMode =
      defaults.full.length > defaults.enhance.length ? INSTALL_MODE_ENHANCE : INSTALL_MODE_FULL;

    res.json({
      success: true,
      data: {
        agentId: agent.id,
        modes: [
          { key: INSTALL_MODE_FULL, label: '全量安装', defaultFilesCount: defaults.full.length },
          { key: INSTALL_MODE_ENHANCE, label: '增强安装', defaultFilesCount: defaults.enhance.length },
          { key: INSTALL_MODE_CUSTOM, label: '自选文件', defaultFilesCount: 0 },
        ],
        availableFiles,
        defaults,
        recommendedMode,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 安装预检（dry-run）
 */
export const previewAgentInstallPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const requestedMode = String(req.body?.mode || INSTALL_MODE_FULL).trim().toLowerCase();
    const mode = SUPPORTED_INSTALL_MODES.has(requestedMode) ? requestedMode : INSTALL_MODE_FULL;

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
        error: { message: 'Agent 尚未发布，暂不可预检安装计划' },
      });
    }

    const availableFiles = await listAgentPackageInstallFiles(agent.package_url);
    const defaults = buildInstallModes(availableFiles);
    const resolvedFiles = resolveSelectedFiles({
      mode,
      selectedFiles: req.body?.selectedFiles,
      availableFilePaths: availableFiles.map((item) => item.path),
      defaults,
    });
    const missingDependencies = await resolveMissingDependencies(agent.manifest?.dependencies || {});
    const warnings = buildInstallWarnings({
      mode,
      selectedFiles: resolvedFiles,
      missingDependencies,
      publishMode: agent.publish_mode || 'open',
    });
    const fullSet = new Set(defaults.full);
    const resolvedSet = new Set(resolvedFiles);
    const skippedByMode = [...fullSet].filter((file) => !resolvedSet.has(file));

    const conflicts = resolvedFiles
      .filter((entry) => ['memory.md', 'soul.md'].includes(getEntryBasename(entry)))
      .map((entry) => ({
        file: entry,
        type: 'replace_possible',
        message: '该文件可能覆盖你的本地个性化配置',
      }));

    res.json({
      success: true,
      data: {
        mode,
        resolvedFiles,
        planDetails: {
          willInstall: resolvedFiles,
          skippedByMode,
        },
        conflicts,
        missingDependencies,
        warnings,
        summary: {
          selectedCount: resolvedFiles.length,
          conflictsCount: conflicts.length,
          skippedCount: skippedByMode.length,
          missingDependencyCount:
            missingDependencies.skills.length + missingDependencies.mcps.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 上报安装结果
 */
export const reportAgentInstallFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const requestedMode = String(req.body?.mode || INSTALL_MODE_FULL).trim().toLowerCase();
    const mode = SUPPORTED_INSTALL_MODES.has(requestedMode) ? requestedMode : INSTALL_MODE_FULL;
    const status = String(req.body?.status || '').trim().toLowerCase();
    const supportedStatus = new Set(['success', 'failed']);
    if (!supportedStatus.has(status)) {
      return res.status(400).json({
        success: false,
        error: { message: 'status 必须为 success 或 failed' },
      });
    }

    const agent = await AgentModel.findById(id);
    if (!agent || agent.deleted_at) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    const includedFiles = Array.isArray(req.body?.includedFiles)
      ? req.body.includedFiles.map((item) => String(item)).filter((item) => Boolean(item))
      : [];
    const errorMessage = req.body?.errorMessage ? String(req.body.errorMessage).slice(0, 500) : null;

    const event = await AgentInstallEventModel.create({
      userId,
      agentId: agent.id,
      mode,
      status,
      includedFiles,
      errorMessage,
      source: 'agent_detail_modal',
      metadata: req.body?.metadata || {},
    });

    res.json({
      success: true,
      data: event,
      message: status === 'success' ? '已记录安装成功' : '已记录安装失败',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 获取当前用户安装历史
 */
export const getAgentInstallHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const limit = Number.parseInt(String(req.query?.limit || '20'), 10);

    const agent = await AgentModel.findById(id);
    if (!agent || agent.deleted_at) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agent not found' },
      });
    }

    const events = await AgentInstallEventModel.listByUserAndAgent(userId, agent.id, limit);
    const successCount = events.filter((item) => item.status === 'success').length;
    const failedCount = events.filter((item) => item.status === 'failed').length;

    res.json({
      success: true,
      data: {
        events,
        summary: {
          total: events.length,
          successCount,
          failedCount,
          lastSuccessAt: events.find((item) => item.status === 'success')?.created_at || null,
        },
      },
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
    const requestedMode = String(req.body?.mode || INSTALL_MODE_FULL).trim().toLowerCase();
    const mode = SUPPORTED_INSTALL_MODES.has(requestedMode) ? requestedMode : INSTALL_MODE_FULL;
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

    const availableFiles = await listAgentPackageInstallFiles(agent.package_url);
    const defaults = buildInstallModes(availableFiles);
    const includedFiles = resolveSelectedFiles({
      mode,
      selectedFiles: req.body?.selectedFiles,
      availableFilePaths: availableFiles.map((item) => item.path),
      defaults,
    });
    const missingDependencies = await resolveMissingDependencies(agent.manifest?.dependencies || {});
    const previewWarnings = buildInstallWarnings({
      mode,
      selectedFiles: includedFiles,
      missingDependencies,
      publishMode: agent.publish_mode || 'open',
    });

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
        mode,
        included_files: includedFiles,
        preview_summary: {
          selectedCount: includedFiles.length,
          missingDependencies: {
            skills: missingDependencies.skills.length,
            mcps: missingDependencies.mcps.length,
          },
        },
      },
    });

    const serverOrigin = buildServerOrigin(req);
    const controlledDownloadUrl = `${serverOrigin}/api/agents/install/${token}/download`;
    const fallbackFileName = `${agent.slug || agent.name}-${agent.version}.zip`;
    const includeArg = includedFiles.length > 0
      ? ` --include "${includedFiles.join(',')}"`
      : '';
    const modeArg = ` --mode ${mode}`;

    const openInstallCommand =
      agent.package_name && agent.package_registry && agent.package_registry !== 'none'
        ? `npm install ${agent.package_name}@${agent.version}`
        : `openclew install "${controlledDownloadUrl}"${modeArg}${includeArg}`;

    const installCommand =
      publishMode === 'commercial'
        ? `openclew install "${controlledDownloadUrl}"${modeArg}${includeArg}`
        : (mode === INSTALL_MODE_FULL ? openInstallCommand : `openclew install "${controlledDownloadUrl}"${modeArg}${includeArg}`);

    res.json({
      success: true,
      data: {
        agentId: agent.id,
        mode,
        includedFiles,
        publishMode,
        expiresAt: record.expires_at,
        maxUses: record.max_uses,
        installCommand,
        downloadUrl: controlledDownloadUrl,
        downloadCommand: `curl -fL "${controlledDownloadUrl}" -o "${fallbackFileName}"`,
        warnings: previewWarnings,
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
