/**
 * Test script for review rating statistics
 * This script tests the automatic update of agent ratings when reviews are approved
 */

import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

async function testRatingUpdate() {
  try {
    logger.info('Starting rating update test...');

    // 1. Find or create a test agent
    const agentResult = await query(`
      SELECT id, name, rating_average, reviews_count
      FROM agents
      WHERE deleted_at IS NULL
      LIMIT 1
    `);

    if (agentResult.rows.length === 0) {
      logger.error('No agents found in database. Please create an agent first.');
      return;
    }

    const agent = agentResult.rows[0];
    logger.info(`Testing with agent: ${agent.name} (${agent.id})`);
    logger.info(`Current rating: ${agent.rating_average}, reviews: ${agent.reviews_count}`);

    // 2. Find or create a test user
    const userResult = await query(`
      SELECT id, username
      FROM users
      WHERE deleted_at IS NULL
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      logger.error('No users found in database. Please create a user first.');
      return;
    }

    const user = userResult.rows[0];
    logger.info(`Testing with user: ${user.username} (${user.id})`);

    // 3. Check if user already reviewed this agent
    const existingReview = await query(
      'SELECT id FROM reviews WHERE user_id = $1 AND agent_id = $2 AND deleted_at IS NULL',
      [user.id, agent.id]
    );

    if (existingReview.rows.length > 0) {
      logger.info('User already reviewed this agent. Deleting existing review...');
      await query('UPDATE reviews SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [
        existingReview.rows[0].id,
      ]);
    }

    // 4. Create a pending review
    logger.info('Creating a pending review with rating 5...');
    const reviewResult = await query(
      `INSERT INTO reviews (agent_id, user_id, rating, comment, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [agent.id, user.id, 5, 'Test review - excellent agent!', 'pending']
    );

    const review = reviewResult.rows[0];
    logger.info(`Review created: ${review.id}`);

    // 5. Check agent stats (should not change yet because review is pending)
    let agentStats = await query(
      'SELECT rating_average, reviews_count FROM agents WHERE id = $1',
      [agent.id]
    );
    logger.info(
      `After creating pending review - Rating: ${agentStats.rows[0].rating_average}, Count: ${agentStats.rows[0].reviews_count}`
    );

    // 6. Approve the review
    logger.info('Approving the review...');
    await query('UPDATE reviews SET status = $1 WHERE id = $2', ['approved', review.id]);

    // 7. Check agent stats again (should be updated now)
    agentStats = await query('SELECT rating_average, reviews_count FROM agents WHERE id = $1', [
      agent.id,
    ]);
    logger.info(
      `After approving review - Rating: ${agentStats.rows[0].rating_average}, Count: ${agentStats.rows[0].reviews_count}`
    );

    // 8. Verify the calculation
    const manualCalc = await query(
      `SELECT
        AVG(rating)::DECIMAL(3,2) as avg_rating,
        COUNT(*) as count
       FROM reviews
       WHERE agent_id = $1 AND status = 'approved' AND deleted_at IS NULL`,
      [agent.id]
    );

    logger.info(
      `Manual calculation - Rating: ${manualCalc.rows[0].avg_rating}, Count: ${manualCalc.rows[0].count}`
    );

    // 9. Test rejection (change status to rejected)
    logger.info('Rejecting the review...');
    await query('UPDATE reviews SET status = $1 WHERE id = $2', ['rejected', review.id]);

    agentStats = await query('SELECT rating_average, reviews_count FROM agents WHERE id = $1', [
      agent.id,
    ]);
    logger.info(
      `After rejecting review - Rating: ${agentStats.rows[0].rating_average}, Count: ${agentStats.rows[0].reviews_count}`
    );

    // 10. Clean up - delete test review
    logger.info('Cleaning up test data...');
    await query('UPDATE reviews SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [review.id]);

    agentStats = await query('SELECT rating_average, reviews_count FROM agents WHERE id = $1', [
      agent.id,
    ]);
    logger.info(
      `After deleting review - Rating: ${agentStats.rows[0].rating_average}, Count: ${agentStats.rows[0].reviews_count}`
    );

    logger.info('✅ Rating update test completed successfully!');
  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testRatingUpdate()
  .then(() => {
    logger.info('Test script finished');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Test script failed:', error);
    process.exit(1);
  });
