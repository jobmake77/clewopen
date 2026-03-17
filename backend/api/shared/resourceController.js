import DownloadModel from '../../models/Download.js';
import ReviewModel from '../../models/Review.js';
import NotificationModel from '../../models/Notification.js';
import ResourceVisitModel from '../../models/ResourceVisit.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 创建通用资源 Controller（Skill/MCP 共用）
 * @param {object} Model - 资源 Model
 * @param {string} resourceType - 'skill' | 'mcp'
 * @param {string} resourceLabel - 显示名称
 */
export function createResourceController(Model, resourceType, resourceLabel) {
  const getItems = async (req, res, next) => {
    try {
      const { page = 1, pageSize = 20, category, search, sort, sourceType, sourcePlatform } = req.query;
      const result = await Model.findAll({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        category,
        search,
        sort,
        sourceType,
        sourcePlatform,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  const getItemById = async (req, res, next) => {
    try {
      const item = await Model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  const downloadItem = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const item = await Model.findById(id);

      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }

      if (item.source_type === 'external') {
        return res.status(409).json({
          success: false,
          error: {
            message: `${resourceLabel} 为外部资源，请前往原始链接访问`,
            code: 'EXTERNAL_RESOURCE',
            external_url: item.external_url,
            source_platform: item.source_platform,
          },
        });
      }

      const backendRoot = path.resolve(__dirname, '../../..');
      const filePath = path.join(backendRoot, item.package_url);

      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ success: false, error: { message: 'Package file not found' } });
      }

      await DownloadModel.create({
        resource_id: id,
        user_id: userId,
        version: item.version,
        resource_type: resourceType,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      });

      const fileName = path.basename(item.package_url);
      res.download(filePath, fileName, (err) => {
        if (err && !res.headersSent) next(err);
      });
    } catch (error) {
      next(error);
    }
  };

  const rateItem = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rating, comment } = req.body;
      const userId = req.user.id;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: { message: 'Rating must be between 1 and 5' } });
      }

      const item = await Model.findById(id);
      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }

      const existingReview = await ReviewModel.findByUserAndResource(userId, id, resourceType);
      if (existingReview) {
        return res.status(400).json({ success: false, error: { message: `You have already reviewed this ${resourceLabel}` } });
      }

      const review = await ReviewModel.create({
        resource_id: id,
        user_id: userId,
        rating,
        comment,
        resource_type: resourceType,
        status: 'pending',
      });

      res.json({
        success: true,
        data: { review, message: 'Review submitted successfully. It will be visible after approval.' },
      });
    } catch (error) {
      next(error);
    }
  };

  const getItemReviews = async (req, res, next) => {
    try {
      const { page = 1, pageSize = 10 } = req.query;
      const result = await Model.getReviews(req.params.id, {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      }, resourceType);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  const getTrendingItems = async (req, res, next) => {
    try {
      const { limit = 10, days = 7, sourceType, sourcePlatform } = req.query;
      const items = await Model.getTrending({
        limit: parseInt(limit),
        days: parseInt(days),
        sourceType,
        sourcePlatform,
      });
      res.json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  };

  const visitExternalItem = async (req, res, next) => {
    try {
      const item = await Model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }

      if (item.source_type !== 'external' || !item.external_url) {
        return res.status(400).json({
          success: false,
          error: { message: `${resourceLabel} 不是外部资源` },
        });
      }

      await ResourceVisitModel.create({
        resource_id: item.id,
        resource_type: resourceType,
        user_id: req.user?.id || null,
        source_type: item.source_type,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      });

      res.json({
        success: true,
        data: {
          external_url: item.external_url,
          source_platform: item.source_platform,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin functions
  const getAllAdmin = async (req, res, next) => {
    try {
      const { page = 1, pageSize = 20, status, category, search, sourceType, sourcePlatform } = req.query;
      const result = await Model.findAllAdmin({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        status,
        category,
        search,
        sourceType,
        sourcePlatform,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  const getPendingItems = async (req, res, next) => {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const result = await Model.findAllAdmin({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        status: 'pending',
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  const approveItem = async (req, res, next) => {
    try {
      const { id } = req.params;
      const item = await Model.findById(id);
      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }

      const updated = await Model.updateStatus(id, 'approved');

      try {
        await NotificationModel.create({
          user_id: item.author_id,
          type: `${resourceType}_approved`,
          title: `${resourceLabel} 审核通过`,
          content: `您的 ${resourceLabel} "${item.name}" 已通过审核，现在已在市场上可见。`,
          related_id: id,
        });
      } catch (e) {
        console.error('Failed to create notification:', e);
      }

      res.json({ success: true, data: updated, message: `${resourceLabel} approved successfully` });
    } catch (error) {
      next(error);
    }
  };

  const rejectItem = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const item = await Model.findById(id);
      if (!item) {
        return res.status(404).json({ success: false, error: { message: `${resourceLabel} not found` } });
      }

      const updated = await Model.updateStatus(id, 'rejected', reason);

      try {
        await NotificationModel.create({
          user_id: item.author_id,
          type: `${resourceType}_rejected`,
          title: `${resourceLabel} 审核未通过`,
          content: `您的 ${resourceLabel} "${item.name}" 未通过审核。${reason ? `原因: ${reason}` : ''}`,
          related_id: id,
        });
      } catch (e) {
        console.error('Failed to create notification:', e);
      }

      res.json({ success: true, data: updated, message: `${resourceLabel} rejected successfully` });
    } catch (error) {
      next(error);
    }
  };

  const batchAction = async (req, res, next) => {
    try {
      const { ids, action, reason } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'ids must be a non-empty array' } });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: { message: 'action must be approve or reject' } });
      }

      const results = { succeeded: [], failed: [] };

      for (const id of ids) {
        try {
          const item = await Model.findById(id);
          if (!item) {
            results.failed.push({ id, reason: `${resourceLabel} not found` });
            continue;
          }
          const status = action === 'approve' ? 'approved' : 'rejected';
          await Model.updateStatus(id, status, action === 'reject' ? reason : null);
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

  return {
    getItems,
    getItemById,
    downloadItem,
    rateItem,
    getItemReviews,
    getTrendingItems,
    visitExternalItem,
    getAllAdmin,
    getPendingItems,
    approveItem,
    rejectItem,
    batchAction,
  };
}
