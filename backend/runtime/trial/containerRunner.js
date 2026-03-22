import fs from 'fs/promises'
import path from 'path'
import { getTrialRuntimeConfig } from './config.js'
import {
  buildTrialSandboxLlmEnv,
  buildTrialSandboxLlmMetadata,
  resolveTrialSandboxLlmConfig,
} from './llmSandboxConfig.js'
import {
  classifyOpenClawOutputLine,
  flushOpenClawGatewaySseBuffer,
} from './streamEvents.js'
import { runDockerCommand, runDockerCommandStreaming } from './sandbox/dockerCli.js'
import { getContainerNameFromSession } from './sandbox/containerWorkspace.js'

function truncateText(value, maxLength = 4000) {
  if (!value) return ''
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function normalizeOpenClawAgentId(sessionId) {
  const normalized = String(sessionId || 'trial-session')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `trial-${normalized || 'session'}`
}

function resolveRuntimeAgentId(session, options = {}) {
  const explicitRuntimeAgentId = String(options.runtimeAgentId || '').trim()
  if (explicitRuntimeAgentId) {
    return explicitRuntimeAgentId
  }

  const pooledRuntimeAgentId = String(
    session?.metadata?.sandbox?.pool?.runtime_agent_id ||
      session?.sandbox_pool?.runtime_agent_id ||
      ''
  ).trim()

  if (pooledRuntimeAgentId) {
    return pooledRuntimeAgentId
  }

  return normalizeOpenClawAgentId(session?.id)
}

function buildUsageEnvelope(usage) {
  const input = Number.isFinite(
    Number(usage?.input ?? usage?.prompt_tokens ?? usage?.input_tokens)
  )
    ? Number(usage.input ?? usage.prompt_tokens ?? usage.input_tokens)
    : null
  const output = Number.isFinite(
    Number(usage?.output ?? usage?.completion_tokens ?? usage?.output_tokens)
  )
    ? Number(usage.output ?? usage.completion_tokens ?? usage.output_tokens)
    : null

  return {
    prompt_tokens: input,
    completion_tokens: output,
  }
}

function normalizeSessionResponse(rawValue) {
  if (!rawValue) {
    return {
      response: '',
      usage: buildUsageEnvelope(null),
      envelope: null,
    }
  }

  try {
    const parsed = JSON.parse(rawValue)
    const payloads = Array.isArray(parsed?.payloads) ? parsed.payloads : []
    const payloadText = payloads
      .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
      .filter(Boolean)
      .join('\n\n')

    const response = (
      payloadText ||
      (typeof parsed?.response === 'string' ? parsed.response.trim() : '') ||
      (typeof parsed?.output === 'string' ? parsed.output.trim() : '') ||
      (typeof parsed?.message === 'string' ? parsed.message.trim() : '') ||
      (typeof parsed?.summary === 'string' ? parsed.summary.trim() : '') ||
      JSON.stringify(parsed, null, 2)
    )

    return {
      response,
      usage: buildUsageEnvelope(
        parsed?.usage || parsed?.raw?.meta?.agentMeta?.usage || parsed?.raw?.meta?.agentMeta?.lastCallUsage
      ),
      envelope: parsed,
    }
  } catch {
    return {
      response: rawValue.trim(),
      usage: buildUsageEnvelope(null),
      envelope: null,
    }
  }
}

async function buildSandboxEnv(session, userMessage, options = {}) {
  const config = getTrialRuntimeConfig()
  const mountPath = config.workspaceMountPath
  const runtimeAgentId = resolveRuntimeAgentId(session, options)
  const envMap = {
    SESSION_ID: session.id,
    AGENT_ID: session.agent_id,
    AGENT_NAME: session.agent_name || '',
    AGENT_DESCRIPTION: session.agent_description || '',
    USER_MESSAGE: userMessage.trim(),
    WORKSPACE_DIR: mountPath,
    AGENT_DIR: path.posix.join(mountPath, 'agent'),
    STATE_DIR: path.posix.join(mountPath, 'state'),
    LOG_DIR: path.posix.join(mountPath, 'logs'),
    ARTIFACTS_DIR: path.posix.join(mountPath, 'artifacts'),
    REQUEST_FILE: path.posix.join(mountPath, 'state', 'request.json'),
    HISTORY_FILE: path.posix.join(mountPath, 'state', 'history.json'),
    RESPONSE_FILE: path.posix.join(mountPath, 'state', 'response.json'),
    INSTALL_LOG_FILE: path.posix.join(mountPath, 'logs', 'install.log'),
    EXEC_LOG_FILE: path.posix.join(mountPath, 'logs', 'execution.log'),
    AGENT_PACKAGE_FILE: path.posix.join(mountPath, 'artifacts', 'agent-package.zip'),
    TRIAL_OPENCLAW_AGENT_ID: runtimeAgentId,
    TRIAL_OPENCLAW_TIMEOUT_SECONDS: String(
      Math.max(30, Math.floor(config.execTimeoutMs / 1000) - 30)
    ),
    TRIAL_OPENCLAW_NODE_OPTIONS: config.openclawNodeOptions,
    TRIAL_OPENCLAW_GATEWAY_PORT: String(config.openclawGatewayPort),
    TRIAL_OPENCLAW_GATEWAY_STARTUP_TIMEOUT_SECONDS: String(
      config.openclawGatewayStartupTimeoutSeconds
    ),
    TRIAL_OPENCLAW_THINKING_LEVEL: config.openclawThinkingLevel,
    TRIAL_OPENCLAW_VERBOSE: config.openclawVerbose,
    TRIAL_OPENCLAW_POOL_REUSE: options.poolReuse ? 'true' : 'false',
    TRIAL_OPENCLAW_PRESERVE_GATEWAY_ON_POOL_REUSE: options.preserveGateway ? 'true' : 'false',
  }

  if (!options.includeLlmConfig) {
    return {
      envMap,
      llmMetadata: null,
    }
  }

  const llmConfig =
    options.llmConfig || await resolveTrialSandboxLlmConfig(session, options.llmResolveOptions)
  const llmMetadata = buildTrialSandboxLlmMetadata(llmConfig)

  return {
    envMap: {
      ...envMap,
      ...buildTrialSandboxLlmEnv(llmConfig),
    },
    llmMetadata,
  }
}

function buildDockerExecArgs(containerName, command, envMap) {
  const config = getTrialRuntimeConfig()
  const envArgs = Object.entries(envMap).flatMap(([key, value]) => ['-e', `${key}=${value}`])
  return ['exec', ...envArgs, containerName, config.shell, '-lc', command]
}

async function appendLogFile(workspacePath, fileName, content) {
  if (!workspacePath || !content) return
  const logPath = path.join(workspacePath, 'logs', fileName)
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    await fs.appendFile(logPath, content, 'utf8')
  } catch {
    // Logging should never be able to break sandbox lifecycle flows.
  }
}

