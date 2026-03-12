import { query } from '../config/database.js'
import { logger } from '../config/logger.js'

/**
 * 获取当前激活的 LLM 配置
 */
export async function getActiveConfig() {
  const result = await query(
    'SELECT * FROM llm_configs WHERE is_active = true LIMIT 1'
  )
  return result.rows[0] || null
}

/**
 * 调用 LLM API
 * 根据 api_url 自动判断 provider：
 * - 含 anthropic.com → Anthropic Messages API 格式
 * - 其他 → OpenAI chat completions 格式
 */
export async function callLLM(systemPrompt, userMessage) {
  const config = await getActiveConfig()
  if (!config) {
    throw new Error('未配置 LLM 服务，请联系管理员在后台配置')
  }

  const isAnthropic = config.api_url.includes('anthropic.com')

  try {
    if (isAnthropic) {
      return await callAnthropic(config, systemPrompt, userMessage)
    } else {
      return await callOpenAICompatible(config, systemPrompt, userMessage)
    }
  } catch (error) {
    logger.error('LLM API call failed:', error)
    throw new Error('LLM 服务调用失败: ' + error.message)
  }
}

async function callAnthropic(config, systemPrompt, userMessage) {
  const response = await fetch(config.api_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': '2023-06-01',
    },
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
  const response = await fetch(config.api_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`,
    },
    body: JSON.stringify({
      model: config.model_id,
      max_tokens: config.max_tokens,
      temperature: parseFloat(config.temperature),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
