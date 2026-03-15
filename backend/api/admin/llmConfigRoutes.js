import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/auth.js'
import LlmConfigModel from '../../models/LlmConfig.js'
import { testLlmConfig } from '../../services/llmService.js'
import { logger } from '../../config/logger.js'
import {
  getTrialSandboxPoolSnapshot,
  recycleTrialSandboxSlot,
} from '../../runtime/trial/sandbox/poolManager.js'

const router = Router()

// 所有路由均需管理员权限
router.use(authenticate, authorize('admin'))

let gatewayHotRefreshTask = null
const gatewayHotRefreshState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  activationConfigId: null,
  requestedBy: null,
  requestedSlots: 0,
  result: null,
  error: null,
}

function isPoolDisabledError(error) {
  return Number(error?.statusCode || 0) === 409 && error?.code === 'pool_disabled'
}

function buildPoolRefreshPayload(payload) {
  return {
    skipped: Boolean(payload?.skipped),
    reason: payload?.reason || null,
    message: payload?.message || '',
    requestedSlots: Number(payload?.requestedSlots || 0),
    completedSlots: Number(payload?.completedSlots || 0),
    queuedSlots: Number(payload?.queuedSlots || 0),
    failedSlots: Number(payload?.failedSlots || 0),
    results: Array.isArray(payload?.results) ? payload.results : [],
    async: Boolean(payload?.async),
    inFlight: Boolean(payload?.inFlight),
    startedAt: payload?.startedAt || null,
    finishedAt: payload?.finishedAt || null,
  }
}

function resolveGatewayHotSlotIds() {
  const poolSlots = getTrialSandboxPoolSnapshot()
  return poolSlots
    .filter((slot) => slot.targetWarmLevel === 'gateway-hot')
    .map((slot) => slot.id)
}

async function runGatewayHotSlotsRefreshAfterActivation(configId, requestedBy, slotIds) {
  const reason = `llm-config-activated-${configId}`
  const results = []

  for (const slotId of slotIds) {
    try {
      const result = await recycleTrialSandboxSlot(slotId, {
        reason,
        requestedBy,
      })
      results.push({
        slotId,
        status: result.status || 'completed',
        message: result.message,
      })
    } catch (error) {
      if (isPoolDisabledError(error)) {
        return buildPoolRefreshPayload({
          skipped: true,
          reason: 'pool-disabled',
          message: 'Warm pool 未启用，跳过热槽刷新。',
          requestedSlots: slotIds.length,
          completedSlots: 0,
          queuedSlots: 0,
          failedSlots: 0,
          results: [],
        })
      }

      results.push({
        slotId,
        status: 'failed',
        error: error.message,
      })
    }
  }

  const completed = results.filter((item) => item.status === 'completed').length
  const queued = results.filter((item) => item.status === 'queued').length
  const failed = results.filter((item) => item.status === 'failed').length

  return buildPoolRefreshPayload({
    skipped: false,
    reason: null,
    message:
      failed > 0
        ? `gateway-hot 热槽刷新完成，${completed} 个已重建，${queued} 个排队，${failed} 个失败。`
        : `gateway-hot 热槽刷新完成，${completed} 个已重建，${queued} 个排队。`,
    requestedSlots: slotIds.length,
    completedSlots: completed,
    queuedSlots: queued,
    failedSlots: failed,
    results,
  })
}

