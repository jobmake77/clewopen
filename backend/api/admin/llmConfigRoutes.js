import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/auth.js'
import LlmConfigModel from '../../models/LlmConfig.js'
import { testLlmConfig } from '../../services/llmService.js'

const router = Router()

// 所有路由均需管理员权限
router.use(authenticate, authorize('admin'))

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
    res.json({ success: true, data: config })
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
