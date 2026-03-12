/**
 * 数据同步服务
 *
 * 从 GitHub Search API 同步 Skill/MCP 数据到本地数据库
 * 参考 agent-skills-hub 项目的搜索策略
 */

import { query } from '../config/database.js'
import { logger } from '../config/logger.js'

// ─── State ───────────────────────────────────────────────

let isSyncing = false
let lastSyncTime = null
let nextSyncTime = null
let syncTimer = null
const syncHistory = [] // 最近 20 条
const SYNC_INTERVAL = 24 * 60 * 60 * 1000 // 24h
const MAX_HISTORY = 20

// Openclaw pagination state — persists across syncs to cover all users incrementally
let openclawUserOffset = 0
let openclawUserList = null // cached full user directory list
const OPENCLAW_BATCH_SIZE = 50
const OPENCLAW_REPO_STARS = 2683

// ─── GitHub Search Queries ───────────────────────────────

const MCP_QUERIES = [
  'mcp-server in:name,topics',
  'claude-mcp in:name,description,topics',
  'model-context-protocol in:name,description,topics',
  'mcp in:topics language:python',
  'mcp in:topics language:typescript',
  'mcp-tool in:name,topics',
]

const SKILL_QUERIES = [
  'claude-skill in:name,description,topics',
  'claude-code in:topics',
  'agent-skill in:name,topics',
  'ai-agent-tool in:name,description,topics',
  'agent-tools in:name,description,topics',
  'llm-tool in:name,description,topics',
  'codex-skills in:name,description,topics',
  'openai-tool in:name,topics',
]

// ─── Helpers ─────────────────────────────────────────────

function generateSlug(fullName) {
  return fullName
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function classifyRepo(repo) {
  const searchable = [
    repo.full_name,
    repo.description || '',
    ...(repo.topics || []),
  ].join(' ').toLowerCase()

  const categories = {
    'mcp-server': ['mcp', 'model-context-protocol', 'claude-mcp', 'mcp-server'],
    'claude-skill': ['claude-skill', 'claude-tool', 'claude skill', 'claude-code'],
    'codex-skill': ['codex', 'codex-skill'],
    'agent-tool': ['agent-tool', 'ai-agent', 'agent-skill', 'agent skill'],
    'llm-plugin': ['llm-tool', 'llm-plugin'],
    'ai-skill': ['ai-skill', 'ai skill', 'cursor-skill'],
  }

  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => searchable.includes(kw))) return cat
  }
  return 'uncategorized'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ensureUser(login, avatarUrl) {
  const existing = await query(
    `SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL`,
    [login]
  )
  if (existing.rows.length > 0) return existing.rows[0].id

  const bcrypt = await import('bcryptjs')
  const hash = await bcrypt.default.hash('github_user_' + Date.now(), 10)
  const result = await query(
    `INSERT INTO users (username, email, password_hash, role, bio, avatar_url)
     VALUES ($1, $2, $3, 'developer', $4, $5)
     ON CONFLICT (username) DO UPDATE SET avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
     RETURNING id`,
    [login, `${login}@github.placeholder`, hash, `GitHub user ${login}`, avatarUrl]
  )
  return result.rows[0].id
}

// ─── GitHub Fetch ────────────────────────────────────────

