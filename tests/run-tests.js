import axios from 'axios'
import pg from 'pg'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs/promises'

const { Pool } = pg

const BASE_URL = String(process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')
const FRONTEND_URL = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '')
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'clewopen',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@clewopen.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123'
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10)
const TRIAL_TIMEOUT_MS = Number.parseInt(process.env.TRIAL_TIMEOUT_MS || '240000', 10)

const pool = new Pool(DB_CONFIG)

let totalTests = 0
let passedTests = 0
let failedTests = 0
const failures = []

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

const log = {
  section(message) {
    console.log(`\n${colors.blue}=== ${message} ===${colors.reset}`)
  },
  info(message) {
    console.log(`${colors.green}[INFO]${colors.reset} ${message}`)
  },
  warn(message) {
    console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`)
  },
  error(message) {
    console.log(`${colors.red}[ERROR]${colors.reset} ${message}`)
  },
}

function testPass(name, details = '') {
  totalTests += 1
  passedTests += 1
  console.log(`${colors.green}PASS${colors.reset} ${name}${details ? ` -> ${details}` : ''}`)
}

function testFail(name, reason) {
  totalTests += 1
  failedTests += 1
  failures.push({ name, reason })
  console.log(`${colors.red}FAIL${colors.reset} ${name}`)
  console.log(`  ${reason}`)
}

async function dbQuery(sql, params = []) {
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

async function request(method, url, options = {}) {
  return axios({
    method,
    url,
    timeout: options.timeout || REQUEST_TIMEOUT_MS,
    headers: options.headers,
    data: options.data,
    responseType: options.responseType,
    validateStatus: options.validateStatus || (() => true),
  })
}

function parseEventStreamChunks(buffer, onEvent) {
  const chunks = buffer.split(/\r?\n\r?\n/)
  const rest = chunks.pop() || ''

  for (const chunk of chunks) {
    if (!chunk.trim() || chunk.startsWith(':')) continue

    let event = 'message'
    const dataLines = []

    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) continue

    let payload = dataLines.join('\n')
    try {
      payload = JSON.parse(payload)
    } catch {
      // Keep string payload when JSON parse fails.
    }

    onEvent({ event, data: payload })
  }

  return rest
}

async function streamRequest(url, options = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeout || REQUEST_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: options.headers,
      body: options.data ? JSON.stringify(options.data) : undefined,
      signal: controller.signal,
    })

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    const events = []
    let buffer = ''
    let firstEventAtMs = null

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        buffer = parseEventStreamChunks(buffer, (event) => {
          if (firstEventAtMs === null) {
            firstEventAtMs = Date.now() - startedAt
          }
          events.push(event)
        })

        if (done) break
      }
    }

    if (buffer.trim()) {
      parseEventStreamChunks(buffer, (event) => {
        if (firstEventAtMs === null) {
          firstEventAtMs = Date.now() - startedAt
        }
        events.push(event)
      })
    }

    return {
      status: response.status,
      ok: response.ok,
      events,
      firstEventAtMs,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function timed(label, fn) {
  const startedAt = Date.now()
  const value = await fn()
  const durationMs = Date.now() - startedAt
  log.info(`${label}: ${durationMs}ms`)
  return { value, durationMs }
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseJson(response) {
  if (!response?.data || typeof response.data !== 'object') {
    throw new Error('Response is not valid JSON')
  }
  return response.data
}

async function checkServices() {
  log.section('基础服务检查')

  try {
    const health = await request('get', `${BASE_URL}/health`)
    ensure(health.status === 200, `Health check returned ${health.status}`)
    testPass('后端 health', `${BASE_URL}/health -> 200`)
  } catch (error) {
    testFail('后端 health', error.message)
  }

  try {
    await dbQuery('SELECT 1')
    testPass('数据库连接', `${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`)
  } catch (error) {
    testFail('数据库连接', error.message)
  }

  if (FRONTEND_URL) {
    try {
      const proxy = await request('get', `${FRONTEND_URL}/api/agents?pageSize=1`)
      ensure(proxy.status === 200, `Frontend proxy returned ${proxy.status}`)
      ensure(parseJson(proxy).success === true, 'Frontend proxy payload missing success=true')
      testPass('前端 /api 代理', `${FRONTEND_URL}/api/agents?pageSize=1 -> 200`)
    } catch (error) {
      testFail('前端 /api 代理', error.message)
    }
  } else {
    log.warn('未设置 FRONTEND_URL，跳过前端代理检查')
  }
}

async function runUnitLikeChecks() {
  log.section('单元级纯函数检查')

  const testsDir = path.dirname(fileURLToPath(import.meta.url))
  const moduleUrl = pathToFileURL(path.join(testsDir, '../backend/runtime/trial/llmSandboxConfig.js')).href
  const streamEventsModuleUrl = pathToFileURL(
    path.join(testsDir, '../backend/runtime/trial/streamEvents.js')
  ).href
  const { buildTrialSandboxLlmEnv, buildTrialSandboxLlmMetadata } = await import(moduleUrl)
  const {
    classifyOpenClawOutputLine,
    flushOpenClawGatewaySseBuffer,
    mapOpenClawGatewayEvent,
  } = await import(streamEventsModuleUrl)

  try {
    const env = buildTrialSandboxLlmEnv({
      provider_name: 'openai',
      api_url: 'https://api.example.com/v1/chat/completions',
      api_key: 'Bearer sk-demo',
      model_id: 'gpt-4o',
      max_tokens: 2048,
      temperature: 0.2,
      auth_type: 'bearer',
    })
    ensure(env.TRIAL_LLM_API_URL === 'https://api.example.com/v1', 'OpenAI URL suffix was not stripped')
    ensure(env.TRIAL_LLM_API_KEY === 'sk-demo', 'Bearer token was not sanitized')
    ensure(env.TRIAL_LLM_MODEL_ID === 'gpt-4o', 'Model id mismatch')
    testPass('OpenAI trial config mapping')
  } catch (error) {
    testFail('OpenAI trial config mapping', error.message)
  }

  try {
    const env = buildTrialSandboxLlmEnv({
      provider_name: 'anthropic',
      api_url: 'https://api.anthropic.com/v1/messages',
      api_key: 'test-key',
      model_id: 'claude-sonnet',
      max_tokens: 1024,
      temperature: 0.5,
      auth_type: 'x-api-key',
    })
    ensure(env.TRIAL_LLM_API_URL === 'https://api.anthropic.com/v1', 'Anthropic URL suffix was not stripped')
    ensure(env.TRIAL_LLM_AUTH_TYPE === 'x-api-key', 'Anthropic auth type mismatch')
    testPass('Anthropic trial config mapping')
  } catch (error) {
    testFail('Anthropic trial config mapping', error.message)
  }

  try {
    process.env.TRIAL_LLM_MODEL_OVERRIDE = 'gpt-4.1-mini'
    process.env.TRIAL_LLM_MAX_TOKENS_OVERRIDE = '1200'
    process.env.TRIAL_LLM_TEMPERATURE_OVERRIDE = '0.1'

    const env = buildTrialSandboxLlmEnv({
      provider_name: 'openai',
      api_url: 'https://api.example.com/v1/chat/completions',
      api_key: 'Bearer sk-demo',
      model_id: 'gpt-4o',
      max_tokens: 2048,
      temperature: 0.7,
      auth_type: 'bearer',
    })

    ensure(env.TRIAL_LLM_MODEL_ID === 'gpt-4.1-mini', 'Trial model override did not apply')
    ensure(env.TRIAL_LLM_MAX_TOKENS === '1200', 'Trial max tokens override did not apply')
    ensure(env.TRIAL_LLM_TEMPERATURE === '0.1', 'Trial temperature override did not apply')
    testPass('Trial sandbox env overrides')
  } catch (error) {
    testFail('Trial sandbox env overrides', error.message)
  } finally {
    delete process.env.TRIAL_LLM_MODEL_OVERRIDE
    delete process.env.TRIAL_LLM_MAX_TOKENS_OVERRIDE
    delete process.env.TRIAL_LLM_TEMPERATURE_OVERRIDE
  }

  try {
    const metadata = buildTrialSandboxLlmMetadata({
      id: 'cfg-1',
      provider_name: 'openai',
      api_url: 'https://api.example.com/v1/chat/completions',
      api_key: 'sk-demo',
      model_id: 'gpt-4o-mini',
      auth_type: 'bearer',
    })
    ensure(metadata.api_url === 'https://api.example.com/v1', 'Metadata URL stripping failed')
    ensure(metadata.model_id === 'gpt-4o-mini', 'Metadata model mismatch')
    testPass('Trial config metadata mapping')
  } catch (error) {
    testFail('Trial config metadata mapping', error.message)
  }

  try {
    const mapped = classifyOpenClawOutputLine(
      '[agent/embedded] embedded run agent start: runId=demo'
    )
    ensure(mapped?.type === 'status', 'OpenClaw status line should map to status event')
    ensure(mapped?.stage === 'model-call', 'OpenClaw status stage mismatch')

    const ignored = classifyOpenClawOutputLine(
      '[diagnostic] lane enqueue: lane=session:test queueSize=1'
    )
    ensure(ignored === null, 'Diagnostic queue line should be ignored')
    testPass('OpenClaw 流式事件映射')
  } catch (error) {
    testFail('OpenClaw 流式事件映射', error.message)
  }

  try {
    const mappedDelta = mapOpenClawGatewayEvent({
      type: 'response.output_text.delta',
      delta: '你好',
    })
    ensure(mappedDelta?.type === 'delta', 'Gateway delta event should map to delta')
    ensure(mappedDelta?.delta === '你好', 'Gateway delta payload mismatch')

    const receivedEvents = []
    flushOpenClawGatewaySseBuffer(
      { buffer: '', seenEvent: false },
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"世界"}\n\n',
      (event) => receivedEvents.push(event)
    )
    ensure(receivedEvents.length === 1, 'Gateway SSE buffer should emit one event')
    ensure(receivedEvents[0]?.type === 'delta', 'Gateway SSE emitted unexpected event type')
    ensure(receivedEvents[0]?.delta === '世界', 'Gateway SSE delta mismatch')
    testPass('OpenClaw Gateway SSE 映射')
  } catch (error) {
    testFail('OpenClaw Gateway SSE 映射', error.message)
  }
}

async function registerTestUser() {
  const timestamp = Date.now()
  const credentials = {
    username: `qa_${timestamp}`,
    email: `qa_${timestamp}@clewopen.local`,
    password: 'Test123456',
  }

  const response = await request('post', `${BASE_URL}/api/auth/register`, {
    data: credentials,
  })
  ensure(response.status === 201, `Registration returned ${response.status}`)
  const payload = parseJson(response)
  ensure(payload.success === true, 'Registration success flag missing')

  return {
    credentials,
    token: payload.data.token,
    user: payload.data.user,
  }
}

async function loginAdmin() {
  const response = await request('post', `${BASE_URL}/api/auth/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  })

  ensure(response.status === 200, `Admin login returned ${response.status}`)
  const payload = parseJson(response)
  ensure(payload.success === true, 'Admin login success flag missing')
  return payload.data
}

