import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

function buildConfigFromEnv(env = process.env) {
  const databaseUrl = (env.DATABASE_URL || '').trim()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法执行 Supabase 写入验证')
  }
  return {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  }
}

async function runCoreWriteChecks(client) {
  const out = []

  const agent = (await client.query("SELECT id, version FROM agents WHERE deleted_at IS NULL LIMIT 1")).rows[0]
  if (!agent) throw new Error('未找到 agent 数据')

  const dev = (await client.query("SELECT id FROM users WHERE role IN ('developer', 'admin') AND deleted_at IS NULL LIMIT 1")).rows[0]
  if (!dev) throw new Error('未找到 developer/admin 用户')

  const uname = `sb_verify_${Date.now()}`
  const email = `${uname}@example.com`
  const user = (
    await client.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [uname, email, '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']
    )
  ).rows[0]
  out.push('users')

  await client.query(
    `INSERT INTO notifications (user_id, type, title, content)
     VALUES ($1, 'system', 'verify', 'write path check')`,
    [user.id]
  )
  out.push('notifications')

  const trial = (
    await client.query(
      `INSERT INTO trial_sessions (user_id, agent_id, status, runtime_type, expires_at, metadata)
       VALUES ($1, $2, 'provisioning', 'prompt', NOW() + INTERVAL '1 hour', '{}'::jsonb)
       RETURNING id`,
      [user.id, agent.id]
    )
  ).rows[0]
  out.push('trial_sessions')

  await client.query(
    `INSERT INTO trial_session_messages (session_id, role, content, metadata)
     VALUES ($1, 'user', 'verify', '{}'::jsonb)`,
    [trial.id]
  )
  out.push('trial_session_messages')

  await client.query(
    `INSERT INTO trial_data_access_audits (session_id, viewer_user_id, viewer_role, access_type, resource_type, metadata)
     VALUES ($1, $2, 'user', 'view', 'trial_session', '{}'::jsonb)`,
    [trial.id, user.id]
  )
  out.push('trial_data_access_audits')

  await client.query(
    `INSERT INTO user_llm_configs (user_id, provider_name, api_url, api_key, model_id, auth_type, is_default, is_enabled, metadata)
     VALUES ($1, 'openai', 'https://api.openai.com/v1/chat/completions', 'sk-test', 'gpt-4o-mini', 'bearer', true, true, '{}'::jsonb)`,
    [user.id]
  )
  out.push('user_llm_configs')

  await client.query(
    `INSERT INTO reviews (resource_id, user_id, resource_type, rating, comment, status)
     VALUES ($1, $2, 'agent', 5, 'verify review', 'approved')`,
    [agent.id, user.id]
  )
  out.push('reviews')

  await client.query(
    `INSERT INTO downloads (resource_id, user_id, resource_type, version, ip_address, user_agent)
     VALUES ($1, $2, 'agent', $3, '127.0.0.1', 'verify')`,
    [agent.id, user.id, agent.version || '1.0.0']
  )
  out.push('downloads')

  const order = (
    await client.query(
      `INSERT INTO custom_orders (user_id, title, description, budget_min, budget_max, category, status)
       VALUES ($1, 'verify order', 'verify desc', 10, 20, 'integration', 'open')
       RETURNING id`,
      [user.id]
    )
  ).rows[0]
  out.push('custom_orders')

  await client.query(
    `INSERT INTO custom_order_submissions (order_id, developer_id, agent_id, title, summary, status)
     VALUES ($1, $2, $3, 'verify sub', 'summary', 'submitted')`,
    [order.id, dev.id, agent.id]
  )
  out.push('custom_order_submissions')

  await client.query(
    `INSERT INTO custom_order_messages (order_id, sender_id, role, content, metadata)
     VALUES ($1, $2, 'buyer', 'hello', '{}'::jsonb)`,
    [order.id, user.id]
  )
  out.push('custom_order_messages')

  await client.query(
    `INSERT INTO custom_order_disputes (order_id, buyer_id, developer_id, reason, evidence, status)
     VALUES ($1, $2, $3, 'verify reason', '[]'::jsonb, 'open')`,
    [order.id, user.id, dev.id]
  )
  out.push('custom_order_disputes')

  await client.query(
    `INSERT INTO agent_publish_jobs (agent_id, requested_by, status, payload)
     VALUES ($1, $2, 'queued', '{}'::jsonb)`,
    [agent.id, user.id]
  )
  out.push('agent_publish_jobs')

  await client.query(
    `INSERT INTO agent_install_tokens (agent_id, issued_to_user_id, token_hash, publish_mode, max_uses, expires_at)
     VALUES ($1, $2, $3, 'open', 1, NOW() + INTERVAL '1 day')`,
    [agent.id, user.id, `verify-hash-${Date.now()}`]
  )
  out.push('agent_install_tokens')

  await client.query(
    `INSERT INTO agent_install_events (user_id, agent_id, mode, status, included_files, source, metadata)
     VALUES ($1, $2, 'full', 'success', ARRAY['agent.md'], 'verify', '{}'::jsonb)`,
    [user.id, agent.id]
  )
  out.push('agent_install_events')

  return out
}

