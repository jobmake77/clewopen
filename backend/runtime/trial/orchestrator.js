import AgentModel from '../../models/Agent.js'
import TrialSessionModel from '../../models/TrialSession.js'
import TrialSessionMessageModel from '../../models/TrialSessionMessage.js'
import { getTrialRuntimeConfig } from './config.js'
import { installSessionAgent, runContainerSession } from './containerRunner.js'
import { createLocalWorkspace, destroyLocalWorkspace } from './sandbox/localWorkspace.js'
import { createContainerWorkspace, destroyContainerWorkspace } from './sandbox/containerWorkspace.js'
import { buildSessionWorkspace, loadSessionWorkspaceFiles } from './sessionBuilder.js'
import { runPromptSession } from './promptRunner.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const MAX_TRIALS = 3
const MAX_ACTIVE_SESSIONS_PER_USER = 1

function computeExpiryDate(ttlMs = DEFAULT_TTL_MS) {
  return new Date(Date.now() + ttlMs)
}

function shouldUseContainerRuntime() {
  return getTrialRuntimeConfig().mode === 'container'
}

async function createSessionSandbox(sessionId) {
  if (shouldUseContainerRuntime()) {
    return createContainerWorkspace(sessionId)
  }
  return createLocalWorkspace(sessionId)
}

async function destroySessionSandbox(session) {
  if (!session) return

  if (session.runtime_type === 'container' || String(session.sandbox_ref || '').startsWith('docker:')) {
    await destroyContainerWorkspace(session)
    return
  }

  await destroyLocalWorkspace(session.workspace_path)
}

async function runSessionMessage(session, files, history, message) {
  if (session.runtime_type === 'container') {
    return runContainerSession(session, history, message)
  }

  return runPromptSession(session, files, history, message)
}

export async function createTrialSession({ userId, agentId }) {
  const agent = await AgentModel.findById(agentId)
  if (!agent) {
    const err = new Error('Agent 不存在')
    err.statusCode = 404
    throw err
  }

  if (agent.status !== 'approved') {
    const err = new Error('Agent 尚未通过审核')
    err.statusCode = 403
    throw err
  }

  const usedCount = await TrialSessionModel.countUserTrials(userId, agentId)
  if (usedCount >= MAX_TRIALS) {
    const err = new Error('试用次数已用完')
    err.statusCode = 429
    err.remainingTrials = 0
    throw err
  }

  const existingSession = await TrialSessionModel.findActiveByUserAndAgent(userId, agentId)
  if (existingSession) {
    return {
      session: existingSession,
      remainingTrials: Math.max(0, MAX_TRIALS - usedCount),
    }
  }

  const activeCount = await TrialSessionModel.countActiveUserSessions(userId)
  if (activeCount >= MAX_ACTIVE_SESSIONS_PER_USER) {
    const err = new Error('请先结束当前试用会话')
    err.statusCode = 409
    throw err
  }

  let session = await TrialSessionModel.create({
    user_id: userId,
    agent_id: agentId,
    status: 'provisioning',
    runtime_type: shouldUseContainerRuntime() ? 'container' : 'prompt',
    expires_at: computeExpiryDate(),
    last_activity_at: new Date(),
    metadata: {
      source: 'session-based-trial',
      version: 1,
    },
  })
  let provisionedSandbox = null

  try {
    const workspace = await createSessionSandbox(session.id)
    provisionedSandbox = workspace
    await buildSessionWorkspace(agent, workspace.workspacePath)

    let install = null
    if (workspace.type === 'container') {
      install = await installSessionAgent({
        ...session,
        sandbox_ref: workspace.sandboxRef,
        workspace_path: workspace.workspacePath,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_description: agent.description,
      })
    }

    session = await TrialSessionModel.update(session.id, {
      status: 'active',
      runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
      sandbox_ref: workspace.sandboxRef,
      workspace_path: workspace.workspacePath,
      last_activity_at: new Date(),
      metadata: {
        ...(session.metadata || {}),
        sandbox: {
          provider: workspace.type,
          ref: workspace.sandboxRef,
          ...(install?.llm
            ? {
              llm_config_id: install.llm.llm_config_id || null,
              llm: install.llm,
            }
            : {}),
        },
        install,
      },
    })

    return {
      session,
      remainingTrials: Math.max(0, MAX_TRIALS - usedCount - 1),
    }
  } catch (error) {
    await destroySessionSandbox({
      ...session,
      runtime_type: shouldUseContainerRuntime() ? 'container' : 'prompt',
      sandbox_ref: provisionedSandbox?.sandboxRef || session.sandbox_ref,
      workspace_path: provisionedSandbox?.workspacePath || session.workspace_path,
    })
    await TrialSessionModel.update(session.id, {
      status: 'failed',
      ended_at: new Date(),
      metadata: {
        ...(session.metadata || {}),
        error: error.message,
      },
    })
    throw error
  }
}

export async function sendTrialMessage({ sessionId, userId, message }) {
  if (!message || !message.trim()) {
    const err = new Error('消息内容不能为空')
    err.statusCode = 400
    throw err
  }

  const session = await TrialSessionModel.findById(sessionId)
  if (!session || session.user_id !== userId) {
    const err = new Error('试用会话不存在')
    err.statusCode = 404
    throw err
  }

  if (!['active', 'provisioning'].includes(session.status)) {
    const err = new Error('试用会话已结束')
    err.statusCode = 409
    throw err
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await expireTrialSession(session)
    const err = new Error('试用会话已过期')
    err.statusCode = 410
    throw err
  }

  const history = await TrialSessionModel.listMessages(session.id)
  const files =
    session.runtime_type === 'container' ? null : await loadSessionWorkspaceFiles(session.workspace_path)

  await TrialSessionMessageModel.create({
    session_id: session.id,
    role: 'user',
    content: message.trim(),
  })

  let result
  try {
    result = await runSessionMessage(session, files, history, message)
  } catch (error) {
    if (!getTrialRuntimeConfig().keepFailedSessions) {
      await destroySessionSandbox(session)
    }
    await TrialSessionModel.update(session.id, {
      status: 'failed',
      ended_at: new Date(),
      last_activity_at: new Date(),
      metadata: {
        ...(session.metadata || {}),
        last_error: {
          stage: session.runtime_type === 'container' ? 'container-runner' : 'prompt-runner',
          message: error.message,
          at: new Date().toISOString(),
        },
      },
    })
    throw error
  }

  await TrialSessionMessageModel.create({
    session_id: session.id,
    role: 'assistant',
    content: result.response,
    usage_prompt_tokens: result.usage.prompt_tokens,
    usage_completion_tokens: result.usage.completion_tokens,
    metadata: result.metadata || null,
  })

  const updatedSession = await TrialSessionModel.update(session.id, {
    status: 'active',
    last_activity_at: new Date(),
    expires_at: computeExpiryDate(),
  })

  return {
    session: updatedSession,
    response: result.response,
  }
}

export async function completeTrialSession(session) {
  if (!session) return

  await TrialSessionModel.update(session.id, {
    status: 'cleaning',
  })

  await destroySessionSandbox(session)

  return TrialSessionModel.update(session.id, {
    status: 'completed',
    ended_at: new Date(),
  })
}

export async function expireTrialSession(session) {
  if (!session) return

  await TrialSessionModel.update(session.id, {
    status: 'cleaning',
  })

  await destroySessionSandbox(session)

  return TrialSessionModel.update(session.id, {
    status: 'expired',
    ended_at: new Date(),
  })
}
