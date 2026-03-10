import { query } from '../config/database.js';
import DownloadModel from '../models/Download.js';
import AgentModel from '../models/Agent.js';

/**
 * Test script to verify download count functionality
 * This script tests:
 * 1. Database trigger automatically increments downloads_count
 * 2. Download records are created correctly
 * 3. Agent statistics are updated properly
 */

async function testDownloadCount() {
  console.log('🧪 Starting download count test...\n');

  try {
    // Step 1: Get a test agent
    console.log('📋 Step 1: Finding a test agent...');
    const agentsResult = await query(
      'SELECT id, name, downloads_count FROM agents WHERE deleted_at IS NULL LIMIT 1'
    );

    if (agentsResult.rows.length === 0) {
      console.error('❌ No agents found in database. Please seed data first.');
      process.exit(1);
    }

    const testAgent = agentsResult.rows[0];
    console.log(`✅ Found agent: ${testAgent.name} (ID: ${testAgent.id})`);
    console.log(`   Current download count: ${testAgent.downloads_count}\n`);

    // Step 2: Get a test user
    console.log('📋 Step 2: Finding a test user...');
    const usersResult = await query(
      'SELECT id, username FROM users WHERE deleted_at IS NULL LIMIT 1'
    );

    if (usersResult.rows.length === 0) {
      console.error('❌ No users found in database. Please seed data first.');
      process.exit(1);
    }

    const testUser = usersResult.rows[0];
    console.log(`✅ Found user: ${testUser.username} (ID: ${testUser.id})\n`);

    // Step 3: Record initial download count
    const initialCount = testAgent.downloads_count;
    console.log('📋 Step 3: Recording initial state...');
    console.log(`   Initial downloads_count: ${initialCount}\n`);

    // Step 4: Create a download record
    console.log('📋 Step 4: Creating download record...');
    const download = await DownloadModel.create({
      agent_id: testAgent.id,
      user_id: testUser.id,
      version: '1.0.0',
      ip_address: '127.0.0.1',
      user_agent: 'Test Script',
    });
    console.log(`✅ Download record created (ID: ${download.id})\n`);

    // Step 5: Verify download count was incremented
    console.log('📋 Step 5: Verifying download count update...');
    const updatedAgent = await AgentModel.findById(testAgent.id);
    const newCount = updatedAgent.downloads_count;

    console.log(`   Previous count: ${initialCount}`);
    console.log(`   Current count:  ${newCount}`);
    console.log(`   Difference:     ${newCount - initialCount}\n`);

    if (newCount === initialCount + 1) {
      console.log('✅ SUCCESS: Download count was incremented correctly!\n');
    } else {
      console.log('❌ FAILURE: Download count was not incremented correctly!\n');
      process.exit(1);
    }

    // Step 6: Test download statistics
    console.log('📋 Step 6: Testing download statistics...');
    const stats = await DownloadModel.getAgentStats(testAgent.id);
    console.log(`   Total downloads: ${stats.total_downloads}`);
    console.log(`   Unique users:    ${stats.unique_users}`);
    console.log(`   Active days:     ${stats.active_days}\n`);

    // Step 7: Verify trigger works with multiple downloads
    console.log('📋 Step 7: Testing multiple downloads...');
    const beforeMultiple = updatedAgent.downloads_count;

    await DownloadModel.create({
      agent_id: testAgent.id,
      user_id: testUser.id,
      version: '1.0.0',
      ip_address: '127.0.0.2',
      user_agent: 'Test Script 2',
    });

    await DownloadModel.create({
      agent_id: testAgent.id,
      user_id: testUser.id,
      version: '1.0.0',
      ip_address: '127.0.0.3',
      user_agent: 'Test Script 3',
    });

    const afterMultiple = await AgentModel.findById(testAgent.id);
    console.log(`   Before: ${beforeMultiple}`);
    console.log(`   After:  ${afterMultiple.downloads_count}`);
    console.log(`   Added:  ${afterMultiple.downloads_count - beforeMultiple}\n`);

    if (afterMultiple.downloads_count === beforeMultiple + 2) {
      console.log('✅ SUCCESS: Multiple downloads counted correctly!\n');
    } else {
      console.log('❌ FAILURE: Multiple downloads not counted correctly!\n');
      process.exit(1);
    }

    console.log('🎉 All tests passed! Download count functionality is working correctly.\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  } finally {
    // Close database connection
    process.exit(0);
  }
}

// Run the test
testDownloadCount();
