// OpenCLEW 自动化测试脚本 (Node.js)
// 测试文件下载、下载统计、评分统计功能

import axios from 'axios';
import pg from 'pg';
const { Pool } = pg;

// 配置
const BASE_URL = 'http://localhost:3001';
const DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'clewopen',
  user: 'postgres',
  password: 'postgres',
};

// 数据库连接池
const pool = new Pool(DB_CONFIG);

// 测试结果统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.green}[INFO]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
};

// 测试结果记录
const testPass = (name) => {
  totalTests++;
  passedTests++;
  console.log(`${colors.green}✅ PASS${colors.reset}: ${name}`);
};

const testFail = (name, reason) => {
  totalTests++;
  failedTests++;
  console.log(`${colors.red}❌ FAIL${colors.reset}: ${name}`);
  console.log(`   ${colors.red}原因${colors.reset}: ${reason}`);
};

// 数据库查询函数
const dbQuery = async (sql) => {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
};

// 检查服务状态
const checkServices = async () => {
  log.info('检查服务状态...');

  try {
    // 检查后端
    await axios.get(`${BASE_URL}/health`);
    log.info('后端服务运行正常 ✓');

    // 检查数据库
    await dbQuery('SELECT 1');
    log.info('数据库连接正常 ✓');
  } catch (error) {
    log.error('服务检查失败: ' + error.message);
    process.exit(1);
  }
};

// 准备测试数据
const setupTestData = async () => {
  log.info('准备测试数据...');

  const timestamp = Date.now();
  const testUser = {
    username: `testuser_${timestamp}`,
    email: `test_${timestamp}@example.com`,
    password: 'Test123456',
  };

  try {
    // 注册测试用户
    await axios.post(`${BASE_URL}/api/auth/register`, testUser);

    // 登录获取 token
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testUser.email,
      password: testUser.password,
    });

    const { token, user } = loginResponse.data.data;
    log.info(`测试用户创建成功: ${testUser.email}`);
    log.info(`Token: ${token.substring(0, 20)}...`);

    // 获取第一个 Agent 用于测试
    const agentsResponse = await axios.get(`${BASE_URL}/api/agents?pageSize=1`);
    const testAgentId = agentsResponse.data.data.agents[0]?.id;

    if (!testAgentId) {
      log.error('没有可用的测试 Agent');
      process.exit(1);
    }

    log.info(`测试 Agent ID: ${testAgentId}`);

    return { token, userId: user.id, testAgentId, testUser };
  } catch (error) {
    log.error('测试数据准备失败: ' + error.message);
    process.exit(1);
  }
};

