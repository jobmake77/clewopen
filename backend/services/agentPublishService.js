import AgentModel from '../models/Agent.js'
import AgentPublishJobModel from '../models/AgentPublishJob.js'
import { logger } from '../config/logger.js'

const PUBLISH_POLL_INTERVAL_MS = Math.max(
  2000,
  Number.parseInt(process.env.AGENT_PUBLISH_POLL_INTERVAL_MS || '3000', 10)
)

let publishTimer = null
let publishLoopRunning = false

function resolveGithubToken() {
  return String(process.env.GITHUB_PUBLISH_TOKEN || process.env.GITHUB_TOKEN || '').trim()
}

function resolveGithubOwner() {
  return String(process.env.GITHUB_PUBLISH_OWNER || '').trim()
}

function buildGithubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'clewopen-agent-publisher',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function buildRepoName(agent) {
  return String(agent?.slug || agent?.name || 'agent')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

async function createGithubRepository(agent, owner) {
  const token = resolveGithubToken()
  if (!token) {
    throw new Error('GITHUB_PUBLISH_TOKEN 未配置，无法自动创建 GitHub 仓库')
  }

  const repoName = buildRepoName(agent)
  const payload = {
    name: repoName,
    description: agent.description || `Auto-published agent ${agent.name}`,
    private: true,
    auto_init: true,
    has_issues: true,
    has_wiki: false,
  }

  const resolvedOwner = owner || resolveGithubOwner()
  const url = resolvedOwner
    ? `https://api.github.com/orgs/${encodeURIComponent(resolvedOwner)}/repos`
    : 'https://api.github.com/user/repos'

  const response = await fetch(url, {
    method: 'POST',
    headers: buildGithubHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub create repo failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  return {
    name: data.name,
    full_name: data.full_name,
    html_url: data.html_url,
    private: Boolean(data.private),
  }
}

async function processPublishJob(job) {
  const payload = job.payload || {}
  const agent = await AgentModel.findById(job.agent_id)
  if (!agent || agent.deleted_at) {
    throw new Error('发布失败：Agent 不存在或已删除')
  }

  if (agent.status !== 'approved' || !['approved', 'published'].includes(agent.review_stage)) {
    throw new Error('发布失败：Agent 未通过审核')
  }

  const publishMode = ['open', 'commercial'].includes(String(payload.publish_mode || '').toLowerCase())
    ? String(payload.publish_mode).toLowerCase()
    : (agent.publish_mode || 'open')

  let repositoryUrl = payload.repository_url || agent.repository_url || null
  let githubRepo = null

  if (Boolean(payload.github_auto_create) && !repositoryUrl) {
    githubRepo = await createGithubRepository(agent, payload.github_owner || null)
    repositoryUrl = githubRepo.html_url
  }

  const packageRegistry = payload.package_registry || agent.package_registry || 'none'
  const packageName = payload.package_name || agent.package_name || null
  const installHint = payload.install_hint || agent.install_hint || null

  const publishedAgent = await AgentModel.markPublished(agent.id, {
    publish_mode: publishMode,
    package_registry: packageRegistry,
    package_name: packageName,
    repository_url: repositoryUrl,
    install_hint: installHint,
  })

  return {
    agentId: publishedAgent.id,
    publishMode,
    packageRegistry,
    packageName,
    repositoryUrl,
    githubRepo,
    publishedAt: publishedAgent.last_published_at,
  }
}

async function runPublishLoopOnce() {
  if (publishLoopRunning) return
  publishLoopRunning = true

  try {
    while (true) {
      const nextJob = await AgentPublishJobModel.claimNextQueued()
      if (!nextJob) break

      try {
        const result = await processPublishJob(nextJob)
        await AgentPublishJobModel.markSucceeded(nextJob.id, result)
        logger.info(`Agent publish job succeeded: ${nextJob.id} -> ${nextJob.agent_id}`)
      } catch (error) {
        await AgentModel.update(nextJob.agent_id, {
          publish_status: 'failed',
        }).catch(() => null)
        await AgentPublishJobModel.markFailed(nextJob.id, error.message, {
          agentId: nextJob.agent_id,
        })
        logger.warn(`Agent publish job failed: ${nextJob.id} -> ${error.message}`)
      }
    }
  } finally {
    publishLoopRunning = false
  }
}

export async function enqueueAgentPublishJob({ agentId, requestedBy, payload }) {
  const job = await AgentPublishJobModel.create({
    agentId,
    requestedBy,
    payload,
  })

  await AgentModel.update(agentId, {
    publish_status: 'queued',
  })

  runPublishLoopOnce().catch((error) => {
    logger.warn(`Failed to trigger publish loop after enqueue: ${error.message}`)
  })

  return job
}

export async function listAgentPublishJobs(agentId, limit = 10) {
  return AgentPublishJobModel.findLatestByAgentId(agentId, limit)
}

export function startAgentPublishWorker() {
  if (publishTimer) return

  publishTimer = setInterval(() => {
    runPublishLoopOnce().catch((error) => {
      logger.warn(`Agent publish worker run failed: ${error.message}`)
    })
  }, PUBLISH_POLL_INTERVAL_MS)

  runPublishLoopOnce().catch((error) => {
    logger.warn(`Initial agent publish worker run failed: ${error.message}`)
  })
}

export function stopAgentPublishWorker() {
  if (!publishTimer) return
  clearInterval(publishTimer)
  publishTimer = null
}
