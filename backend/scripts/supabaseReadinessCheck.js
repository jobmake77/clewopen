import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 缺少环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
}

const endpoint = (path, query = '') => `${supabaseUrl}/rest/v1/${path}${query}`

async function countTable(tableName) {
  const res = await fetch(endpoint(tableName, '?select=*&limit=1'), {
    method: 'GET',
    headers: {
      ...headers,
      Range: '0-0',
      Prefer: 'count=exact',
    },
  })

  const contentRange = res.headers.get('content-range') || ''
  const total = contentRange.includes('/') ? Number(contentRange.split('/')[1]) : null
  return { status: res.status, total, contentRange }
}

async function getFirstUserId() {
  const res = await fetch(endpoint('users', '?select=id&limit=1'), {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    throw new Error(`读取 users 失败: ${res.status}`)
  }
  const body = await res.json()
  return body?.[0]?.id || null
}

async function writeRoundtripNotification(userId) {
  const payload = {
    user_id: userId,
    type: 'supabase_readiness_check',
    title: 'Supabase readiness check',
    content: 'temporary row for connectivity check',
  }

  const createRes = await fetch(endpoint('notifications'), {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  const createBody = await createRes.json().catch(() => [])
  const id = createBody?.[0]?.id
  if (createRes.status !== 201 || !id) {
    throw new Error(`notifications INSERT 失败: ${createRes.status}`)
  }

  const updateRes = await fetch(endpoint('notifications', `?id=eq.${id}`), {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ content: 'temporary row updated' }),
  })
  if (updateRes.status !== 200) {
    throw new Error(`notifications UPDATE 失败: ${updateRes.status}`)
  }

  const deleteRes = await fetch(endpoint('notifications', `?id=eq.${id}`), {
    method: 'DELETE',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
  })
  if (deleteRes.status !== 200) {
    throw new Error(`notifications DELETE 失败: ${deleteRes.status}`)
  }
}

async function main() {
  const tables = [
    'users',
    'agents',
    'categories',
    'reviews',
    'downloads',
    'notifications',
    'trial_sessions',
    'trial_session_messages',
    'skills',
    'mcps',
    'resource_star_snapshots',
  ]

  console.log('🔎 Supabase readiness 检查开始...')
  for (const table of tables) {
    const info = await countTable(table)
    console.log(`${table}: status=${info.status} count=${info.total ?? 'unknown'} range=${info.contentRange || 'none'}`)
  }

  const userId = await getFirstUserId()
  if (!userId) {
    throw new Error('未找到 users 数据，无法执行写入回路测试')
  }

  await writeRoundtripNotification(userId)
  console.log('✅ 写入回路验证通过（notifications insert/update/delete）')
  console.log('✅ Supabase readiness 检查完成')
}

main().catch((error) => {
  console.error(`❌ Supabase readiness 检查失败: ${error.message}`)
  process.exit(1)
})