async function fetchCatalog() {
  const [agentsRes, skillsRes, mcpsRes] = await Promise.all([
    request('get', `${BASE_URL}/api/agents?pageSize=20`),
    request('get', `${BASE_URL}/api/skills?pageSize=20`),
    request('get', `${BASE_URL}/api/mcps?pageSize=20`),
  ])

  const agents = parseJson(agentsRes).data.agents
  const skills = parseJson(skillsRes).data.items
  const mcps = parseJson(mcpsRes).data.items

  ensure(Array.isArray(agents) && agents.length > 0, 'No approved agents found')
  ensure(Array.isArray(skills) && skills.length > 0, 'No approved skills found')
  ensure(Array.isArray(mcps) && mcps.length > 0, 'No approved mcps found')

  return {
    agents,
    skills,
    mcps,
    trialAgent:
      agents.find((agent) => String(agent.package_url || '').includes('example-session-agent')) ||
      agents[0],
  }
}

async function testCatalogEndpoints(catalog) {
  log.section('目录和详情接口')

  for (const [name, items] of [
    ['Agent 列表', catalog.agents],
    ['Skill 列表', catalog.skills],
    ['MCP 列表', catalog.mcps],
  ]) {
    if (items.length > 0) {
      testPass(name, `数量=${items.length}`)
    } else {
      testFail(name, '列表为空')
    }
  }

  const checks = [
    ['Agent 详情', `${BASE_URL}/api/agents/${catalog.agents[0].id}`],
    ['Skill 详情', `${BASE_URL}/api/skills/${catalog.skills[0].id}`],
    ['MCP 详情', `${BASE_URL}/api/mcps/${catalog.mcps[0].id}`],
  ]

  for (const [label, url] of checks) {
    try {
      const response = await request('get', url)
      ensure(response.status === 200, `${label} returned ${response.status}`)
      const payload = parseJson(response)
      ensure(payload.success === true, `${label} success flag missing`)
      testPass(label)
    } catch (error) {
      testFail(label, error.message)
    }
  }
}

