import fs from 'fs/promises'
import path from 'path'
import { getTrialRuntimeConfig } from './config.js'
import {
  buildTrialSandboxLlmEnv,
  buildTrialSandboxLlmMetadata,
  resolveTrialSandboxLlmConfig,
} from './llmSandboxConfig.js'
import { runDockerCommand } from './sandbox/dockerCli.js'
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

function buildUsageEnvelope(usage) {
  const input = Number.isFinite(Number(usage?.input ?? usage?.prompt_tokens))
    ? Number(usage.input ?? usage.prompt_tokens)
    : null
  const output = Number.isFinite(Number(usage?.output ?? usage?.completion_tokens))
    ? Number(usage.output ?? usage.completion_tokens)
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
    TRIAL_OPENCLAW_AGENT_ID: normalizeOpenClawAgentId(session.id),
    TRIAL_OPENCLAW_TIMEOUT_SECONDS: String(
      Math.max(30, Math.floor(config.execTimeoutMs / 1000) - 30)
    ),
    TRIAL_OPENCLAW_NODE_OPTIONS: config.openclawNodeOptions,
  }

  if (!options.includeLlmConfig) {
    return {
      envMap,
      llmMetadata: null,
    }
  }

  const llmConfig = await resolveTrialSandboxLlmConfig(session)
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
  await fs.appendFile(logPath, content, 'utf8')
}

async function writeConversationState(session, history, userMessage) {
  const stateDir = path.join(session.workspace_path, 'state')
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
        history: payload,
      },
      null,
      2
    ),
    'utf8'
  )
}

export async function installSessionAgent(session) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  const { envMap, llmMetadata } = await buildSandboxEnv(session, '', {
    includeLlmConfig: true,
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

export async function runContainerSession(session, history, userMessage) {
  const config = getTrialRuntimeConfig()
  const containerName = getContainerNameFromSession(session)
  if (!containerName) {
    throw new Error('Container sandbox reference is missing')
  }

  await writeConversationState(session, history, userMessage)

  const { envMap } = await buildSandboxEnv(session, userMessage)
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

  const responseFilePath = path.join(session.workspace_path, 'state', 'response.json')
  let rawResponse = ''

  try {
    rawResponse = await fs.readFile(responseFilePath, 'utf8')
  } catch {
    rawResponse = stdout
  }

  const parsedResponse = normalizeSessionResponse(rawResponse || stdout)
  const agentMeta = parsedResponse.envelope?.raw?.meta?.agentMeta || null
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