async function writeConversationState(session, history, userMessage, options = {}) {
  const stateDir = path.join(session.workspace_path, 'state')
  const attachments = Array.isArray(options.attachments) ? options.attachments : []
  const payload = history.map((item) => ({
    role: item.role,
    content: item.content,
    created_at: item.created_at,
  }))

  await fs.writeFile(path.join(stateDir, 'history.json'), JSON.stringify(payload, null, 2), 'utf8')
  await fs.writeFile(
    path.join(stateDir, 'request.json'),
    JSON.stringify(
      {
        sessionId: session.id,
        agentId: session.agent_id,
        userMessage: userMessage.trim(),
        attachments: attachments.map((item) => ({
          id: item.id,
          kind: item.kind,
          mimeType: item.mimeType,
          fileName: item.fileName,
          sizeBytes: item.sizeBytes,
          dataUrl: item.dataUrl,
        })),
        history: payload,
      },
      null,
      2
    ),
    'utf8'
  )
}

function getResponseFilePath(session) {
  return path.join(session.workspace_path, 'state', 'response.json')
}

async function readSessionResponseFile(session, fallbackOutput = '') {
  const responseFilePath = getResponseFilePath(session)
  let rawResponse = ''

  try {
    rawResponse = await fs.readFile(responseFilePath, 'utf8')
  } catch {
    rawResponse = fallbackOutput
  }

  const parsedResponse = normalizeSessionResponse(rawResponse || fallbackOutput)
  const agentMeta = parsedResponse.envelope?.raw?.meta?.agentMeta || null

  return {
    parsedResponse,
    responseFilePath,
    agentMeta,
  }
}

