import express from 'express';
import {
  getAllReviews,
  getReviewById,
  approveReview,
  rejectReview,
  deleteReview,
  updateReview,
} from './controller.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { auditLog } from '../../middleware/auditLog.js';

const router = express.Router();

// Admin routes - manage all reviews
router.get('/', authenticate, authorize('admin'), getAllReviews);
router.get('/:id', authenticate, authorize('admin'), getReviewById);
router.post('/:id/approve', authenticate, authorize('admin'), auditLog('review_approve'), approveReview);
router.post('/:id/reject', authenticate, authorize('admin'), auditLog('review_reject'), rejectReview);
router.delete('/:id', authenticate, authorize('admin'), auditLog('review_delete'), deleteReview);

// User routes - update own review
router.put('/:id', authenticate, updateReview);

export default router;