async function testAdminRoutes(adminToken) {
  log.section('管理员接口')
  const headers = { Authorization: `Bearer ${adminToken}` }

  const routeChecks = [
    ['LLM 配置列表', `${BASE_URL}/api/admin/llm-configs`],
    ['同步状态', `${BASE_URL}/api/admin/sync-status`],
    ['同步历史', `${BASE_URL}/api/admin/sync-history`],
  ]

  for (const [label, url] of routeChecks) {
    try {
      const response = await request('get', url, { headers })
      ensure(response.status === 200, `${label} returned ${response.status}`)
      ensure(parseJson(response).success === true, `${label} success flag missing`)
      testPass(label)
    } catch (error) {
      testFail(label, error.message)
    }
  }

  try {
    const configsResponse = await request('get', `${BASE_URL}/api/admin/llm-configs`, { headers })
    const configs = parseJson(configsResponse).data
    ensure(Array.isArray(configs) && configs.length > 0, 'No LLM configs returned')
    const active = configs.find((item) => item.is_active) || configs[0]
    const healthResponse = await request('post', `${BASE_URL}/api/admin/llm-configs/${active.id}/health-check`, {
      headers,
      data: { message: 'Reply with exactly: HEALTHCHECK_OK' },
      timeout: TRIAL_TIMEOUT_MS,
    })
    ensure(healthResponse.status === 200, `Health check returned ${healthResponse.status}`)
    const payload = parseJson(healthResponse)
    ensure(String(payload.data.response || '').includes('HEALTHCHECK_OK'), 'Health check reply mismatch')
    testPass('LLM 配置健康检查')
  } catch (error) {
    testFail('LLM 配置健康检查', error.message)
  }
}

