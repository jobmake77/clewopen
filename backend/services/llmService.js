import { logger } from '../config/logger.js'
import { getEnvLlmConfig } from './llmConfigBootstrapService.js'
import LlmConfigModel from '../models/LlmConfig.js'

const DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10)

function parseBooleanValue(value, defaultValue = false) {
  if (value === undefined) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function inferProvider(config) {
  if (config.api_url?.includes('api.kimi.com') || config.model_id?.startsWith('kimi')) {
    return 'kimi'
  }
  if (config.api_url?.includes('anthropic.com')) {
    return 'anthropic'
  }
  if (config.provider_name) {
    return String(config.provider_name).toLowerCase()
  }
  return 'openai'
}

function inferVisionByModel(modelId = '') {
  const model = String(modelId || '').toLowerCase()
  if (!model) return false
  return (
    model.includes('gpt-4o') ||
    model.includes('gpt-4.1') ||
    model.includes('claude-3') ||
    model.includes('claude-4') ||
    model.includes('gemini') ||
    model.includes('vision')
  )
}

function isKimiCompatible(config) {
  return inferProvider(config) === 'kimi'
}

function joinUrl(base, suffix) {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`
}

function resolveApiUrl(config) {
  const provider = inferProvider(config)
  const apiUrl = config.api_url

  if (!apiUrl) return apiUrl
  if (apiUrl.includes('/chat/completions') || apiUrl.includes('/messages')) {
    return apiUrl
  }

  if (provider === 'anthropic') {
    return joinUrl(apiUrl, 'messages')
  }

  return joinUrl(apiUrl, 'chat/completions')
}

function getAuthHeader(config) {
  const authType = String(
    config.auth_type ||
    process.env.AI_AUTH_TYPE ||
    (inferProvider(config) === 'anthropic' ? 'x-api-key' : 'bearer')
  ).toLowerCase()

  const rawApiKey = String(config.api_key || '').trim()
  const customHeaderName = process.env.AI_AUTH_HEADER
  const customPrefix = process.env.AI_AUTH_PREFIX

  if (authType === 'none') {
    return null
  }

  if (authType === 'x-api-key') {
    return {
      name: customHeaderName || 'x-api-key',
      value: rawApiKey,
    }
  }

  if (authType === 'custom') {
    return {
      name: customHeaderName || 'Authorization',
      value: customPrefix ? `${customPrefix} ${rawApiKey}` : rawApiKey,
    }
  }

  if (/^bearer\s+/i.test(rawApiKey)) {
    return {
      name: customHeaderName || 'Authorization',
      value: rawApiKey,
    }
  }

  return {
    name: customHeaderName || 'Authorization',
    value: `${customPrefix || 'Bearer'} ${rawApiKey}`,
  }
}

function getOpenAICompatRuntimeOptions(config) {
  const kimiDefaults = isKimiCompatible(config)

  return {
    stream: parseBooleanValue(config.enable_stream ?? process.env.AI_ENABLE_STREAM, kimiDefaults),
    includeMaxCompletionTokens: parseBooleanValue(
      config.include_max_completion_tokens ?? process.env.AI_INCLUDE_MAX_COMPLETION_TOKENS,
      kimiDefaults
    ),
    includeMaxOutputTokens: parseBooleanValue(
      config.include_max_output_tokens ?? process.env.AI_INCLUDE_MAX_OUTPUT_TOKENS,
      false
    ),
    legacyOpenAIFormat: parseBooleanValue(
      config.legacy_openai_format ?? process.env.AI_LEGACY_OPENAI_FORMAT,
      kimiDefaults
    ),
    reasoningEffort: config.reasoning_effort || process.env.AI_REASONING_EFFORT || (kimiDefaults ? 'medium' : ''),
  }
}

function buildOpenAICompatiblePayload(config, systemPrompt, userMessage) {
  const attachments = Array.isArray(config.__attachments) ? config.__attachments : []
  const runtimeOptions = getOpenAICompatRuntimeOptions(config)
  const contentBlocks = []
  if (userMessage) {
    contentBlocks.push({ type: 'text', text: userMessage })
  }
  for (const item of attachments) {
    if (String(item?.kind || '').toLowerCase() !== 'image') continue
    const dataUrl = String(item?.dataUrl || '').trim()
    if (!dataUrl) continue
    contentBlocks.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    })
  }

  const payload = {
    model: config.model_id,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: contentBlocks.length > 0 ? contentBlocks : userMessage,
      },
    ],
    stream: runtimeOptions.stream,
  }

  const maxTokens = Number.parseInt(config.max_tokens, 10)
  const temperature = Number.parseFloat(config.temperature)

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens
    if (runtimeOptions.includeMaxCompletionTokens) {
      payload.max_completion_tokens = maxTokens
    }
    if (runtimeOptions.includeMaxOutputTokens) {
      payload.max_output_tokens = maxTokens
    }
  }

  if (Number.isFinite(temperature)) {
    payload.temperature = temperature
  }

  if (runtimeOptions.reasoningEffort) {
    payload.reasoning_effort = runtimeOptions.reasoningEffort
  }

  return payload
}

async function parseSseChatCompletionsResponse(response) {
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() || ''

    for (const rawLine of parts) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue

      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const choice = json.choices?.[0]
        output += choice?.delta?.content || choice?.delta?.reasoning_content || ''
      } catch {
        // Ignore malformed SSE frames and continue aggregating.
      }
    }

    if (done) break
  }

  if (buffer.trim().startsWith('data:')) {
    const data = buffer.trim().slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data)
        output += json.choices?.[0]?.delta?.content || json.choices?.[0]?.delta?.reasoning_content || ''
      } catch {
        // Ignore malformed tail frame.
      }
    }
  }

  return output.trim()
}

/**
 * 获取当前激活的 LLM 配置
 */
export async function getActiveConfig() {
  return LlmConfigModel.findActive('trial')
}

export async function getTrialInputCapabilities() {
  const config = await getActiveConfig()
  if (!config) {
    return {
      imageInputEnabled: false,
      audioInputEnabled: false,
      videoInputEnabled: false,
      reason: '未检测到可用的试用模型配置',
      provider: null,
      model: null,
      source: 'missing-active-config',
    }
  }

  const capabilities = Array.isArray(config.capabilities) ? config.capabilities.map((item) => String(item).toLowerCase()) : []
  const hasVisionCapabilityFlag = capabilities.includes('vision') || capabilities.includes('image') || capabilities.includes('multimodal')
  const modelLooksVisionReady = inferVisionByModel(config.model_id)
  const imageInputEnabled = hasVisionCapabilityFlag || modelLooksVisionReady

  return {
    imageInputEnabled,
    audioInputEnabled: false,
    videoInputEnabled: false,
    reason: imageInputEnabled
      ? '当前模型已启用图片输入能力'
      : '当前模型未声明视觉能力，图片输入可能无法被模型理解',
    provider: config.provider_name || inferProvider(config),
    model: config.model_id,
    source: hasVisionCapabilityFlag ? 'llm-capabilities-field' : modelLooksVisionReady ? 'model-heuristic' : 'no-vision-detected',
  }
}

export async function getRoutingCandidates(role = 'trial') {
  const configs = await LlmConfigModel.findRoutingCandidates(role)
  if (configs.length > 0) return configs

  const envConfig = getEnvLlmConfig()
  if (envConfig && envConfig.role === role) {
    return [envConfig]
  }

  return []
}

/**
 * 调用 LLM API
 * 根据 api_url 自动判断 provider：
 * - 含 anthropic.com → Anthropic Messages API 格式
 * - 其他 → OpenAI chat completions 格式
 */
export async function callLLM(systemPrompt, userMessage, options = {}) {
  const role = options.role || 'trial'
  const candidates = options.config
    ? [options.config]
    : await getRoutingCandidates(role)

  if (candidates.length === 0) {
    throw new Error('未配置 LLM 服务，请联系管理员在后台配置')
  }

  const errors = []

  for (const candidate of candidates) {
    const isAnthropic = inferProvider(candidate) === 'anthropic'
    const resolvedConfig = {
      ...candidate,
      api_url: resolveApiUrl(candidate),
      __attachments: Array.isArray(options.attachments) ? options.attachments : [],
    }

    try {
      const result = isAnthropic
        ? await callAnthropic(resolvedConfig, systemPrompt, userMessage)
        : await callOpenAICompatible(resolvedConfig, systemPrompt, userMessage)

      if (candidate.id) {
        await LlmConfigModel.updateHealth(candidate.id, 'healthy', null)
      }

      return result
    } catch (error) {
      const providerLabel = `${candidate.provider_name}:${candidate.model_id}`
      errors.push(`${providerLabel} -> ${error.message}`)
      logger.error(`LLM API call failed for ${providerLabel}:`, error)

      if (candidate.id) {
        await LlmConfigModel.updateHealth(candidate.id, 'unhealthy', error.message)
      }
    }
  }

  throw new Error(`所有 LLM Provider 均调用失败: ${errors.join(' | ')}`)
}

export async function testLlmConfig(config, sampleMessage = 'Reply with exactly: HEALTHCHECK_OK') {
  const systemPrompt = 'You are a health-check assistant.'
  return callLLM(systemPrompt, sampleMessage, { config })
}

async function postJsonWithTimeout(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`LLM 请求超时（>${DEFAULT_REQUEST_TIMEOUT_MS}ms）`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function callAnthropic(config, systemPrompt, userMessage) {
  const authHeader = getAuthHeader(config)
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  if (authHeader) {
    headers[authHeader.name] = authHeader.value
  }

  const response = await postJsonWithTimeout(config.api_url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model_id,
      max_tokens: config.max_tokens,
      temperature: parseFloat(config.temperature),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

async function callOpenAICompatible(config, systemPrompt, userMessage) {
  const authHeader = getAuthHeader(config)
  const headers = {
    'Content-Type': 'application/json',
  }

  if (authHeader) {
    headers[authHeader.name] = authHeader.value
  }

  const payload = buildOpenAICompatiblePayload(config, systemPrompt, userMessage)
  const response = await postJsonWithTimeout(config.api_url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${body}`)
  }

  const responseType = response.headers.get('content-type') || ''
  if (payload.stream && responseType.includes('text/event-stream')) {
    return await parseSseChatCompletionsResponse(response)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
