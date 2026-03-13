import LlmConfigModel from '../../models/LlmConfig.js'
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

export async function resolveTrialSandboxLlmConfig(session = null) {
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
      return config
    }
  }

  const activeConfig = await LlmConfigModel.findActive('trial')
  if (activeConfig && activeConfig.is_enabled !== false) {
    return activeConfig
  }

  return getEnvLlmConfig()
}

export function buildTrialSandboxLlmEnv(config) {
  if (!config) {
    throw new Error('No active trial LLM config is available for the OpenClaw sandbox')
  }

  const compatibility = inferCompatibility(config)
  const authType = resolveSupportedAuthType(config, compatibility)
  const apiUrl = stripKnownEndpointSuffix(config.api_url, compatibility)
  const modelId = normalizeText(config.model_id)
  const providerName = normalizeLowerText(config.provider_name) || compatibility
  let apiKey = normalizeText(config.api_key)

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

  const usageDefaults = buildUsageDefaults(config)

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
  if (!config) return null

  const compatibility = inferCompatibility(config)
  const authType = resolveSupportedAuthType(config, compatibility)
  const apiUrl = stripKnownEndpointSuffix(config.api_url, compatibility)

  return {
    llm_config_id: config.id || null,
    provider_name: normalizeLowerText(config.provider_name) || compatibility,
    compatibility,
    auth_type: authType,
    api_url: apiUrl,
    model_id: normalizeText(config.model_id),
  }
}