function getResourceTable(resourceType) {
  if (resourceType === 'agent') return 'agents'
  if (resourceType === 'skill') return 'skills'
  return 'mcps'
}

function getResourceApiPath(resourceType) {
  if (resourceType === 'agent') return 'agents'
  if (resourceType === 'skill') return 'skills'
  return 'mcps'
}

function isExternalResource(item) {
  return String(item?.source_type || '') === 'external'
}

async function testExternalResourceFlow(resourceType, item, token) {
  const table = getResourceTable(resourceType)
  const apiPath = getResourceApiPath(resourceType)
  const headers = { Authorization: `Bearer ${token}` }

  const beforeDownloads = await dbQuery(`SELECT downloads_count FROM ${table} WHERE id = $1`, [item.id])
  const beforeDownloadCount = Number(beforeDownloads.rows[0]?.downloads_count || 0)
  const beforeVisits = await dbQuery(
    `SELECT COUNT(*)::int AS count FROM resource_visits WHERE resource_id = $1 AND resource_type = $2`,
    [item.id, resourceType]
  )
  const beforeVisitCount = Number(beforeVisits.rows[0]?.count || 0)

  const downloadResponse = await request('post', `${BASE_URL}/api/${apiPath}/${item.id}/download`, {
    headers,
  })

  ensure(downloadResponse.status === 409, `External download returned ${downloadResponse.status}`)
  const downloadPayload = parseJson(downloadResponse)
  ensure(downloadPayload.success === false, 'External download should return success=false')
  ensure(downloadPayload.error?.code === 'EXTERNAL_RESOURCE', 'External download error code mismatch')
  ensure(downloadPayload.error?.external_url === item.external_url, 'External download external_url mismatch')
  ensure(downloadPayload.error?.source_platform === item.source_platform, 'External download source_platform mismatch')

  const afterDownloads = await dbQuery(`SELECT downloads_count FROM ${table} WHERE id = $1`, [item.id])
  const afterDownloadCount = Number(afterDownloads.rows[0]?.downloads_count || 0)
  ensure(afterDownloadCount === beforeDownloadCount, 'downloads_count should not change for external resource')

  const visitResponse = await request('post', `${BASE_URL}/api/${apiPath}/${item.id}/visit`)
  ensure(visitResponse.status === 200, `External visit returned ${visitResponse.status}`)
  const visitPayload = parseJson(visitResponse)
  ensure(visitPayload.success === true, 'External visit should return success=true')
  ensure(visitPayload.data?.external_url === item.external_url, 'External visit external_url mismatch')
  ensure(visitPayload.data?.source_platform === item.source_platform, 'External visit source_platform mismatch')

  await sleep(300)

  const afterVisits = await dbQuery(
    `SELECT COUNT(*)::int AS count FROM resource_visits WHERE resource_id = $1 AND resource_type = $2`,
    [item.id, resourceType]
  )
  const afterVisitCount = Number(afterVisits.rows[0]?.count || 0)
  ensure(afterVisitCount === beforeVisitCount + 1, `resource_visits expected ${beforeVisitCount + 1}, got ${afterVisitCount}`)

  testPass(
    `${resourceType} 外部资源访问`,
    `download=409 visit ${beforeVisitCount} -> ${afterVisitCount} platform=${item.source_platform}`
  )
}

