import fs from 'fs/promises'
import path from 'path'
import { callLLM } from '../../services/llmService.js'

function buildSystemPrompt(session, files, history) {
  const sections = [
    files.identity,
    files.rules,
    files.memory,
    files.tools ? `可用工具说明:\n${files.tools}` : null,
    `平台约束:
- 当前为 OpenCLEW 在线试用环境
- 优先回答用户问题，不要假装执行未实际执行的外部动作
- 如果需要外部系统访问，请明确说明这只是试用回答`,
  ].filter(Boolean)

  if (history.length > 0) {
    const summary = history
      .slice(-6)
      .map((msg) => `${msg.role === 'assistant' ? '助手' : '用户'}: ${msg.content}`)
      .join('\n')
    sections.push(`最近会话上下文:\n${summary}`)
  }

  return sections.join('\n\n---\n\n') || `你是 ${session.agent_name}。${session.agent_description || ''}`
}

export async function runPromptSession(session, files, history, userMessage) {
  const systemPrompt = buildSystemPrompt(session, files, history)
  const response = await callLLM(systemPrompt, userMessage.trim())

  if (session.workspace_path) {
    const stateFile = path.join(session.workspace_path, 'state', 'conversation.json')
    const payload = {
      messages: [
        ...history.map((msg) => ({ role: msg.role, content: msg.content, created_at: msg.created_at })),
        { role: 'user', content: userMessage.trim() },
        { role: 'assistant', content: response },
      ],
    }
    await fs.writeFile(stateFile, JSON.stringify(payload, null, 2), 'utf8')
  }

  return {
    response,
    usage: {
      prompt_tokens: null,
      completion_tokens: null,
    },
  }
}
