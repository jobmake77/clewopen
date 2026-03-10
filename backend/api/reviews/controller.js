import ReviewModel from '../../models/Review.js';
import AgentModel from '../../models/Agent.js';

// Get all reviews (admin only)
export const getAllReviews = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, agentId } = req.query;

    let sql = `
      SELECT
        r.*,
        u.username,
        u.avatar_url,
        a.name as agent_name,
        a.slug as agent_slug
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN agents a ON r.agent_id = a.id
      WHERE r.deleted_at IS NULL
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by status
    if (status) {
      sql += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Filter by agent
    if (agentId) {
      sql += ` AND r.agent_id = $${paramIndex}`;
      params.push(agentId);
      paramIndex++;
    }

    sql += ` ORDER BY r.created_at DESC`;

    // Pagination
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const { query } = await import('../../config/database.js');
    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM reviews r
      WHERE r.deleted_at IS NULL
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countSql += ` AND r.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (agentId) {
      countSql += ` AND r.agent_id = $${countParamIndex}`;
      countParams.push(agentId);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        reviews: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get review by ID
export const getReviewById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found' },
      });
    }

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// Approve review (admin only)
export const approveReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found' },
      });
    }

    if (review.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: { message: 'Review is already approved' },
      });
    }

    // Update review status to approved
    const updatedReview = await ReviewModel.update(id, { status: 'approved' });

    res.json({
      success: true,
      data: {
        review: updatedReview,
        message: 'Review approved successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};

// Reject review (admin only)
export const rejectReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found' },
      });
    }

    if (review.status === 'rejected') {
      return res.status(400).json({
        success: false,
        error: { message: 'Review is already rejected' },
      });
    }

    // Update review status to rejected
    const updatedReview = await ReviewModel.update(id, { status: 'rejected' });

    res.json({
      success: true,
      data: {
        review: updatedReview,
        message: 'Review rejected successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete review (admin only)
export const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found' },
      });
    }

    await ReviewModel.delete(id);

    res.json({
      success: true,
      data: { message: 'Review deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
};

// Update review (user can update their own review if still pending)
export const updateReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found' },
      });
    }

    // Check if user owns the review
    if (review.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { message: 'You can only update your own reviews' },
      });
    }

    // Only allow updates if review is still pending
    if (review.status !== 'pending' && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: { message: 'You can only update pending reviews' },
      });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Rating must be between 1 and 5' },
      });
    }

    const updateData = {};
    if (rating !== undefined) updateData.rating = rating;
    if (comment !== undefined) updateData.comment = comment;

    const updatedReview = await ReviewModel.update(id, updateData);

    res.json({
      success: true,
      data: {
        review: updatedReview,
        message: 'Review updated successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};