async function testDownloadFlow(resourceType, item, token, userId) {
  log.section(`${resourceType} 下载和数据一致性`)
  const table = getResourceTable(resourceType)
  const apiPath = getResourceApiPath(resourceType)
  const headers = { Authorization: `Bearer ${token}` }

  try {
    if (isExternalResource(item)) {
      await testExternalResourceFlow(resourceType, item, token)
      return
    }

    const before = await dbQuery(`SELECT downloads_count FROM ${table} WHERE id = $1`, [item.id])
    const beforeCount = Number(before.rows[0]?.downloads_count || 0)

    const response = await request('post', `${BASE_URL}/api/${apiPath}/${item.id}/download`, {
      headers,
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
    })

    ensure(response.status === 200, `Download returned ${response.status}`)
    ensure(Number(response.data?.byteLength || response.data?.length || 0) > 0, 'Downloaded body is empty')
    ensure(
      String(response.headers['content-disposition'] || '').toLowerCase().includes('attachment'),
      'Content-Disposition is not attachment'
    )

    await sleep(300)

    const after = await dbQuery(
      `SELECT downloads_count FROM ${table} WHERE id = $1`,
      [item.id]
    )
    const afterCount = Number(after.rows[0]?.downloads_count || 0)
    ensure(afterCount === beforeCount + 1, `downloads_count expected ${beforeCount + 1}, got ${afterCount}`)

    const records = await dbQuery(
      `SELECT COUNT(*)::int AS count
       FROM downloads
       WHERE resource_id = $1 AND user_id = $2 AND resource_type = $3`,
      [item.id, userId, resourceType]
    )
    ensure(Number(records.rows[0]?.count || 0) > 0, 'Download record not created')

    testPass(`${resourceType} 下载`, `count ${beforeCount} -> ${afterCount}`)
  } catch (error) {
    testFail(`${resourceType} 下载`, error.message)
  }
}

async function testRatingFlow(resourceType, item, token, userId) {
  log.section(`${resourceType} 评分和聚合逻辑`)
  const table = getResourceTable(resourceType)
  const apiPath = getResourceApiPath(resourceType)
  const headers = { Authorization: `Bearer ${token}` }
  const comment = `自动化测试评价 ${resourceType} ${Date.now()}`

  try {
    const baseline = await dbQuery(
      `SELECT rating_average, reviews_count FROM ${table} WHERE id = $1`,
      [item.id]
    )
    const baselineAverage = Number(baseline.rows[0]?.rating_average || 0)
    const baselineCount = Number(baseline.rows[0]?.reviews_count || 0)

    const response = await request('post', `${BASE_URL}/api/${apiPath}/${item.id}/rate`, {
      headers,
      data: {
        rating: 5,
        comment,
      },
    })
    ensure(response.status === 200, `Rate returned ${response.status}`)
    const payload = parseJson(response)
    const reviewId = payload.data?.review?.id
    ensure(reviewId, 'Review id missing from response')

    const pendingReview = await dbQuery(
      `SELECT status FROM reviews WHERE id = $1 AND resource_type = $2`,
      [reviewId, resourceType]
    )
    ensure(pendingReview.rows[0]?.status === 'pending', 'Review is not pending after creation')

    await dbQuery(`UPDATE reviews SET status = 'approved' WHERE id = $1`, [reviewId])
    await sleep(300)

    const approved = await dbQuery(
      `SELECT rating_average, reviews_count FROM ${table} WHERE id = $1`,
      [item.id]
    )
    const approvedCount = Number(approved.rows[0]?.reviews_count || 0)
    const approvedAverage = Number(approved.rows[0]?.rating_average || 0)
    ensure(approvedCount === baselineCount + 1, `Approved review count expected ${baselineCount + 1}, got ${approvedCount}`)
    ensure(approvedAverage >= baselineAverage, 'Approved average rating did not update as expected')

    await dbQuery(`UPDATE reviews SET status = 'rejected' WHERE id = $1`, [reviewId])
    await sleep(300)

    const reverted = await dbQuery(
      `SELECT rating_average, reviews_count FROM ${table} WHERE id = $1`,
      [item.id]
    )
    const revertedCount = Number(reverted.rows[0]?.reviews_count || 0)
    ensure(revertedCount === baselineCount, `Reverted review count expected ${baselineCount}, got ${revertedCount}`)

    testPass(`${resourceType} 评分聚合`, `baseline=${baselineCount}, approved=${approvedCount}, reverted=${revertedCount}`)
  } catch (error) {
    testFail(`${resourceType} 评分聚合`, error.message)
  }
}

