const POLICY_REVIEW_TIMEOUT_MS = Number.parseInt(
  String(process.env.AGENT_POLICY_REVIEW_TIMEOUT_MS || '15000'),
  10
)

function createTimeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  }
}

export async function runPolicyAgentReview(payload = {}) {
  const webhookUrl = String(process.env.AGENT_POLICY_REVIEW_WEBHOOK_URL || '').trim()
  if (!webhookUrl) {
    return {
      enabled: false,
      status: 'skipped',
      decision: 'pending',
      message: '未配置 AGENT_POLICY_REVIEW_WEBHOOK_URL，跳过平台 Agent 复核。',
    }
  }

  const { signal, cleanup } = createTimeoutSignal(POLICY_REVIEW_TIMEOUT_MS)
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        enabled: true,
        status: 'error',
        decision: 'pending',
        message: `平台 Agent 复核接口返回异常: HTTP ${response.status}`,
        raw: body,
      }
    }

    const decision = ['pass', 'reject', 'needs_fix', 'needs_review'].includes(String(body?.decision || ''))
      ? String(body.decision)
      : 'needs_review'

    return {
      enabled: true,
      status: 'completed',
      decision,
      confidence: typeof body?.confidence === 'number' ? body.confidence : null,
      issues: Array.isArray(body?.issues) ? body.issues : [],
      summary: body?.summary || null,
      raw: body,
    }
  } catch (error) {
    return {
      enabled: true,
      status: 'error',
      decision: 'pending',
      message: `平台 Agent 复核调用失败: ${error.message}`,
    }
  } finally {
    cleanup()
  }
}
