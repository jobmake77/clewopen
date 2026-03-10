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

const router = express.Router();

// Admin routes - manage all reviews
router.get('/', authenticate, authorize('admin'), getAllReviews);
router.get('/:id', authenticate, authorize('admin'), getReviewById);
router.post('/:id/approve', authenticate, authorize('admin'), approveReview);
router.post('/:id/reject', authenticate, authorize('admin'), rejectReview);
router.delete('/:id', authenticate, authorize('admin'), deleteReview);

// User routes - update own review
router.put('/:id', authenticate, updateReview);

export default router;
