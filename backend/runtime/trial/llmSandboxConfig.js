import LlmConfigModel from '../../models/LlmConfig.js'
import UserLlmConfigModel from '../../models/UserLlmConfig.js'
import TrialSessionMessageModel from '../../models/TrialSessionMessage.js'
import { getEnvLlmConfig } from '../../services/llmConfigBootstrapService.js'

const TRIAL_PROVIDER_ID = 'trial-provider'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase()
}

function inferCompatibility(config) {
  const provider = normalizeLowerText(config?.provider_name)
  const apiUrl = normalizeLowerText(config?.api_url)

  if (
    provider === 'anthropic' ||
    apiUrl.includes('/messages') ||
    apiUrl.includes('anthropic.com')
  ) {
    return 'anthropic'
  }

  return 'openai'
}

function stripKnownEndpointSuffix(apiUrl, compatibility) {
  const normalized = normalizeText(apiUrl).replace(/\/+$/, '')
  if (!normalized) return ''

  if (compatibility === 'anthropic') {
    return normalized.replace(/\/messages$/i, '')
  }

  return normalized.replace(/\/chat\/completions$/i, '')
}

function sanitizeBearerToken(apiKey) {
  return normalizeText(apiKey).replace(/^Bearer\s+/i, '').trim()
}

function resolveSupportedAuthType(config, compatibility) {
  const authType = normalizeLowerText(config?.auth_type) || (
    compatibility === 'anthropic' ? 'x-api-key' : 'bearer'
  )
  const customHeader = normalizeLowerText(process.env.AI_AUTH_HEADER)
  const customPrefix = normalizeLowerText(process.env.AI_AUTH_PREFIX)

  if (authType === 'none') {
    return 'none'
  }

  if (compatibility === 'anthropic') {
    if (authType === 'x-api-key') {
      return 'x-api-key'
    }

    if (authType === 'custom' && customHeader === 'x-api-key') {
      return 'x-api-key'
    }

    throw new Error(
      'Anthropic-compatible OpenClaw trial sandbox currently only supports x-api-key auth'
    )
  }

  if (authType === 'bearer') {
    return 'bearer'
  }

  if (
    authType === 'custom' &&
    (!customHeader || customHeader === 'authorization') &&
    (!customPrefix || customPrefix === 'bearer')
  ) {
    return 'bearer'
  }

  throw new Error(
    'OpenAI-compatible OpenClaw trial sandbox currently only supports Bearer auth'
  )
}

function buildUsageDefaults(config) {
  const maxTokens = Number.parseInt(config?.max_tokens, 10)
  const temperature = Number.parseFloat(config?.temperature)

  return {
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
    temperature: Number.isFinite(temperature) ? temperature : 0.7,
  }
}