async function waitForTrialSessionReady(sessionId, token) {
  const headers = { Authorization: `Bearer ${token}` }
  const startedAt = Date.now()
  let lastStatus = 'unknown'

  while (Date.now() - startedAt < TRIAL_TIMEOUT_MS) {
    const response = await request('get', `${BASE_URL}/api/trial-sessions/${sessionId}`, {
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    })
    ensure(response.status === 200, `Poll session returned ${response.status}`)
    const payload = parseJson(response)
    lastStatus = payload.data?.session?.status || 'unknown'

    if (lastStatus === 'active') {
      return {
        payload,
        waitDurationMs: Date.now() - startedAt,
      }
    }

    if (['failed', 'completed', 'expired'].includes(lastStatus)) {
      throw new Error(`Trial session became ${lastStatus} before ready`)
    }

    await sleep(2000)
  }

  throw new Error(`Trial session did not become active within timeout, lastStatus=${lastStatus}`)
}

async function testTrialFlow(token, trialAgent, frontendToken) {
  log.section('Agent 试用会话')
  const headers = { Authorization: `Bearer ${token}` }
  const proxyHeaders = { Authorization: `Bearer ${frontendToken || token}` }

  try {
    const { value: createResponse, durationMs: createDurationMs } = await timed(
      'trial create latency',
      () => request('post', `${BASE_URL}/api/agents/${trialAgent.id}/trial-sessions`, {
        headers,
        timeout: TRIAL_TIMEOUT_MS,
      })
    )
    ensure(createResponse.status === 201, `Create session returned ${createResponse.status}`)
    const createPayload = parseJson(createResponse)
    const sessionId = createPayload.data.sessionId
    ensure(createPayload.data.runtimeType === 'container', 'Trial session is not using container runtime')
    const { waitDurationMs } = await waitForTrialSessionReady(sessionId, token)

    const messageBaseUrl = FRONTEND_URL || BASE_URL
    const { value: sendResponse, durationMs: sendDurationMs } = await timed(
      'trial send latency',
      () => streamRequest(`${messageBaseUrl}/api/trial-sessions/${sessionId}/messages/stream`, {
        method: 'POST',
        headers: {
          ...proxyHeaders,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        data: {
          message: '请用中文介绍一下你的能力，并给我一个简短示例。',
        },
        timeout: TRIAL_TIMEOUT_MS,
      })
    )
    ensure(sendResponse.status === 200, `Send message returned ${sendResponse.status}`)
    ensure(sendResponse.events.length > 0, 'Stream endpoint returned no events')
    ensure(
      sendResponse.events.some((event) => event.event === 'status'),
      'Stream endpoint did not emit status events'
    )
    ensure(
      sendResponse.events.some(
        (event) =>
          event.event === 'status' &&
          ['gateway-connected', 'prompt-build', 'context-ready', 'model-call', 'model-returned', 'response-build', 'completed'].includes(
            event.data?.stage
          )
      ),
      'Stream endpoint did not surface OpenClaw runtime stages'
    )
    const deltaEvents = sendResponse.events.filter(
      (event) => event.event === 'delta' && String(event.data?.delta || '').length > 0
    )
    ensure(deltaEvents.length > 0, 'Stream endpoint did not emit assistant delta events')
    const doneEvent = sendResponse.events.find((event) => event.event === 'done')
    ensure(doneEvent, 'Stream endpoint did not emit done event')
    ensure(String(doneEvent.data?.response || '').trim().length > 0, 'Trial response is empty')
    ensure(
      sendResponse.events.findIndex((event) => event.event === 'delta') !== -1 &&
        sendResponse.events.findIndex((event) => event.event === 'done') !== -1 &&
        sendResponse.events.findIndex((event) => event.event === 'delta') <
          sendResponse.events.findIndex((event) => event.event === 'done'),
      'Assistant delta events were not observed before completion'
    )
    ensure(
      Number.isFinite(sendResponse.firstEventAtMs) && sendResponse.firstEventAtMs < sendDurationMs,
      `First stream event was not observed before completion: first=${sendResponse.firstEventAtMs} total=${sendDurationMs}`
    )

    const getResponse = await request('get', `${BASE_URL}/api/trial-sessions/${sessionId}`, {
      headers,
      timeout: TRIAL_TIMEOUT_MS,
    })
    ensure(getResponse.status === 200, `Get session returned ${getResponse.status}`)
    const getPayload = parseJson(getResponse)
    ensure(Array.isArray(getPayload.data.messages) && getPayload.data.messages.length >= 2, 'Trial session messages are incomplete')

    const dbMessages = await dbQuery(
      `SELECT COUNT(*)::int AS count FROM trial_session_messages WHERE session_id = $1`,
      [sessionId]
    )
    ensure(Number(dbMessages.rows[0]?.count || 0) >= 2, 'trial_session_messages row count is too small')

    const endResponse = await request('delete', `${messageBaseUrl}/api/trial-sessions/${sessionId}`, {
      headers: proxyHeaders,
      timeout: TRIAL_TIMEOUT_MS,
    })
    ensure(endResponse.status === 200, `End session returned ${endResponse.status}`)
    const ended = parseJson(endResponse)
    ensure(ended.data.status === 'completed', 'Ended session did not become completed')

    testPass(
      'Agent 试用会话完整链路',
      `create=${createDurationMs}ms ready=${waitDurationMs}ms firstEvent=${sendResponse.firstEventAtMs}ms send=${sendDurationMs}ms runtime=${createPayload.data.runtimeType}`
    )
  } catch (error) {
    testFail('Agent 试用会话完整链路', error.message)
  }
}

async function buildMissingMigrationDiagnostics(missingMigrations) {
  const diagnostics = []

  if (missingMigrations.includes('006_add_github_fields.sql')) {
    const [skillColumns, mcpColumns] = await Promise.all([
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_name = 'skills'
           AND column_name IN ('github_stars', 'github_url', 'author_avatar_url')`
      ),
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_name = 'mcps'
           AND column_name IN ('github_stars', 'github_url', 'author_avatar_url')`
      ),
    ])
    diagnostics.push(
      `006 github columns skills=${skillColumns.rows[0]?.count || 0}/3 mcps=${mcpColumns.rows[0]?.count || 0}/3`
    )
  }

  if (missingMigrations.includes('007_remove_pricing_and_orders.sql')) {
    const [ordersTable, agentPricingColumns, skillPricingColumns, mcpPricingColumns] = await Promise.all([
      dbQuery(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AS exists`),
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_name = 'agents'
           AND column_name IN ('price_type', 'price_amount', 'price_currency', 'billing_period')`
      ),
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_name = 'skills'
           AND column_name IN ('price_type', 'price_amount', 'price_currency', 'billing_period')`
      ),
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_name = 'mcps'
           AND column_name IN ('price_type', 'price_amount', 'price_currency', 'billing_period')`
      ),
    ])
    diagnostics.push(
      `007 orders_exists=${ordersTable.rows[0]?.exists ? 'true' : 'false'} pricing_columns=${agentPricingColumns.rows[0]?.count || 0}/${skillPricingColumns.rows[0]?.count || 0}/${mcpPricingColumns.rows[0]?.count || 0}`
    )
  }

  if (missingMigrations.includes('008_create_trial_and_llm_config.sql')) {
    const trialTables = await dbQuery(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name IN ('agent_trials', 'llm_configs')
       ORDER BY table_name`
    )
    diagnostics.push(`008 tables=${trialTables.rows.map((row) => row.table_name).join(',')}`)
  }

  if (missingMigrations.includes('010_create_trial_sessions.sql')) {
    const [sessionTables, sessionTrigger] = await Promise.all([
      dbQuery(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_name IN ('trial_sessions', 'trial_session_messages')
         ORDER BY table_name`
      ),
      dbQuery(
        `SELECT COUNT(*)::int AS count
         FROM pg_trigger
         WHERE NOT tgisinternal
           AND tgname = 'update_trial_sessions_updated_at'`
      ),
    ])
    diagnostics.push(
      `010 tables=${sessionTables.rows.map((row) => row.table_name).join(',')} trigger=${sessionTrigger.rows[0]?.count || 0}`
    )
  }

  return diagnostics.join('; ')
}