async function runSyncWriteChecks(client) {
  const out = []
  const author = (await client.query("SELECT id FROM users WHERE role IN ('developer', 'admin') LIMIT 1")).rows[0]
  if (!author) throw new Error('未找到可用于 sync 测试的作者账号')

  await client.query(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  out.push('sync_cursors:create')

  await client.query(
    `INSERT INTO sync_cursors(key, value, updated_at)
     VALUES ('verify_cursor', '{"offset":1}'::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`
  )
  out.push('sync_cursors:upsert')

  const skillSlug = `verify-skill-${Date.now()}`
  const skill = (
    await client.query(
      `INSERT INTO skills (author_id, name, slug, description, version, category, package_url, manifest, status, source_type, source_platform, source_id, last_synced_at)
       VALUES ($1, 'verify skill', $2, 'desc', '1.0.0', 'ai-skill', 'uploaded/verify.zip', '{}'::jsonb, 'approved', 'uploaded', 'manual', $3, NOW())
       RETURNING id`,
      [author.id, skillSlug, `uploaded:${skillSlug}`]
    )
  ).rows[0]
  out.push('skills')

  const mcpSlug = `verify-mcp-${Date.now()}`
  const mcp = (
    await client.query(
      `INSERT INTO mcps (author_id, name, slug, description, version, category, package_url, manifest, status, source_type, source_platform, source_id, last_synced_at)
       VALUES ($1, 'verify mcp', $2, 'desc', '1.0.0', 'mcp-server', 'uploaded/verify.zip', '{}'::jsonb, 'approved', 'uploaded', 'manual', $3, NOW())
       RETURNING id`,
      [author.id, mcpSlug, `uploaded:${mcpSlug}`]
    )
  ).rows[0]
  out.push('mcps')

  await client.query(
    `INSERT INTO resource_star_snapshots (resource_type, resource_id, stars, snapshot_date)
     VALUES ('skill', $1, 42, CURRENT_DATE)`,
    [skill.id]
  )
  await client.query(
    `INSERT INTO resource_star_snapshots (resource_type, resource_id, stars, snapshot_date)
     VALUES ('mcp', $1, 24, CURRENT_DATE)`,
    [mcp.id]
  )
  out.push('resource_star_snapshots')

  return out
}

async function main() {
  const pool = new Pool(buildConfigFromEnv(process.env))
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const core = await runCoreWriteChecks(client)
    const sync = await runSyncWriteChecks(client)
    await client.query('ROLLBACK')

    console.log('✅ Supabase 写入验证通过（事务已回滚）')
    console.log(`Core: ${core.length} tables`)
    console.log(core.join(', '))
    console.log(`Sync/Ranking: ${sync.length} checks`)
    console.log(sync.join(', '))
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    console.error('❌ Supabase 写入验证失败:', error.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
