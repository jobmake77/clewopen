import AgentModel from '../../models/Agent.js'
import TrialSessionModel from '../../models/TrialSession.js'
import TrialSessionMessageModel from '../../models/TrialSessionMessage.js'
import { getTrialRuntimeConfig } from './config.js'
import {
  installSessionAgent,
  prewarmSessionGateway,
  runContainerSession,
  runContainerSessionStream,
} from './containerRunner.js'
import { createLocalWorkspace, destroyLocalWorkspace } from './sandbox/localWorkspace.js'
import { createContainerWorkspace, destroyContainerWorkspace } from './sandbox/containerWorkspace.js'
import {
  acquireTrialSandboxSlot,
  releaseTrialSandboxSlot,
} from './sandbox/poolManager.js'
import { buildSessionWorkspace, loadSessionWorkspaceFiles } from './sessionBuilder.js'
import { runPromptSession } from './promptRunner.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const MAX_TRIALS = 3
const MAX_ACTIVE_SESSIONS_PER_USER = 1
const provisioningTasks = new Map()
const activeMessageTasks = new Set()

function computeExpiryDate(ttlMs = DEFAULT_TTL_MS) {
  return new Date(Date.now() + ttlMs)
}

function shouldUseContainerRuntime() {
  return getTrialRuntimeConfig().mode === 'container'
}

function buildProvisioningState(stage, detail) {
  return {
    stage,
    detail,
    updatedAt: new Date().toISOString(),
  }
}

async function updateSessionProvisioningMetadata(sessionId, stage, detail, metadata = {}) {
  return TrialSessionModel.update(sessionId, {
    metadata: {
      ...(metadata || {}),
      provisioning: buildProvisioningState(stage, detail),
    },
    last_activity_at: new Date(),
  })
}

async function createSessionSandbox(sessionId) {
  if (shouldUseContainerRuntime()) {
    const pooledWorkspace = await acquireTrialSandboxSlot(sessionId)
    if (pooledWorkspace) {
      return pooledWorkspace
    }

    return createContainerWorkspace(sessionId)
  }
  return createLocalWorkspace(sessionId)
}