async function testMigrationsAndCounts() {
  log.section('迁移和数据面检查')

  try {
    const testsDir = path.dirname(fileURLToPath(import.meta.url))
    const migrationsDir = path.join(testsDir, '../backend/migrations')
    const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    const executed = await dbQuery('SELECT name FROM migrations ORDER BY name')
    const executedNames = new Set(executed.rows.map((row) => row.name))
    const missingMigrations = files.filter((file) => !executedNames.has(file))
    const extraMigrations = executed.rows.map((row) => row.name).filter((name) => !files.includes(name))

    if (missingMigrations.length > 0 || extraMigrations.length > 0) {
      const diagnostics = await buildMissingMigrationDiagnostics(missingMigrations)
      const parts = []
      if (missingMigrations.length > 0) parts.push(`missing=[${missingMigrations.join(', ')}]`)
      if (extraMigrations.length > 0) parts.push(`extra=[${extraMigrations.join(', ')}]`)
      if (diagnostics) parts.push(`schema=${diagnostics}`)
      throw new Error(parts.join('; '))
    }

    testPass('迁移执行数量一致', `${executed.rows.length} / ${files.length}`)
  } catch (error) {
    testFail('迁移执行数量一致', error.message)
  }

  try {
    const [syncCounts, dbCounts] = await Promise.all([
      request('get', `${BASE_URL}/api/admin/sync-status`, {
        headers: {
          Authorization: `Bearer ${(
            await loginAdmin()
          ).token}`,
        },
      }),
      Promise.all([
        dbQuery(`SELECT COUNT(*)::int AS count FROM skills WHERE deleted_at IS NULL`),
        dbQuery(`SELECT COUNT(*)::int AS count FROM mcps WHERE deleted_at IS NULL`),
      ]),
    ])
    const syncPayload = parseJson(syncCounts)
    const skillCount = Number(dbCounts[0].rows[0]?.count || 0)
    const mcpCount = Number(dbCounts[1].rows[0]?.count || 0)
    ensure(syncPayload.data.totalSkills === skillCount, 'sync-status totalSkills mismatch')
    ensure(syncPayload.data.totalMcps === mcpCount, 'sync-status totalMcps mismatch')
    testPass('sync-status 与数据库计数一致')
  } catch (error) {
    testFail('sync-status 与数据库计数一致', error.message)
  }
}