function parseOptionalInt(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalFloat(value) {
  const parsed = Number.parseFloat(String(value || '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildError(message, statusCode = 400, code = 'trial_llm_config_invalid') {
  const err = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}

function normalizeRuntimeOverride(rawOverride) {
  if (!rawOverride || typeof rawOverride !== 'object') return null

  const providerName = normalizeLowerText(
    rawOverride.provider_name || rawOverride.provider || rawOverride.providerName
  )
  const apiUrl = normalizeText(rawOverride.api_url || rawOverride.base_url || rawOverride.apiUrl)
  const apiKey = normalizeText(rawOverride.api_key || rawOverride.apiKey)
  const modelId = normalizeText(rawOverride.model_id || rawOverride.model || rawOverride.modelId)
  const authType = normalizeLowerText(rawOverride.auth_type || rawOverride.authType || 'bearer')

  if (!providerName && !apiUrl && !apiKey && !modelId) {
    return null
  }

  if (!apiUrl || !apiKey || !modelId) {
    throw buildError('会话临时模型配置不完整，请填写 Base URL、API Key 和模型名', 400, 'trial_runtime_override_incomplete')
  }

  return {
    provider_name: providerName || inferCompatibility({ api_url: apiUrl }),
    api_url: apiUrl,
    api_key: apiKey,
    model_id: modelId,
    auth_type: authType || 'bearer',
    max_tokens: parseOptionalInt(rawOverride.max_tokens || rawOverride.maxTokens) ?? 4096,
    temperature: parseOptionalFloat(rawOverride.temperature) ?? 0.7,
    capabilities: ['chat', 'trial'],
    is_enabled: true,
  }
}

async function resolveUserLlmConfig(userId, options = {}) {
  if (!userId) return null

  const requestedId = normalizeText(
    options.userLlmConfigId || options.user_llm_config_id || options.userConfigId
  )

  if (requestedId) {
    const target = await UserLlmConfigModel.findUserConfigById(userId, requestedId)
    if (!target) {
      throw buildError('指定的个人模型配置不存在或无权限访问', 404, 'trial_user_llm_config_not_found')
    }
    return target
  }

  return UserLlmConfigModel.findUserDefault(userId)
}

async function assertPlatformTempKeyPolicy(session, config) {
  const modelWhitelist = parseList(process.env.TRIAL_PLATFORM_MODEL_WHITELIST)
  if (modelWhitelist.length > 0) {
    const normalizedModel = normalizeText(config?.model_id)
    const allowed = modelWhitelist.some((item) => item.toLowerCase() === normalizedModel.toLowerCase())
    if (!allowed) {
      throw buildError('当前试用模型不在平台临时 Key 白名单内，请改用个人 Key', 403, 'trial_platform_model_not_allowed')
    }
  }

  const parsedMaxDailyRequests = Number.parseInt(
    process.env.TRIAL_PLATFORM_KEY_DAILY_REQUEST_LIMIT || '60',
    10
  )
  const maxDailyRequests = Number.isFinite(parsedMaxDailyRequests) ? parsedMaxDailyRequests : 60

  if (!session?.user_id || maxDailyRequests <= 0) return

  const used = await TrialSessionMessageModel.countDailyByUserAndKeySource(
    session.user_id,
    'platform_temp'
  )
  if (used >= maxDailyRequests) {
    throw buildError(
      `平台临时 Key 今日调用次数已达上限（${maxDailyRequests}），请在个人中心配置自己的模型 Key`,
      429,
      'trial_platform_quota_exceeded'
    )
  }
}

function applyTrialSandboxOverrides(config) {
  if (!config) return config

  const modelOverride = normalizeText(process.env.TRIAL_LLM_MODEL_OVERRIDE)
  const apiUrlOverride = normalizeText(process.env.TRIAL_LLM_API_URL_OVERRIDE)
  const apiKeyOverride = normalizeText(process.env.TRIAL_LLM_API_KEY_OVERRIDE)
  const providerOverride = normalizeLowerText(process.env.TRIAL_LLM_PROVIDER_OVERRIDE)
  const authTypeOverride = normalizeLowerText(process.env.TRIAL_LLM_AUTH_TYPE_OVERRIDE)
  const maxTokensOverride = parseOptionalInt(process.env.TRIAL_LLM_MAX_TOKENS_OVERRIDE)
  const temperatureOverride = parseOptionalFloat(process.env.TRIAL_LLM_TEMPERATURE_OVERRIDE)

  return {
    ...config,
    provider_name: providerOverride || config.provider_name,
    api_url: apiUrlOverride || config.api_url,
    api_key: apiKeyOverride || config.api_key,
    model_id: modelOverride || config.model_id,
    auth_type: authTypeOverride || config.auth_type,
    max_tokens: maxTokensOverride ?? config.max_tokens,
    temperature: temperatureOverride ?? config.temperature,
  }
}

export async function resolveTrialSandboxLlmConfig(session = null, options = {}) {
  const runtimeOverride = normalizeRuntimeOverride(options.runtimeOverride)
  if (runtimeOverride) {
    return {
      ...runtimeOverride,
      __source: 'session_temp',
      __source_id: null,
    }
  }

  const userConfig = await resolveUserLlmConfig(session?.user_id || options.userId, options)
  if (userConfig && userConfig.is_enabled !== false) {
    return {
      ...userConfig,
      __source: 'user_config',
      __source_id: userConfig.id,
    }
  }

  const metadata = session?.metadata && typeof session.metadata === 'object'
    ? session.metadata
    : {}

  const llmConfigId =
    metadata?.sandbox?.llm_config_id ||
    metadata?.trial_runtime?.llm_config_id ||
    metadata?.llm_config_id ||
    null

  if (llmConfigId) {
    const config = await LlmConfigModel.findById(llmConfigId)
    if (config && config.is_enabled !== false) {
      await assertPlatformTempKeyPolicy(session, config)
      return {
        ...config,
        __source: 'platform_temp',
        __source_id: config.id || null,
      }
    }
  }

  const activeConfig = await LlmConfigModel.findActive('trial')
  if (activeConfig && activeConfig.is_enabled !== false) {
    const withOverrides = applyTrialSandboxOverrides(activeConfig)
    await assertPlatformTempKeyPolicy(session, withOverrides)
    return {
      ...withOverrides,
      __source: 'platform_temp',
      __source_id: activeConfig.id || null,
    }
  }

  const envConfig = applyTrialSandboxOverrides(getEnvLlmConfig())
  await assertPlatformTempKeyPolicy(session, envConfig)
  return {
    ...envConfig,
    __source: 'platform_temp',
    __source_id: null,
  }
}

export function buildTrialSandboxLlmEnv(config) {
  const resolvedConfig = applyTrialSandboxOverrides(config)

  if (!resolvedConfig) {
    throw new Error('No active trial LLM config is available for the OpenClaw sandbox')
  }

  const compatibility = inferCompatibility(resolvedConfig)
  const authType = resolveSupportedAuthType(resolvedConfig, compatibility)
  const apiUrl = stripKnownEndpointSuffix(resolvedConfig.api_url, compatibility)
  const modelId = normalizeText(resolvedConfig.model_id)
  const providerName = normalizeLowerText(resolvedConfig.provider_name) || compatibility
  let apiKey = normalizeText(resolvedConfig.api_key)

  if (!apiUrl) {
    throw new Error('Trial LLM config is missing a usable API URL')
  }

  if (!modelId) {
    throw new Error('Trial LLM config is missing a model id')
  }

  if (authType === 'bearer') {
    apiKey = sanitizeBearerToken(apiKey)
  }

  if (authType !== 'none' && !apiKey) {
    throw new Error('Trial LLM config is missing an API key required by the sandbox')
  }

  const usageDefaults = buildUsageDefaults(resolvedConfig)

  return {
    TRIAL_LLM_PROVIDER_ID: TRIAL_PROVIDER_ID,
    TRIAL_LLM_PROVIDER_NAME: providerName,
    TRIAL_LLM_COMPATIBILITY: compatibility,
    TRIAL_LLM_AUTH_TYPE: authType,
    TRIAL_LLM_API_URL: apiUrl,
    TRIAL_LLM_API_KEY: apiKey,
    TRIAL_LLM_MODEL_ID: modelId,
    TRIAL_LLM_MAX_TOKENS: String(usageDefaults.maxTokens),
    TRIAL_LLM_TEMPERATURE: String(usageDefaults.temperature),
  }
}

export function buildTrialSandboxLlmMetadata(config) {
  const resolvedConfig = applyTrialSandboxOverrides(config)
  if (!resolvedConfig) return null

  const compatibility = inferCompatibility(resolvedConfig)
  const authType = resolveSupportedAuthType(resolvedConfig, compatibility)
  const apiUrl = stripKnownEndpointSuffix(resolvedConfig.api_url, compatibility)

  return {
    llm_config_id: resolvedConfig.id || null,
    source: resolvedConfig.__source || 'platform_temp',
    source_id: resolvedConfig.__source_id || null,
    provider_name: normalizeLowerText(resolvedConfig.provider_name) || compatibility,
    compatibility,
    auth_type: authType,
    api_url: apiUrl,
    model_id: normalizeText(resolvedConfig.model_id),
  }
}