async function fetchGitHubRepos(queries) {
  const seen = new Map() // full_name -> repo

  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=100&page=1&sort=stars`
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'clew-marketplace',
        },
      })

      // Check rate limit
      const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') || '60')
      const resetTime = parseInt(res.headers.get('X-RateLimit-Reset') || '0')

      if (res.status === 403 || remaining === 0) {
        const waitMs = Math.max(0, resetTime * 1000 - Date.now()) + 1000
        logger.warn(`GitHub rate limited, waiting ${Math.ceil(waitMs / 1000)}s`)
        await sleep(Math.min(waitMs, 60000)) // 最多等 60s
        continue
      }

      if (!res.ok) {
        logger.warn(`GitHub search "${q}" returned ${res.status}`)
        continue
      }

      const data = await res.json()
      const repos = data.items || []

      for (const repo of repos) {
        if (!seen.has(repo.full_name)) {
          seen.set(repo.full_name, repo)
        }
      }

      logger.info(`GitHub search "${q}": ${repos.length} repos (total unique: ${seen.size})`)

      // 速率限制：每个请求间隔 2s
      await sleep(2000)
    } catch (err) {
      logger.warn(`GitHub search "${q}" failed: ${err.message}`)
    }
  }

  return Array.from(seen.values())
}

// ─── Upsert ──────────────────────────────────────────────

async function upsertFromGitHub(repos, tableName) {
  let inserted = 0
  let updated = 0

  for (const repo of repos) {
    const name = repo.name
    if (!name) continue
    const slug = generateSlug(repo.full_name)
    const description = repo.description || `${name} — GitHub repository`
    const category = classifyRepo(repo)
    const tags = (repo.topics || []).slice(0, 5)
    const githubStars = repo.stargazers_count || 0
    const githubUrl = repo.html_url
    const authorAvatarUrl = repo.owner?.avatar_url || null
    const authorLogin = repo.owner?.login || 'unknown'

    try {
      const authorId = await ensureUser(authorLogin, authorAvatarUrl)

      const result = await query(
        `INSERT INTO ${tableName} (author_id, name, slug, description, version, category, tags,
          package_url, manifest, status, published_at,
          github_stars, github_url, author_avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (slug) DO UPDATE SET
           description = EXCLUDED.description,
           github_stars = EXCLUDED.github_stars,
           github_url = EXCLUDED.github_url,
           author_avatar_url = EXCLUDED.author_avatar_url,
           package_url = EXCLUDED.package_url,
           tags = EXCLUDED.tags,
           manifest = EXCLUDED.manifest,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          authorId, name, slug, description, '1.0.0', category, tags,
          githubUrl,
          JSON.stringify({ name, description, source: 'github', full_name: repo.full_name, language: repo.language }),
          'approved', repo.created_at || new Date().toISOString(),
          githubStars, githubUrl, authorAvatarUrl,
        ]
      )
      if (result.rows.length > 0) {
        if (result.rows[0].is_insert) inserted++
        else updated++
      }
    } catch (err) {
      logger.warn(`Skip ${tableName} "${name}": ${err.message}`)
    }
  }
  return { inserted, updated }
}

// ─── Openclaw Skills ─────────────────────────────────────

async function fetchOpenclawUserDirs() {
  const url = 'https://api.github.com/repos/openclaw/skills/contents/skills'
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'clew-marketplace',
    },
  })
  if (!res.ok) {
    logger.warn(`Openclaw user dir listing returned ${res.status}`)
    return []
  }
  const items = await res.json()
  return items.filter(i => i.type === 'dir').map(i => i.name)
}

async function fetchOpenclawSkillsForUser(owner) {
  const url = `https://api.github.com/repos/openclaw/skills/contents/skills/${encodeURIComponent(owner)}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'clew-marketplace',
    },
  })
  if (!res.ok) return []
  const items = await res.json()
  return items.filter(i => i.type === 'dir').map(i => i.name)
}

async function fetchRawFile(owner, slug, filename) {
  const url = `https://raw.githubusercontent.com/openclaw/skills/main/skills/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/${filename}`
  const res = await fetch(url, { headers: { 'User-Agent': 'clew-marketplace' } })
  if (!res.ok) return null
  return res.text()
}

function parseYamlFrontmatter(md) {
  if (!md || !md.startsWith('---')) return {}
  const end = md.indexOf('---', 3)
  if (end === -1) return {}
  const yaml = md.slice(3, end).trim()
  const result = {}
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    // Handle arrays like: tags: [foo, bar] or tags: foo, bar
    if (key === 'tags') {
      val = val.replace(/^\[|\]$/g, '')
      result.tags = val.split(',').map(t => t.trim()).filter(Boolean)
    } else {
      result[key] = val
    }
  }
  return result
}

