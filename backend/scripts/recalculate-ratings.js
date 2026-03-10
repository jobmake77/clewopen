/**
 * Recalculate all agent ratings
 * This script manually recalculates rating_average and reviews_count for all agents
 * Use this if you suspect the statistics are out of sync
 */

import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

async function recalculateAllRatings() {
  try {
    logger.info('Starting to recalculate all agent ratings...');

    // Get all agents
    const agentsResult = await query(`
      SELECT id, name, rating_average, reviews_count
      FROM agents
      WHERE deleted_at IS NULL
      ORDER BY name
    `);

    const agents = agentsResult.rows;
    logger.info(`Found ${agents.length} agents to process`);

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const agent of agents) {
      // Calculate correct statistics
      const statsResult = await query(
        `
        SELECT
          COALESCE(AVG(rating)::DECIMAL(3,2), 0) as avg_rating,
          COUNT(*) as review_count
        FROM reviews
        WHERE agent_id = $1
          AND status = 'approved'
          AND deleted_at IS NULL
      `,
        [agent.id]
      );

      const correctStats = statsResult.rows[0];
      const currentAvg = parseFloat(agent.rating_average) || 0;
      const currentCount = parseInt(agent.reviews_count) || 0;
      const correctAvg = parseFloat(correctStats.avg_rating) || 0;
      const correctCount = parseInt(correctStats.review_count) || 0;

      // Check if update is needed
      if (currentAvg !== correctAvg || currentCount !== correctCount) {
        logger.info(`Updating ${agent.name}:`);
        logger.info(
          `  Current: avg=${currentAvg}, count=${currentCount}`
        );
        logger.info(
          `  Correct: avg=${correctAvg}, count=${correctCount}`
        );

        // Update the agent
        await query(
          `
          UPDATE agents
          SET
            rating_average = $1,
            reviews_count = $2
          WHERE id = $3
        `,
          [correctAvg, correctCount, agent.id]
        );

        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    logger.info('✅ Recalculation completed!');
    logger.info(`  Updated: ${updatedCount} agents`);
    logger.info(`  Unchanged: ${unchangedCount} agents`);
    logger.info(`  Total: ${agents.length} agents`);

    // Show summary statistics
    const summaryResult = await query(`
      SELECT
        COUNT(*) as total_agents,
        SUM(reviews_count) as total_reviews,
        AVG(rating_average)::DECIMAL(3,2) as overall_avg_rating,
        MAX(rating_average) as max_rating,
        MIN(rating_average) as min_rating
      FROM agents
      WHERE deleted_at IS NULL
        AND reviews_count > 0
    `);

    const summary = summaryResult.rows[0];
    logger.info('\n📊 Summary Statistics:');
    logger.info(`  Agents with reviews: ${summary.total_agents}`);
    logger.info(`  Total reviews: ${summary.total_reviews}`);
    logger.info(`  Overall average rating: ${summary.overall_avg_rating}`);
    logger.info(`  Highest rating: ${summary.max_rating}`);
    logger.info(`  Lowest rating: ${summary.min_rating}`);
  } catch (error) {
    logger.error('❌ Recalculation failed:', error);
    throw error;
  }
}

// Run the script
recalculateAllRatings()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
