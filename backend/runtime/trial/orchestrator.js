import AgentModel from '../../models/Agent.js'
import AgentTrialModel from '../../models/AgentTrial.js'
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
import { ensureAgentPackageUsable, ensureAgentPackageUsableByPath } from '../../utils/agentPackageReader.js'
import {
  buildAttachmentSummary,
  buildUserMessageForModel,
} from './mediaAttachments.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const MAX_ACTIVE_SESSIONS_PER_USER = 1
const PROVISIONING_POLL_INTERVAL_MS = 2000
const PROVISIONING_PROGRESS_INTERVAL_MS = 5000
const provisioningTasks = new Map()
const gatewayWarmupTasks = new Map()
const activeMessageTasks = new Set()

function computeExpiryDate(ttlMs = DEFAULT_TTL_MS) {
  return new Date(Date.now() + ttlMs)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function buildSandboxMetadata(workspace) {
  return {
    provider: workspace.type,
    ref: workspace.sandboxRef,
    ...(workspace.pooled
      ? {
          pool: {
            pooled: true,
            slot_id: workspace.poolSlotId,
            namespace: workspace.poolNamespace,
            runtime_agent_id: workspace.runtimeAgentId,
            warm_level: workspace.poolWarmLevel || null,
            target_warm_level: workspace.poolTargetWarmLevel || null,
            gateway_ready: Boolean(workspace.poolGatewayReady),
          },
        }
      : {}),
  }
}

function buildSessionReadyDetail(workspace, gatewayWarmup) {
  if (gatewayWarmup?.status === 'failed') {
    return '试用环境已就绪，流式引擎将在首条消息时继续启动'
  }

  if (workspace?.pooled && workspace?.poolGatewayReady) {
    return '试用环境已就绪，已命中 gateway-hot 热沙盒'
  }

  if (workspace?.pooled) {
    return '试用环境已就绪，已命中预热沙盒'
  }

  return '试用环境已就绪'
}

function buildSessionWarmupDetail() {
  return '已命中预热沙盒，正在后台预热流式引擎，你可以先输入问题'
}

function buildQueuedProvisioningMessage(session, elapsedMs) {
  const elapsedSeconds = Math.max(1, Math.floor(elapsedMs / 1000))
  const detail = String(session?.metadata?.provisioning?.detail || '').trim()

  if (detail) {
    return `消息已排队，已等待 ${elapsedSeconds} 秒，${detail}`
  }

  return `消息已排队，已等待 ${elapsedSeconds} 秒，正在准备试用环境`
}

function buildAcceptedExecutionMessage(session) {
  if (session?.metadata?.provisioning?.stage === 'warming-gateway') {
    return '消息已接收，正在等待流式引擎完成预热'
  }

  return '消息已接收，正在启动试用执行'
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

async function runSessionMessage(session, files, history, message, attachments = []) {
  if (session.runtime_type === 'container') {
    return runContainerSession(session, history, message, { attachments })
  }

  return runPromptSession(session, files, history, message, { attachments })
}

async function runSessionMessageStream(session, files, history, message, onEvent, attachments = []) {
  if (session.runtime_type === 'container') {
    return runContainerSessionStream(session, history, message, { onEvent, attachments })
  }

  onEvent?.({
    type: 'status',
    stage: 'prompt-build',
    message: '正在准备试用提示词',
  })

  const result = await runPromptSession(session, files, history, message, { attachments })

  onEvent?.({
    type: 'status',
    stage: 'completed',
    message: '回复已生成，正在返回页面',
  })

  return result
}

async function waitForTrialSessionActivation(
  session,
  userId,
  inFlightProvisioning,
  onProvisioningProgress
) {
  let latestSession = session
  let lastProgressKey = ''
  let lastProgressAt = 0
  const startedAt = Date.now()

  while (true) {
    if (!latestSession || latestSession.user_id !== userId) {
      const err = new Error('试用会话不存在')
      err.statusCode = 404
      throw err
    }

    if (latestSession.status === 'failed') {
      const err = new Error('试用环境准备失败，请重新开始')
      err.statusCode = 409
      throw err
    }

    if (latestSession.status === 'active') {
      return latestSession
    }

    if (latestSession.status !== 'provisioning') {
      const err = new Error('试用环境尚未就绪，请稍后再试')
      err.statusCode = 409
      throw err
    }

    if (typeof onProvisioningProgress === 'function') {
      const provisioning = latestSession.metadata?.provisioning || null
      const progressKey = `${latestSession.status}:${provisioning?.stage || ''}:${provisioning?.detail || ''}`
      const now = Date.now()

      if (
        progressKey !== lastProgressKey ||
        now - lastProgressAt >= PROVISIONING_PROGRESS_INTERVAL_MS
      ) {
        onProvisioningProgress({
          type: 'status',
          stage: provisioning?.stage || 'provisioning',
          message: buildQueuedProvisioningMessage(latestSession, now - startedAt),
          sessionStatus: latestSession.status,
          provisioning,
          waitMs: now - startedAt,
        })
        lastProgressKey = progressKey
        lastProgressAt = now
      }
    }

    await Promise.race([
      inFlightProvisioning.catch(() => null),
      sleep(PROVISIONING_POLL_INTERVAL_MS),
    ])

    latestSession = await TrialSessionModel.findById(session.id)
  }
}

async function loadTrialMessageContext(sessionId, userId, rawMessage, options = {}) {
  const attachments = Array.isArray(options.attachments) ? options.attachments : []
  if ((!rawMessage || !rawMessage.trim()) && attachments.length === 0) {
    const err = new Error('消息内容不能为空')
    err.statusCode = 400
    throw err
  }

  const message = String(rawMessage || '').trim()
  let session = await TrialSessionModel.findById(sessionId)
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
    const inFlightProvisioning = provisioningTasks.get(session.id)

    if (!inFlightProvisioning) {
      const err = new Error('试用环境仍在准备中，请稍后再试')
      err.statusCode = 409
      throw err
    }

    session = await waitForTrialSessionActivation(
      session,
      userId,
      inFlightProvisioning,
      options.onProvisioningProgress
    )
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
    attachments,
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

function buildContainerSessionEnvelope(session, workspace, agent, sandboxMetadata) {
  return {
    ...session,
    sandbox_ref: workspace.sandboxRef,
    workspace_path: workspace.workspacePath,
    agent_id: agent.id,
    agent_name: agent.name,
    agent_description: agent.description,
    metadata: {
      ...(session.metadata || {}),
      sandbox: sandboxMetadata,
    },
  }
}

async function markTrialSessionReady(session, workspace, sandboxMetadata, install, gatewayWarmup) {
  return TrialSessionModel.update(session.id, {
    status: 'active',
    runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
    sandbox_ref: workspace.sandboxRef,
    workspace_path: workspace.workspacePath,
    last_activity_at: new Date(),
    metadata: {
      ...(session.metadata || {}),
      provisioning: buildProvisioningState(
        'ready',
        buildSessionReadyDetail(workspace, gatewayWarmup)
      ),
      sandbox: sandboxMetadata,
      ...(install ? { install } : {}),
      ...(workspace.type === 'container' ? { gateway_warmup: gatewayWarmup } : {}),
    },
  })
}

function startBackgroundGatewayWarmup(session, workspace, agent, sandboxMetadata, install) {
  if (gatewayWarmupTasks.has(session.id)) {
    return gatewayWarmupTasks.get(session.id)
  }

  const task = (async () => {
    let gatewayWarmup = null

    try {
      gatewayWarmup = await prewarmSessionGateway(
        buildContainerSessionEnvelope(session, workspace, agent, sandboxMetadata)
      )
    } catch (error) {
      gatewayWarmup = {
        status: 'failed',
        duration_ms: 0,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      }
    }

    const latestSession = await TrialSessionModel.findById(session.id)
    if (!latestSession || !['active', 'provisioning'].includes(latestSession.status)) {
      return latestSession
    }

    return markTrialSessionReady(
      latestSession,
      workspace,
      sandboxMetadata,
      install,
      gatewayWarmup
    )
  })().finally(() => {
    gatewayWarmupTasks.delete(session.id)
  })

  gatewayWarmupTasks.set(session.id, task)
  return task
}

async function executeTrialMessage(context, options = {}) {
  const { session, history, files, message, attachments } = context
  const onEvent = options.onEvent
  const modelMessage = buildUserMessageForModel(message, attachments)
  const attachmentSummary = buildAttachmentSummary(attachments)

  activeMessageTasks.add(session.id)
  try {
    onEvent?.({
      type: 'status',
      stage: 'accepted',
      message: buildAcceptedExecutionMessage(session),
    })

    await TrialSessionMessageModel.create({
      session_id: session.id,
      role: 'user',
      content: message,
      metadata: attachmentSummary.length > 0 ? { attachments: attachmentSummary } : null,
    })

    let result
    try {
      result = onEvent
        ? await runSessionMessageStream(session, files, history, modelMessage, onEvent, attachments)
        : await runSessionMessage(session, files, history, modelMessage, attachments)
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
    const sandboxMetadata = buildSandboxMetadata(workspace)

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
        preserveGateway: workspace.pooled && workspace.poolGatewayReady,
      })

      if (install?.llm) {
        sandboxMetadata.llm_config_id = install.llm.llm_config_id || null
        sandboxMetadata.llm = install.llm
      }

      if (workspace.pooled && !workspace.poolGatewayReady) {
        currentSession = await TrialSessionModel.update(currentSession.id, {
          status: 'active',
          runtime_type: workspace.type === 'container' ? 'container' : 'prompt',
          sandbox_ref: workspace.sandboxRef,
          workspace_path: workspace.workspacePath,
          last_activity_at: new Date(),
          metadata: {
            ...(currentSession.metadata || {}),
            provisioning: buildProvisioningState(
              'warming-gateway',
              buildSessionWarmupDetail()
            ),
            sandbox: sandboxMetadata,
            install,
            gateway_warmup: {
              status: 'warming',
              duration_ms: 0,
              message: 'Gateway prewarm started in background.',
              pool_slot_id: workspace.poolSlotId,
              pool_namespace: workspace.poolNamespace,
            },
          },
        })

        startBackgroundGatewayWarmup(currentSession, workspace, agent, sandboxMetadata, install)
        return
      }

      if (workspace.pooled) {
        currentSession = await updateSessionProvisioningMetadata(
          currentSession.id,
          'warming-gateway',
          workspace.poolGatewayReady
            ? '正在校验 gateway-hot 热沙盒'
            : '正在预热流式引擎',
          currentSession.metadata
        )

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

        if (workspace.poolGatewayReady) {
          gatewayWarmup = {
            ...gatewayWarmup,
            status: gatewayWarmup.status === 'ok' ? 'reused' : gatewayWarmup.status,
            message:
              gatewayWarmup.status === 'ok'
                ? 'Gateway-hot warm sandbox pool hit'
                : gatewayWarmup.message || 'Gateway-hot warm sandbox validation failed',
            pool_slot_id: workspace.poolSlotId,
            pool_namespace: workspace.poolNamespace,
            warm_level: workspace.poolWarmLevel || null,
          }
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

    currentSession = await markTrialSessionReady(
      currentSession,
      workspace,
      sandboxMetadata,
      install,
      gatewayWarmup
    )
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

export async function createTrialSession({ userId, agentId, packageOverride = null, metadataPatch = null }) {
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

  if (packageOverride?.localPath) {
    await ensureAgentPackageUsableByPath(packageOverride.localPath)
  } else {
    await ensureAgentPackageUsable(agent.package_url)
  }

  const quota = await AgentTrialModel.getDailyQuotaSummary(userId, agentId)
  if (quota.remainingTrials <= 0) {
    const err = new Error('试用次数已用完')
    err.statusCode = 429
    err.remainingTrials = 0
    throw err
  }

  const existingSession = await TrialSessionModel.findActiveByUserAndAgent(userId, agentId)
  if (existingSession) {
    if (metadataPatch?.custom_order_submission_id) {
      const existingSubmissionId = existingSession?.metadata?.custom_order_submission_id
      if (existingSubmissionId && existingSubmissionId !== metadataPatch.custom_order_submission_id) {
        // continue to create a dedicated session for this submission
      } else {
        if (existingSession.status === 'provisioning' && !provisioningTasks.has(existingSession.id)) {
          const patchedAgent = packageOverride?.localPath
            ? { ...agent, package_local_path: packageOverride.localPath }
            : agent
          const task = provisionTrialSession(existingSession, patchedAgent).catch(() => {})
          provisioningTasks.set(existingSession.id, task)
        }

        return {
          session: existingSession,
          remainingTrials: quota.remainingTrials,
        }
      }
    } else {
    if (existingSession.status === 'provisioning' && !provisioningTasks.has(existingSession.id)) {
      const task = provisionTrialSession(existingSession, agent).catch(() => {})
      provisioningTasks.set(existingSession.id, task)
    }

    return {
      session: existingSession,
      remainingTrials: quota.remainingTrials,
    }
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
      ...(metadataPatch || {}),
    },
  })

  const patchedAgent = packageOverride?.localPath
    ? { ...agent, package_local_path: packageOverride.localPath }
    : agent
  const task = provisionTrialSession(session, patchedAgent).catch(() => {})
  provisioningTasks.set(session.id, task)

  return {
    session,
    remainingTrials: Math.max(0, quota.remainingTrials - 1),
  }
}

export async function sendTrialMessage({ sessionId, userId, message, attachments = [] }) {
  const context = await loadTrialMessageContext(sessionId, userId, message, { attachments })
  return executeTrialMessage(context)
}

export async function streamTrialMessage({ sessionId, userId, message, attachments = [], onEvent }) {
  const context = await loadTrialMessageContext(sessionId, userId, message, {
    attachments,
    onProvisioningProgress: onEvent,
  })
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