async function fetchOpenclawSkills() {
  const skills = []

  // Step 1: Get or reuse cached user directory list (1 API call)
  if (!openclawUserList) {
    openclawUserList = await fetchOpenclawUserDirs()
    if (openclawUserList.length === 0) {
      logger.warn('Openclaw: no user directories found')
      return skills
    }
    logger.info(`Openclaw: found ${openclawUserList.length} user directories`)
  }

  // Step 2: Process a batch of users (up to OPENCLAW_BATCH_SIZE API calls)
  const totalUsers = openclawUserList.length
  if (openclawUserOffset >= totalUsers) {
    openclawUserOffset = 0 // wrap around for next cycle
  }

  const batchEnd = Math.min(openclawUserOffset + OPENCLAW_BATCH_SIZE, totalUsers)
  const userBatch = openclawUserList.slice(openclawUserOffset, batchEnd)
  logger.info(`Openclaw: processing users ${openclawUserOffset + 1}-${batchEnd} of ${totalUsers}`)

  for (const owner of userBatch) {
    try {
      const slugs = await fetchOpenclawSkillsForUser(owner)
      await sleep(1200) // rate limit: ~1.2s between API calls

      // Step 3 & 4: Fetch _meta.json and SKILL.md via raw URLs (no API quota)
      for (const slug of slugs) {
        try {
          const metaRaw = await fetchRawFile(owner, slug, '_meta.json')
          let meta = {}
          if (metaRaw) {
            try { meta = JSON.parse(metaRaw) } catch { /* ignore parse error */ }
          }

          const skillMd = await fetchRawFile(owner, slug, 'SKILL.md')
          const frontmatter = parseYamlFrontmatter(skillMd)

          const displayName = meta.displayName || frontmatter.name || slug
          const description = frontmatter.description || meta.description || `${displayName} — openclaw skill`
          const tags = frontmatter.tags || []
          const version = meta.latest?.version || '1.0.0'

          skills.push({
            owner,
            slug,
            displayName,
            description,
            tags: tags.slice(0, 5),
            version,
            publishedAt: meta.latest?.publishedAt || null,
          })
        } catch (err) {
          logger.warn(`Openclaw: skip skill ${owner}/${slug}: ${err.message}`)
        }
      }
    } catch (err) {
      logger.warn(`Openclaw: skip user ${owner}: ${err.message}`)
    }
  }

  // Advance offset for next sync
  openclawUserOffset = batchEnd >= totalUsers ? 0 : batchEnd
  logger.info(`Openclaw: fetched ${skills.length} skills, next offset: ${openclawUserOffset}`)

  return skills
}