async function destroySessionSandbox(session) {
  if (!session) return

  const releasedPoolSlot = await releaseTrialSandboxSlot(session)
  if (releasedPoolSlot) {
    return
  }

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

async function runSessionMessageStream(session, files, history, message, onEvent) {
  if (session.runtime_type === 'container') {
    return runContainerSessionStream(session, history, message, { onEvent })
  }

  onEvent?.({
    type: 'status',
    stage: 'prompt-build',
    message: '正在准备试用提示词',
  })

  const result = await runPromptSession(session, files, history, message)

  onEvent?.({
    type: 'status',
    stage: 'completed',
    message: '回复已生成，正在返回页面',
  })

  return result
}

async function loadTrialMessageContext(sessionId, userId, rawMessage) {
  if (!rawMessage || !rawMessage.trim()) {
    const err = new Error('消息内容不能为空')
    err.statusCode = 400
    throw err
  }

  const message = rawMessage.trim()
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

  if (session.status === 'provisioning') {
    const err = new Error('试用环境仍在准备中，请稍后再试')
    err.statusCode = 409
    throw err
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await expireTrialSession(session)
    const err = new Error('试用会话已过期')
    err.statusCode = 410
    throw err
  }

  if (activeMessageTasks.has(session.id)) {
    const err = new Error('上一条消息仍在处理中，请稍候')
    err.statusCode = 409
    throw err
  }

  const history = await TrialSessionModel.listMessages(session.id)
  const files =
    session.runtime_type === 'container' ? null : await loadSessionWorkspaceFiles(session.workspace_path)

  return {
    session,
    history,
    files,
    message,
  }
}

async function persistAssistantMessage(session, result) {
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

async function handleTrialMessageFailure(session, error) {
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
}

async function executeTrialMessage(context, options = {}) {
  const { session, history, files, message } = context
  const onEvent = options.onEvent

  activeMessageTasks.add(session.id)
  try {
    onEvent?.({
      type: 'status',
      stage: 'accepted',
      message: '消息已接收，正在启动试用执行',
    })

    await TrialSessionMessageModel.create({
      session_id: session.id,
      role: 'user',
      content: message,
    })

    let result
    try {
      result = onEvent
        ? await runSessionMessageStream(session, files, history, message, onEvent)
        : await runSessionMessage(session, files, history, message)
    } catch (error) {
      await handleTrialMessageFailure(session, error)
      throw error
    }

    const persisted = await persistAssistantMessage(session, result)
    onEvent?.({
      type: 'done',
      sessionId: persisted.session.id,
      status: persisted.session.status,
      expiresAt: persisted.session.expires_at,
      response: persisted.response,
    })
    return persisted
  } finally {
    activeMessageTasks.delete(session.id)
  }
}

async function provisionTrialSession(session, agent) {
  let currentSession = session
  let provisionedSandbox = null

  try {
    currentSession = await updateSessionProvisioningMetadata(
      currentSession.id,
      'creating-sandbox',
      '正在创建沙盒环境',
      currentSession.metadata
    )

    const workspace = await createSessionSandbox(currentSession.id)
    provisionedSandbox = workspace

    currentSession = await TrialSessionModel.update(currentSession.id, {
      sandbox_ref: workspace.sandboxRef,
      workspace_path: workspace.workspacePath,
      runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
      metadata: {
        ...(currentSession.metadata || {}),
        provisioning: buildProvisioningState('building-workspace', '正在写入 Agent 工作区'),
        sandbox: {
          provider: workspace.type,
          ref: workspace.sandboxRef,
          ...(workspace.pooled
            ? {
              pool: {
                pooled: true,
                slot_id: workspace.poolSlotId,
                namespace: workspace.poolNamespace,
                runtime_agent_id: workspace.runtimeAgentId,
              },
            }
            : {}),
        },
      },
      last_activity_at: new Date(),
    })

    await buildSessionWorkspace(agent, workspace.workspacePath)

    let install = null
    let gatewayWarmup = null
    const sandboxMetadata = {
      provider: workspace.type,
      ref: workspace.sandboxRef,
      ...(workspace.pooled
        ? {
          pool: {
            pooled: true,
            slot_id: workspace.poolSlotId,
            namespace: workspace.poolNamespace,
            runtime_agent_id: workspace.runtimeAgentId,
          },
        }
        : {}),
    }

    if (workspace.type === 'container') {
      currentSession = await updateSessionProvisioningMetadata(
        currentSession.id,
        'installing-agent',
        '正在安装 Agent 运行环境',
        currentSession.metadata
      )

      install = await installSessionAgent({
        ...currentSession,
        sandbox_ref: workspace.sandboxRef,
        workspace_path: workspace.workspacePath,
        agent_id: agent.id,
        agent_name: agent.name,
        agent_description: agent.description,
        metadata: {
          ...(currentSession.metadata || {}),
          sandbox: sandboxMetadata,
        },
      }, {
        poolReuse: workspace.pooled,
        runtimeAgentId: workspace.runtimeAgentId,
      })

      if (install?.llm) {
        sandboxMetadata.llm_config_id = install.llm.llm_config_id || null
        sandboxMetadata.llm = install.llm
      }

      if (workspace.pooled) {
        gatewayWarmup = {
          status: 'reused',
          duration_ms: 0,
          message: 'Warm sandbox pool hit',
          pool_slot_id: workspace.poolSlotId,
          pool_namespace: workspace.poolNamespace,
        }
      } else {
        currentSession = await TrialSessionModel.update(currentSession.id, {
          status: 'active',
          runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
          sandbox_ref: workspace.sandboxRef,
          workspace_path: workspace.workspacePath,
          last_activity_at: new Date(),
          metadata: {
            ...(currentSession.metadata || {}),
            provisioning: buildProvisioningState('warming-gateway', '正在预热流式引擎'),
            sandbox: sandboxMetadata,
            install,
          },
        })

        gatewayWarmup = await prewarmSessionGateway({
          ...currentSession,
          sandbox_ref: workspace.sandboxRef,
          workspace_path: workspace.workspacePath,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_description: agent.description,
          metadata: {
            ...(currentSession.metadata || {}),
            sandbox: sandboxMetadata,
          },
        })
      }
    }

    const readyDetail =
      gatewayWarmup?.status === 'failed'
        ? '试用环境已就绪，流式引擎将在首条消息时继续启动'
        : workspace.pooled
          ? '试用环境已就绪，已命中预热沙盒'
        : '试用环境已就绪'

    currentSession = await TrialSessionModel.update(currentSession.id, {
      status: 'active',
      runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
      sandbox_ref: workspace.sandboxRef,
      workspace_path: workspace.workspacePath,
      last_activity_at: new Date(),
      metadata: {
        ...(currentSession.metadata || {}),
        provisioning: buildProvisioningState('ready', readyDetail),
        sandbox: sandboxMetadata,
        ...(install ? { install } : {}),
        ...(workspace.type === 'container' ? { gateway_warmup: gatewayWarmup } : {}),
      },
    })
  } catch (error) {
    await destroySessionSandbox({
      ...currentSession,
      runtime_type: shouldUseContainerRuntime() ? 'container' : 'prompt',
      sandbox_ref: provisionedSandbox?.sandboxRef || currentSession.sandbox_ref,
      workspace_path: provisionedSandbox?.workspacePath || currentSession.workspace_path,
    })
    await TrialSessionModel.update(currentSession.id, {
      status: 'failed',
      ended_at: new Date(),
      last_activity_at: new Date(),
      metadata: {
        ...(currentSession.metadata || {}),
        provisioning: buildProvisioningState('failed', '试用环境准备失败'),
        error: error.message,
      },
    })
    throw error
  } finally {
    provisioningTasks.delete(currentSession.id)
  }
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
    if (existingSession.status === 'provisioning' && !provisioningTasks.has(existingSession.id)) {
      const task = provisionTrialSession(existingSession, agent).catch(() => {})
      provisioningTasks.set(existingSession.id, task)
    }

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
      provisioning: buildProvisioningState('queued', '试用环境排队中'),
    },
  })

  const task = provisionTrialSession(session, agent).catch(() => {})
  provisioningTasks.set(session.id, task)

  return {
    session,
    remainingTrials: Math.max(0, MAX_TRIALS - usedCount - 1),
  }
}

export async function sendTrialMessage({ sessionId, userId, message }) {
  const context = await loadTrialMessageContext(sessionId, userId, message)
  return executeTrialMessage(context)
}

export async function streamTrialMessage({ sessionId, userId, message, onEvent }) {
  const context = await loadTrialMessageContext(sessionId, userId, message)
  return executeTrialMessage(context, { onEvent })
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