async function performanceProbe(label, url, iterations = 5) {
  const durations = []

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = Date.now()
    const response = await request('get', url)
    ensure(response.status === 200, `${label} iteration ${index + 1} returned ${response.status}`)
    durations.push(Date.now() - startedAt)
  }

  durations.sort((a, b) => a - b)
  const avg = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
  const median = durations[Math.floor(durations.length / 2)]
  const max = durations[durations.length - 1]

  return { avg, median, max }
}

async function runPerformanceChecks() {
  log.section('轻量性能探针')

  const probes = [
    ['health', `${BASE_URL}/health`, 5, 200],
    ['agents', `${BASE_URL}/api/agents?pageSize=1`, 5, 500],
    ['skills', `${BASE_URL}/api/skills?pageSize=1`, 5, 500],
    ['mcps', `${BASE_URL}/api/mcps?pageSize=1`, 5, 500],
  ]

  if (FRONTEND_URL) {
    probes.push(['frontend-proxy-agents', `${FRONTEND_URL}/api/agents?pageSize=1`, 5, 800])
  }

  for (const [label, url, iterations, threshold] of probes) {
    try {
      const stats = await performanceProbe(label, url, iterations)
      ensure(stats.avg <= threshold, `${label} avg ${stats.avg}ms exceeds ${threshold}ms`)
      testPass(`性能 ${label}`, `avg=${stats.avg}ms median=${stats.median}ms max=${stats.max}ms`)
    } catch (error) {
      testFail(`性能 ${label}`, error.message)
    }
  }
}

function summarize() {
  console.log('\n=========================================')
  console.log('        OpenCLEW 项目验证报告')
  console.log('=========================================')
  console.log(`BASE_URL: ${BASE_URL}`)
  console.log(`FRONTEND_URL: ${FRONTEND_URL || '(skipped)'}`)
  console.log(`总测试数: ${totalTests}`)
  console.log(`通过: ${colors.green}${passedTests}${colors.reset}`)
  console.log(`失败: ${colors.red}${failedTests}${colors.reset}`)
  console.log(`成功率: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : '0.00'}%`)
  console.log('=========================================')

  if (failures.length > 0) {
    console.log(`${colors.red}失败项:${colors.reset}`)
    for (const failure of failures) {
      console.log(`- ${failure.name}: ${failure.reason}`)
    }
  }

  return failedTests === 0 ? 0 : 1
}

async function main() {
  console.log('=========================================')
  console.log('   OpenCLEW 综合验证脚本')
  console.log('=========================================')

  try {
    await checkServices()
    await runUnitLikeChecks()

    const [admin, testUser, catalog] = await Promise.all([
      loginAdmin(),
      registerTestUser(),
      fetchCatalog(),
    ])

    await testCatalogEndpoints(catalog)
    await testAdminRoutes(admin.token)
    await testDownloadFlow('agent', catalog.agents[0], testUser.token, testUser.user.id)
    await testDownloadFlow('skill', catalog.skills[0], testUser.token, testUser.user.id)
    await testDownloadFlow('mcp', catalog.mcps[0], testUser.token, testUser.user.id)
    await testRatingFlow('agent', catalog.agents[0], testUser.token, testUser.user.id)
    await testRatingFlow('skill', catalog.skills[0], testUser.token, testUser.user.id)
    await testRatingFlow('mcp', catalog.mcps[0], testUser.token, testUser.user.id)
    await testTrialFlow(testUser.token, catalog.trialAgent, testUser.token)
    await testMigrationsAndCounts()
    await runPerformanceChecks()
  } catch (error) {
    log.error(`测试执行中断: ${error.stack || error.message}`)
    testFail('测试执行中断', error.message)
  } finally {
    const exitCode = summarize()
    await pool.end()
    process.exit(exitCode)
  }
}

main()