async function upsertOpenclawSkills(skills) {
  let inserted = 0
  let updated = 0

  for (const skill of skills) {
    const slug = `openclaw-${skill.owner}-${skill.slug}`
    const githubUrl = `https://github.com/openclaw/skills/tree/main/skills/${skill.owner}/${skill.slug}`
    const authorAvatarUrl = `https://github.com/${skill.owner}.png`

    // Classify using a synthetic repo-like object
    const category = classifyRepo({
      full_name: `${skill.owner}/${skill.slug}`,
      description: skill.description,
      topics: skill.tags,
    })

    try {
      const authorId = await ensureUser(skill.owner, authorAvatarUrl)

      const result = await query(
        `INSERT INTO skills (author_id, name, slug, description, version, category, tags,
          package_url, manifest, status, published_at,
          github_stars, github_url, author_avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (slug) DO UPDATE SET
           description = EXCLUDED.description,
           github_stars = EXCLUDED.github_stars,
           github_url = EXCLUDED.github_url,
           author_avatar_url = EXCLUDED.author_avatar_url,
           tags = EXCLUDED.tags,
           manifest = EXCLUDED.manifest,
           version = EXCLUDED.version,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          authorId, skill.displayName, slug, skill.description, skill.version, category, skill.tags,
          githubUrl,
          JSON.stringify({ name: skill.displayName, description: skill.description, source: 'openclaw', owner: skill.owner, slug: skill.slug }),
          'approved', skill.publishedAt || new Date().toISOString(),
          OPENCLAW_REPO_STARS, githubUrl, authorAvatarUrl,
        ]
      )
      if (result.rows.length > 0) {
        if (result.rows[0].is_insert) inserted++
        else updated++
      }
    } catch (err) {
      logger.warn(`Openclaw: skip skill "${slug}": ${err.message}`)
    }
  }
  return { inserted, updated }
}

// ─── Public API ──────────────────────────────────────────

export async function runSync() {
  if (isSyncing) {
    return { error: '同步正在进行中', isSyncing: true }
  }

  isSyncing = true
  const startTime = Date.now()
  const record = { startTime: new Date().toISOString(), status: 'running' }

  try {
    // MCP — from GitHub
    const mcpRepos = await fetchGitHubRepos(MCP_QUERIES)
    const mcpResult = await upsertFromGitHub(mcpRepos, 'mcps')

    // Skill — from GitHub
    const skillRepos = await fetchGitHubRepos(SKILL_QUERIES)
    const skillResult = await upsertFromGitHub(skillRepos, 'skills')

    // Skill — from openclaw/skills
    const openclawSkills = await fetchOpenclawSkills()
    const openclawResult = await upsertOpenclawSkills(openclawSkills)

    const duration = Date.now() - startTime
    lastSyncTime = new Date()

    Object.assign(record, {
      status: 'success',
      mcpsFetched: mcpRepos.length,
      mcpsInserted: mcpResult.inserted,
      mcpsUpdated: mcpResult.updated,
      skillsFetched: skillRepos.length,
      skillsInserted: skillResult.inserted,
      skillsUpdated: skillResult.updated,
      openclawFetched: openclawSkills.length,
      openclawInserted: openclawResult.inserted,
      openclawUpdated: openclawResult.updated,
      duration,
      endTime: new Date().toISOString(),
    })

    logger.info(`数据同步完成: MCP ${mcpResult.inserted}新/${mcpResult.updated}更新, Skill ${skillResult.inserted}新/${skillResult.updated}更新, Openclaw ${openclawResult.inserted}新/${openclawResult.updated}更新, 耗时 ${duration}ms`)

    return record
  } catch (err) {
    const duration = Date.now() - startTime
    Object.assign(record, {
      status: 'failed',
      error: err.message,
      duration,
      endTime: new Date().toISOString(),
    })
    logger.error(`数据同步失败: ${err.message}`)
    return record
  } finally {
    isSyncing = false
    syncHistory.unshift(record)
    if (syncHistory.length > MAX_HISTORY) syncHistory.pop()
  }
}

export function getSyncStatus() {
  return {
    lastSyncTime: lastSyncTime?.toISOString() || null,
    nextSyncTime: nextSyncTime?.toISOString() || null,
    isSyncing,
  }
}

export function getSyncHistory() {
  return syncHistory
}

export function startScheduler() {
  if (syncTimer) return

  nextSyncTime = new Date(Date.now() + SYNC_INTERVAL)

  syncTimer = setInterval(async () => {
    logger.info('定时同步任务触发')
    nextSyncTime = new Date(Date.now() + SYNC_INTERVAL)
    await runSync()
  }, SYNC_INTERVAL)

  logger.info('数据同步定时器已启动，间隔 24 小时')
  console.log('🔄 数据同步定时器已启动，间隔 24 小时')
}

export function stopScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
    nextSyncTime = null
    logger.info('数据同步定时器已停止')
  }
}