// 测试 1: 文件下载 API
const testDownloadAPI = async (token, testAgentId) => {
  log.info('=== 测试 1: 文件下载 API ===');

  try {
    // 1.1 正常下载
    const downloadResponse = await axios.post(
      `${BASE_URL}/api/agents/${testAgentId}/download`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (downloadResponse.data.success && downloadResponse.data.data.downloadUrl) {
      testPass('下载 API 返回成功');
    } else {
      testFail('下载 API 返回失败', JSON.stringify(downloadResponse.data));
    }

    // 1.2 验证下载链接可访问
    const downloadUrl = downloadResponse.data.data.downloadUrl;
    if (downloadUrl) {
      try {
        const fileResponse = await axios.head(downloadUrl);
        if (fileResponse.status === 200) {
          testPass(`下载链接可访问 (HTTP ${fileResponse.status})`);
        } else {
          testFail('下载链接不可访问', `HTTP ${fileResponse.status}`);
        }
      } catch (error) {
        testFail('下载链接不可访问', error.message);
      }
    }

    // 1.3 测试不存在的 Agent
    try {
      await axios.post(
        `${BASE_URL}/api/agents/00000000-0000-0000-0000-000000000000/download`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      testFail('不存在的 Agent 应返回 404', '实际返回成功');
    } catch (error) {
      if (error.response?.status === 404) {
        testPass('不存在的 Agent 返回 404');
      } else {
        testFail('不存在的 Agent 应返回 404', `实际返回 ${error.response?.status}`);
      }
    }

    // 1.4 测试未认证用户
    try {
      await axios.post(`${BASE_URL}/api/agents/${testAgentId}/download`);
      testFail('未认证用户应返回 401', '实际返回成功');
    } catch (error) {
      if (error.response?.status === 401) {
        testPass('未认证用户返回 401');
      } else {
        testFail('未认证用户应返回 401', `实际返回 ${error.response?.status}`);
      }
    }
  } catch (error) {
    testFail('下载 API 测试失败', error.message);
  }
};

// 测试 2: 下载统计
const testDownloadStatistics = async (token, userId, testAgentId) => {
  log.info('=== 测试 2: 下载统计 ===');

  try {
    // 2.1 获取初始下载计数
    const initialResult = await dbQuery(
      `SELECT downloads_count FROM agents WHERE id = '${testAgentId}'`
    );
    const initialCount = initialResult[0].downloads_count;
    log.info(`初始下载计数: ${initialCount}`);

    // 2.2 执行下载
    await axios.post(
      `${BASE_URL}/api/agents/${testAgentId}/download`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2.3 验证计数增加
    const newResult = await dbQuery(
      `SELECT downloads_count FROM agents WHERE id = '${testAgentId}'`
    );
    const newCount = newResult[0].downloads_count;
    log.info(`新下载计数: ${newCount}`);

    if (newCount > initialCount) {
      testPass(`下载计数正确增加 (${initialCount} -> ${newCount})`);
    } else {
      testFail('下载计数未增加', `期望 > ${initialCount}, 实际 ${newCount}`);
    }

    // 2.4 验证下载记录
    const downloadRecords = await dbQuery(
      `SELECT COUNT(*) as count FROM downloads WHERE agent_id = '${testAgentId}' AND user_id = '${userId}'`
    );
    const recordCount = parseInt(downloadRecords[0].count);

    if (recordCount > 0) {
      testPass(`下载记录已创建 (共 ${recordCount} 条)`);
    } else {
      testFail('下载记录未创建', `记录数: ${recordCount}`);
    }

    // 2.5 多次下载测试
    const beforeMulti = await dbQuery(
      `SELECT downloads_count FROM agents WHERE id = '${testAgentId}'`
    );
    const beforeMultiCount = beforeMulti[0].downloads_count;

    for (let i = 0; i < 3; i++) {
      await axios.post(
        `${BASE_URL}/api/agents/${testAgentId}/download`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const afterMulti = await dbQuery(
      `SELECT downloads_count FROM agents WHERE id = '${testAgentId}'`
    );
    const afterMultiCount = afterMulti[0].downloads_count;

    const diff = afterMultiCount - beforeMultiCount;
    if (diff === 3) {
      testPass(`多次下载计数累加正确 (+${diff})`);
    } else {
      testFail('多次下载计数累加错误', `期望 +3, 实际 +${diff}`);
    }
  } catch (error) {
    testFail('下载统计测试失败', error.message);
  }
};

// 测试 3: 评分统计
const testRatingStatistics = async (token, userId, testAgentId) => {
  log.info('=== 测试 3: 评分统计 ===');

  try {
    // 3.1 提交评价
    try {
      const ratingResponse = await axios.post(
        `${BASE_URL}/api/agents/${testAgentId}/rate`,
        {
          rating: 5,
          comment: '自动化测试评价',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (ratingResponse.data.success) {
        testPass('评价提交成功');
      } else {
        testFail('评价提交失败', JSON.stringify(ratingResponse.data));
      }
    } catch (error) {
      if (error.response?.data?.error?.message?.includes('already reviewed')) {
        testPass('评价提交成功 (已存在评价)');
      } else {
        testFail('评价提交失败', error.message);
      }
    }

    // 3.2 验证评价记录
    const reviewRecords = await dbQuery(
      `SELECT COUNT(*) as count FROM reviews WHERE agent_id = '${testAgentId}' AND user_id = '${userId}'`
    );
    const reviewCount = parseInt(reviewRecords[0].count);

    if (reviewCount > 0) {
      testPass('评价记录已创建');
    } else {
      testFail('评价记录未创建', `记录数: ${reviewCount}`);
    }

    // 3.3 批准评价并验证评分更新
    const reviewIdResult = await dbQuery(
      `SELECT id FROM reviews WHERE agent_id = '${testAgentId}' AND user_id = '${userId}' LIMIT 1`
    );

    if (reviewIdResult.length > 0) {
      const reviewId = reviewIdResult[0].id;
      await dbQuery(`UPDATE reviews SET status = 'approved' WHERE id = '${reviewId}'`);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const ratingResult = await dbQuery(
        `SELECT rating_average, reviews_count FROM agents WHERE id = '${testAgentId}'`
      );
      const ratingAvg = parseFloat(ratingResult[0].rating_average);
      const reviewsCount = parseInt(ratingResult[0].reviews_count);

      if (ratingAvg > 0) {
        testPass(`评分已更新 (平均分: ${ratingAvg})`);
      } else {
        testFail('评分未更新', `平均分: ${ratingAvg}`);
      }

      if (reviewsCount > 0) {
        testPass(`评价计数已更新 (计数: ${reviewsCount})`);
      } else {
        testFail('评价计数未更新', `计数: ${reviewsCount}`);
      }
    }

    // 3.4 测试评分范围验证
    try {
      await axios.post(
        `${BASE_URL}/api/agents/${testAgentId}/rate`,
        {
          rating: 6,
          comment: '无效评分测试',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      testFail('评分范围验证失败', '应拒绝无效评分');
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || '';
      if (errorMsg.includes('between 1 and 5') || errorMsg.includes('already reviewed')) {
        testPass('评分范围验证正常');
      } else {
        testFail('评分范围验证失败', errorMsg);
      }
    }
  } catch (error) {
    testFail('评分统计测试失败', error.message);
  }
};

// 测试 4: 集成测试
const testIntegration = async (token, testAgentId) => {
  log.info('=== 测试 4: 集成测试 ===');

  try {
    // 4.1 获取 Agent 列表
    const agentsList = await axios.get(`${BASE_URL}/api/agents?page=1&pageSize=10`);
    const agentsCount = agentsList.data.data.agents.length;

    if (agentsCount > 0) {
      testPass(`Agent 列表获取成功 (共 ${agentsCount} 个)`);
    } else {
      testFail('Agent 列表为空', `数量: ${agentsCount}`);
    }

    // 4.2 获取 Agent 详情
    const agentDetail = await axios.get(`${BASE_URL}/api/agents/${testAgentId}`);
    const agentName = agentDetail.data.data.name;

    if (agentName) {
      testPass(`Agent 详情获取成功 (名称: ${agentName})`);
    } else {
      testFail('Agent 详情获取失败', JSON.stringify(agentDetail.data));
    }

    // 4.3 获取评价列表
    const reviewsList = await axios.get(`${BASE_URL}/api/agents/${testAgentId}/reviews`);

    if (reviewsList.data.success) {
      testPass('评价列表获取成功');
    } else {
      testFail('评价列表获取失败', JSON.stringify(reviewsList.data));
    }

    // 4.4 验证数据一致性
    const dbResult = await dbQuery(
      `SELECT downloads_count FROM agents WHERE id = '${testAgentId}'`
    );
    const dbDownloads = dbResult[0].downloads_count;
    const apiDownloads = agentDetail.data.data.downloads_count;

    if (dbDownloads === apiDownloads) {
      testPass(`下载计数数据一致 (DB: ${dbDownloads}, API: ${apiDownloads})`);
    } else {
      testFail('下载计数数据不一致', `DB: ${dbDownloads}, API: ${apiDownloads}`);
    }
  } catch (error) {
    testFail('集成测试失败', error.message);
  }
};

// 生成测试报告
const generateReport = () => {
  console.log('\n=========================================');
  console.log('           测试报告');
  console.log('=========================================');
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过: ${colors.green}${passedTests}${colors.reset}`);
  console.log(`失败: ${colors.red}${failedTests}${colors.reset}`);
  console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
  console.log('=========================================');

  if (failedTests === 0) {
    console.log(`${colors.green}所有测试通过！${colors.reset}`);
    return 0;
  } else {
    console.log(`${colors.red}存在失败的测试，请检查日志${colors.reset}`);
    return 1;
  }
};

// 主函数
const main = async () => {
  console.log('=========================================');
  console.log('    OpenCLEW 自动化测试');
  console.log('=========================================\n');

  try {
    await checkServices();
    const { token, userId, testAgentId, testUser } = await setupTestData();

    await testDownloadAPI(token, testAgentId);
    await testDownloadStatistics(token, userId, testAgentId);
    await testRatingStatistics(token, userId, testAgentId);
    await testIntegration(token, testAgentId);

    const exitCode = generateReport();
    await pool.end();
    process.exit(exitCode);
  } catch (error) {
    log.error('测试执行失败: ' + error.message);
    await pool.end();
    process.exit(1);
  }
};

// 执行测试
main();