function appendStreamBuffer(state, chunk) {
  flushOpenClawGatewaySseBuffer(state.gateway, chunk, (event) => {
    if (event.type === 'delta' && event.delta) {
      state.sawDelta = true
    }
    state.onEvent?.(event)
  })

  if (state.jsonStarted) {
    return state
  }

  state.lineBuffer += chunk
  const segments = state.lineBuffer.split(/\r?\n/)
  state.lineBuffer = segments.pop() || ''

  for (const segment of segments) {
    const line = segment.trim()
    if (!line) continue

    if (line.startsWith('{')) {
      state.jsonStarted = true
      state.onEvent?.({
        type: 'status',
        stage: 'response-finalizing',
        message: '正在整理最终回复内容',
      })
      return state
    }

    const event = classifyOpenClawOutputLine(line)
    if (event) {
      state.onEvent?.(event)
    }
  }

  return state
}

function createHeartbeatEmitter(onEvent) {
  if (!onEvent) {
    return {
      start() {},
      stop() {},
    }
  }

  let heartbeatCount = 0
  const startedAt = Date.now()
  const timerId = setInterval(() => {
    heartbeatCount += 1
    onEvent({
      type: 'heartbeat',
      stage: 'running',
      message: `正在持续执行中，已等待 ${Math.max(1, Math.floor((Date.now() - startedAt) / 1000))} 秒`,
      heartbeatCount,
    })
  }, 5000)

  return {
    start() {},
    stop() {
      clearInterval(timerId)
    },
  }
}

export async function installSessionAgent(session, options = {}) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  const { envMap, llmMetadata } = await buildSandboxEnv(session, '', {
    includeLlmConfig: true,
    poolReuse: options.poolReuse,
    runtimeAgentId: options.runtimeAgentId,
    preserveGateway: options.preserveGateway,
    llmConfig: options.llmConfig,
    llmResolveOptions: options.llmResolveOptions,
  })
  const args = buildDockerExecArgs(containerName, config.installCommand, envMap)

  try {
    const result = await runDockerCommand(args, { timeoutMs: config.execTimeoutMs })
    await appendLogFile(
      session.workspace_path,
      'install.log',
      `[${new Date().toISOString()}] install command\n${result.stdout || ''}\n${result.stderr || ''}\n`
    )
    return {
      status: 'ok',
      stdout: truncateText(result.stdout),
      stderr: truncateText(result.stderr),
      llm: llmMetadata,
    }
  } catch (error) {
    await appendLogFile(
      session.workspace_path,
      'install.log',
      `[${new Date().toISOString()}] install command failed\n${error.stdout || ''}\n${error.stderr || ''}\n`
    )
    throw error
  }
}

export async function prewarmSessionGateway(session) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  const startedAt = Date.now()
  const { envMap } = await buildSandboxEnv(session, '')
  const args = buildDockerExecArgs(containerName, config.prewarmCommand, envMap)

  try {
    const result = await runDockerCommand(args, {
      timeoutMs: Math.min(config.execTimeoutMs, 120000),
    })
    await appendLogFile(
      session.workspace_path,
      'install.log',
      `[${new Date().toISOString()}] gateway prewarm\n${result.stdout || ''}\n${result.stderr || ''}\n`
    )
    return {
      status: 'ok',
      duration_ms: Date.now() - startedAt,
      stdout: truncateText(result.stdout),
      stderr: truncateText(result.stderr),
    }
  } catch (error) {
    await appendLogFile(
      session.workspace_path,
      'install.log',
      `[${new Date().toISOString()}] gateway prewarm failed\n${error.stdout || ''}\n${error.stderr || ''}\n`
    )
    return {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error: error.message,
      stdout: truncateText(error.stdout),
      stderr: truncateText(error.stderr),
    }
  }
}

