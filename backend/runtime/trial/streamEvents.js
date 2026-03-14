const IGNORED_LINE_PATTERNS = [
  /^Registered plugin command:/,
  /^\[diagnostic\] lane (enqueue|dequeue|task done):/,
  /^\[diagnostic\] run (registered|cleared):/,
  /^\[diagnostic\] session state:/,
]

const STATUS_LINE_RULES = [
  {
    pattern: /\[agent\/embedded\] embedded run start:/,
    stage: 'runtime-start',
    message: 'Agent 运行时已启动',
  },
  {
    pattern: /\[agent\/embedded\] embedded run prompt start:/,
    stage: 'prompt-build',
    message: '正在整理 Agent 上下文',
  },
  {
    pattern: /\[agent\/embedded\] \[context-diag\] pre-prompt:/,
    stage: 'context-ready',
    message: '上下文已装载，准备调用模型',
  },
  {
    pattern: /\[agent\/embedded\] embedded run agent start:/,
    stage: 'model-call',
    message: '正在调用模型生成回复',
  },
  {
    pattern: /\[agent\/embedded\] embedded run agent end:/,
    stage: 'model-returned',
    message: '模型已返回，正在整理答案',
  },
  {
    pattern: /\[agent\/embedded\] embedded run prompt end:/,
    stage: 'response-build',
    message: '正在生成最终回复',
  },
  {
    pattern: /\[agent\/embedded\] embedded run done:/,
    stage: 'completed',
    message: '回复已生成，正在返回页面',
  },
]

const GATEWAY_STATUS_RULES = {
  'response.created': {
    stage: 'gateway-connected',
    message: '已建立流式响应通道',
  },
  'response.in_progress': {
    stage: 'model-call',
    message: '模型开始连续生成回复',
  },
  'response.output_text.done': {
    stage: 'response-build',
    message: '模型输出完成，正在整理最终回复',
  },
  'response.completed': {
    stage: 'completed',
    message: '回复已生成，正在返回页面',
  },
  'response.failed': {
    stage: 'failed',
    message: '流式响应失败',
  },
}

export function classifyOpenClawOutputLine(line) {
  const normalizedLine = String(line || '').trim()
  if (!normalizedLine) return null

  if (
    normalizedLine === '[DONE]' ||
    /^(event|data|id|retry):/i.test(normalizedLine)
  ) {
    return null
  }

  if (IGNORED_LINE_PATTERNS.some((pattern) => pattern.test(normalizedLine))) {
    return null
  }

  const matchedRule = STATUS_LINE_RULES.find((rule) => rule.pattern.test(normalizedLine))
  if (matchedRule) {
    return {
      type: 'status',
      stage: matchedRule.stage,
      message: matchedRule.message,
      detail: normalizedLine,
    }
  }

  return {
    type: 'trace',
    message: normalizedLine,
  }
}

export function mapOpenClawGatewayEvent(payload, eventName = '') {
  const eventType = String(payload?.type || eventName || '').trim()
  if (!eventType) return null

  if (eventType === 'response.output_text.delta') {
    const delta = typeof payload?.delta === 'string' ? payload.delta : ''
    if (!delta) return null

    return {
      type: 'delta',
      stage: 'streaming',
      delta,
    }
  }

  const matchedRule = GATEWAY_STATUS_RULES[eventType]
  if (matchedRule) {
    return {
      type: 'status',
      stage: matchedRule.stage,
      message: matchedRule.message,
      detail: eventType,
    }
  }

  return null
}

export function flushOpenClawGatewaySseBuffer(state, chunk, onEvent) {
  state.buffer = `${state.buffer || ''}${chunk || ''}`
  const blocks = state.buffer.split(/\r?\n\r?\n/)
  state.buffer = blocks.pop() || ''

  for (const block of blocks) {
    if (!block.trim() || block.startsWith(':')) continue

    let eventName = 'message'
    const dataLines = []

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) continue

    const rawPayload = dataLines.join('\n')
    if (rawPayload === '[DONE]') {
      state.seenEvent = true
      continue
    }

    let payload = null
    try {
      payload = JSON.parse(rawPayload)
    } catch {
      continue
    }

    const mappedEvent = mapOpenClawGatewayEvent(payload, eventName)
    if (!mappedEvent) continue

    state.seenEvent = true
    onEvent?.(mappedEvent)
  }

  return state
}