function scheduleGatewayHotSlotsRefreshAfterActivation(config, requestedBy) {
  if (String(config?.role || 'trial') !== 'trial') {
    return buildPoolRefreshPayload({
      skipped: true,
      reason: 'non-trial-role',
      message: '仅 trial 角色会触发 warm pool 热槽滚动重建。',
    })
  }

  let gatewayHotSlotIds = []
  try {
    gatewayHotSlotIds = resolveGatewayHotSlotIds()
  } catch (error) {
    if (isPoolDisabledError(error)) {
      return buildPoolRefreshPayload({
        skipped: true,
        reason: 'pool-disabled',
        message: 'Warm pool 未启用，跳过热槽刷新。',
      })
    }
    throw error
  }

  if (gatewayHotSlotIds.length === 0) {
    return buildPoolRefreshPayload({
      skipped: true,
      reason: 'no-gateway-hot-slots',
      message: '当前 warm pool 未配置 gateway-hot 槽位，无需刷新。',
    })
  }

  if (gatewayHotRefreshTask) {
    return buildPoolRefreshPayload({
      skipped: false,
      reason: 'refresh-in-flight',
      message: '已有 gateway-hot 热槽滚动刷新任务在执行，当前激活会复用该任务。',
      requestedSlots: Number(gatewayHotRefreshState.requestedSlots || gatewayHotSlotIds.length),
      completedSlots: 0,
      queuedSlots: Number(gatewayHotRefreshState.requestedSlots || gatewayHotSlotIds.length),
      failedSlots: 0,
      results: [],
      async: true,
      inFlight: true,
      startedAt: gatewayHotRefreshState.startedAt,
      finishedAt: null,
    })
  }

  gatewayHotRefreshState.status = 'running'
  gatewayHotRefreshState.startedAt = new Date().toISOString()
  gatewayHotRefreshState.finishedAt = null
  gatewayHotRefreshState.activationConfigId = config.id
  gatewayHotRefreshState.requestedBy = requestedBy
  gatewayHotRefreshState.requestedSlots = gatewayHotSlotIds.length
  gatewayHotRefreshState.result = null
  gatewayHotRefreshState.error = null

  gatewayHotRefreshTask = runGatewayHotSlotsRefreshAfterActivation(
    config.id,
    requestedBy,
    gatewayHotSlotIds
  )
    .then((result) => {
      gatewayHotRefreshState.status = 'succeeded'
      gatewayHotRefreshState.finishedAt = new Date().toISOString()
      gatewayHotRefreshState.result = result
      logger.info(
        `Gateway-hot pool refresh finished for llm config ${config.id}: ${result.message}`
      )
    })
    .catch((error) => {
      gatewayHotRefreshState.status = 'failed'
      gatewayHotRefreshState.finishedAt = new Date().toISOString()
      gatewayHotRefreshState.error = error.message
      logger.warn(`Gateway-hot pool refresh failed for llm config ${config.id}: ${error.message}`)
    })
    .finally(() => {
      gatewayHotRefreshTask = null
    })

  return buildPoolRefreshPayload({
    skipped: false,
    reason: null,
    message: `已触发 gateway-hot 热槽后台滚动刷新，共 ${gatewayHotSlotIds.length} 个槽位。`,
    requestedSlots: gatewayHotSlotIds.length,
    completedSlots: 0,
    queuedSlots: gatewayHotSlotIds.length,
    failedSlots: 0,
    results: gatewayHotSlotIds.map((slotId) => ({
      slotId,
      status: 'queued',
      message: '等待后台滚动重建',
    })),
    async: true,
    inFlight: true,
    startedAt: gatewayHotRefreshState.startedAt,
    finishedAt: null,
  })
}

// GET /api/admin/llm-configs — 列表
router.get('/llm-configs', async (req, res) => {
  try {
    const configs = await LlmConfigModel.findAll()
    res.json({ success: true, data: configs })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/llm-configs — 新建
router.post('/llm-configs', async (req, res) => {
  try {
    const {
      provider_name,
      api_url,
      api_key,
      model_id,
      role,
      priority,
      is_enabled,
      max_tokens,
      temperature,
      capabilities,
      metadata,
      auth_type,
      enable_stream,
      reasoning_effort,
      include_max_completion_tokens,
      include_max_output_tokens,
      legacy_openai_format,
    } = req.body
    if (!provider_name || !api_url || !api_key || !model_id) {
      return res.status(400).json({ success: false, error: '缺少必填字段' })
    }
    const config = await LlmConfigModel.create({
      provider_name,
      api_url,
      api_key,
      model_id,
      role,
      priority,
      is_enabled,
      max_tokens,
      temperature,
      capabilities,
      metadata,
      auth_type,
      enable_stream,
      reasoning_effort,
      include_max_completion_tokens,
      include_max_output_tokens,
      legacy_openai_format,
    })
    res.status(201).json({ success: true, data: config })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/llm-configs/:id — 更新
router.put('/llm-configs/:id', async (req, res) => {
  try {
    const config = await LlmConfigModel.update(req.params.id, req.body)
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' })
    }
    res.json({ success: true, data: config })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/llm-configs/:id/activate — 激活
router.post('/llm-configs/:id/activate', async (req, res) => {
  try {
    const existing = await LlmConfigModel.findById(req.params.id)
    if (!existing) {
      return res.status(404).json({ success: false, error: '配置不存在' })
    }

    const config = await LlmConfigModel.setActive(req.params.id, existing.role || 'trial')
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' })
    }

    const poolRefresh = scheduleGatewayHotSlotsRefreshAfterActivation(
      existing,
      req.user?.id || 'admin'
    )

    res.json({
      success: true,
      data: {
        ...config,
        poolRefresh,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/llm-configs/:id/health-check — 测试配置健康状态
router.post('/llm-configs/:id/health-check', async (req, res) => {
  try {
    const config = await LlmConfigModel.findById(req.params.id)
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' })
    }

    const response = await testLlmConfig(config, req.body?.message || 'Reply with exactly: HEALTHCHECK_OK')
    res.json({
      success: true,
      data: {
        id: config.id,
        provider_name: config.provider_name,
        model_id: config.model_id,
        response,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/admin/llm-configs/:id — 删除
router.delete('/llm-configs/:id', async (req, res) => {
  try {
    const config = await LlmConfigModel.delete(req.params.id)
    if (!config) {
      return res.status(404).json({ success: false, error: '配置不存在' })
    }
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