async function finalizeContainerSession(session, stdout, stderr) {
  const { parsedResponse, responseFilePath, agentMeta } = await readSessionResponseFile(session, stdout)
  await appendLogFile(
    session.workspace_path,
    'execution.log',
    `[${new Date().toISOString()}] execution ok\n${stdout}\n${stderr}\n`
  )

  return {
    response: parsedResponse.response,
    usage: parsedResponse.usage,
    metadata: {
      runtime: 'container',
      stdout: truncateText(stdout),
      stderr: truncateText(stderr),
      response_file: path.basename(responseFilePath),
      agent_provider: agentMeta?.provider || null,
      agent_model: agentMeta?.model || null,
      agent_session_id: agentMeta?.sessionId || null,
    },
  }
}

export async function runContainerSession(session, history, userMessage, options = {}) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  await writeConversationState(session, history, userMessage, options)

  const { envMap } = await buildSandboxEnv(session, userMessage, {
    llmConfig: options.llmConfig,
    llmResolveOptions: options.llmResolveOptions,
    includeLlmConfig: true,
  })
  const args = buildDockerExecArgs(containerName, config.runCommand, envMap)

  let stdout = ''
  let stderr = ''

  try {
    const result = await runDockerCommand(args, { timeoutMs: config.execTimeoutMs })
    stdout = result.stdout || ''
    stderr = result.stderr || ''
  } catch (error) {
    stdout = error.stdout || ''
    stderr = error.stderr || ''
    await appendLogFile(
      session.workspace_path,
      'execution.log',
      `[${new Date().toISOString()}] execution failed\n${stdout}\n${stderr}\n`
    )
    throw error
  }

  return finalizeContainerSession(session, stdout, stderr)
}

export async function runContainerSessionStream(session, history, userMessage, options = {}) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  await writeConversationState(session, history, userMessage, options)

  const { envMap } = await buildSandboxEnv(session, userMessage, {
    llmConfig: options.llmConfig,
    llmResolveOptions: options.llmResolveOptions,
    includeLlmConfig: true,
  })
  const args = buildDockerExecArgs(containerName, config.runCommand, envMap)
  const streamState = {
    lineBuffer: '',
    jsonStarted: false,
    sawDelta: false,
    gateway: {
      buffer: '',
      seenEvent: false,
    },
    onEvent: options.onEvent,
  }

  options.onEvent?.({
    type: 'status',
    stage: 'session-dispatched',
    message: '消息已提交，正在进入 Agent 运行时',
  })

  const heartbeat = createHeartbeatEmitter(options.onEvent)
  heartbeat.start()

  let stdout = ''
  let stderr = ''

  try {
    const result = await runDockerCommandStreaming(args, {
      timeoutMs: config.execTimeoutMs,
      onStdoutChunk: (chunk) => {
        stdout += chunk
        appendStreamBuffer(streamState, chunk)
      },
      onStderrChunk: (chunk) => {
        stderr += chunk
      },
    })

    stdout = result.stdout || stdout
    stderr = result.stderr || stderr
  } catch (error) {
    heartbeat.stop()
    stdout = error.stdout || stdout
    stderr = error.stderr || stderr
    await appendLogFile(
      session.workspace_path,
      'execution.log',
      `[${new Date().toISOString()}] execution failed\n${stdout}\n${stderr}\n`
    )
    throw error
  }

  heartbeat.stop()
  appendStreamBuffer(streamState, '\n\n')
  return finalizeContainerSession(session, stdout, stderr)
}
