import LlmConfigModel from '../models/LlmConfig.js'
import { logger } from '../config/logger.js'

function hasEnvConfig() {
  return Boolean(
    process.env.AI_PROVIDER &&
    process.env.AI_API_KEY &&
    process.env.AI_BASE_URL &&
    process.env.AI_MODEL
  )
}

function normalizeProvider(provider, apiUrl) {
  if (provider) return provider.toLowerCase()
  if (apiUrl?.includes('api.kimi.com')) return 'kimi'
  if (apiUrl?.includes('anthropic.com')) return 'anthropic'
  return 'openai'
}

function buildEnvConfig() {
  if (!hasEnvConfig()) return null

  const provider = normalizeProvider(process.env.AI_PROVIDER, process.env.AI_BASE_URL)

  return {
    provider_name: provider,
    api_url: process.env.AI_BASE_URL.trim(),
    api_key: process.env.AI_API_KEY.trim(),
    model_id: process.env.AI_MODEL.trim(),
    role: process.env.AI_ROLE || 'trial',
    priority: Number.parseInt(process.env.AI_PRIORITY || '10', 10),
    is_enabled: true,
    max_tokens: Number.parseInt(process.env.AI_MAX_TOKENS || '2000', 10),
    temperature: Number.parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    capabilities: ['chat', 'trial'],
    metadata: {
      source: 'env-bootstrap',
    },
    auth_type: process.env.AI_AUTH_TYPE || (provider === 'anthropic' ? 'x-api-key' : 'bearer'),
    enable_stream: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_ENABLE_STREAM || '').toLowerCase()),
    reasoning_effort: process.env.AI_REASONING_EFFORT || null,
    include_max_completion_tokens: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_INCLUDE_MAX_COMPLETION_TOKENS || '').toLowerCase()),
    include_max_output_tokens: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_INCLUDE_MAX_OUTPUT_TOKENS || '').toLowerCase()),
    legacy_openai_format: process.env.AI_LEGACY_OPENAI_FORMAT === undefined
      ? true
      : ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_LEGACY_OPENAI_FORMAT).toLowerCase()),
  }
}

export async function bootstrapActiveLlmConfigFromEnv() {
  const envConfig = buildEnvConfig()
  if (!envConfig) {
    logger.info('AI env config not found, skipping llm config bootstrap')
    return null
  }

  const existingActive = await LlmConfigModel.findActive(envConfig.role)
  if (
    existingActive &&
    existingActive.provider_name === envConfig.provider_name &&
    existingActive.api_url === envConfig.api_url &&
    existingActive.model_id === envConfig.model_id &&
    existingActive.api_key === envConfig.api_key &&
    existingActive.role === envConfig.role &&
    Number(existingActive.priority) === envConfig.priority &&
    Boolean(existingActive.is_enabled) === envConfig.is_enabled &&
    Number(existingActive.max_tokens) === envConfig.max_tokens &&
    Number(existingActive.temperature) === envConfig.temperature &&
    String(existingActive.auth_type || '') === String(envConfig.auth_type || '') &&
    Boolean(existingActive.enable_stream) === envConfig.enable_stream &&
    String(existingActive.reasoning_effort || '') === String(envConfig.reasoning_effort || '') &&
    Boolean(existingActive.include_max_completion_tokens) === envConfig.include_max_completion_tokens &&
    Boolean(existingActive.include_max_output_tokens) === envConfig.include_max_output_tokens &&
    Boolean(existingActive.legacy_openai_format) === envConfig.legacy_openai_format
  ) {
    logger.info('Active llm config already matches AI env config')
    return existingActive
  }

  let config = await LlmConfigModel.findByFingerprint(envConfig)

  if (config) {
    config = await LlmConfigModel.update(config.id, {
      api_key: envConfig.api_key,
      role: envConfig.role,
      priority: envConfig.priority,
      is_enabled: envConfig.is_enabled,
      max_tokens: envConfig.max_tokens,
      temperature: envConfig.temperature,
      capabilities: envConfig.capabilities,
      metadata: envConfig.metadata,
      auth_type: envConfig.auth_type,
      enable_stream: envConfig.enable_stream,
      reasoning_effort: envConfig.reasoning_effort,
      include_max_completion_tokens: envConfig.include_max_completion_tokens,
      include_max_output_tokens: envConfig.include_max_output_tokens,
      legacy_openai_format: envConfig.legacy_openai_format,
    })
  } else {
    config = await LlmConfigModel.create(envConfig)
  }

  const activated = await LlmConfigModel.setActive(config.id, envConfig.role)
  logger.info(`Bootstrapped active llm config from env: ${activated.id}`)
  return activated
}

export function getEnvLlmConfig() {
  return buildEnvConfig()
}
