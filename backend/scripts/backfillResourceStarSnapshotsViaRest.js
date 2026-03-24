import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const pageSize = Math.max(100, Number.parseInt(process.env.BACKFILL_PAGE_SIZE || '500', 10))
const chunkSize = Math.max(100, Number.parseInt(process.env.BACKFILL_CHUNK_SIZE || '500', 10))

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 缺少环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
}

const today = new Date().toISOString().slice(0, 10)

const endpoint = (path, query = '') => `${supabaseUrl}/rest/v1/${path}${query}`

async function fetchResources(tableName) {
  const rows = []
  let offset = 0

  while (true) {
    const query = `?select=id,github_stars&deleted_at=is.null&status=eq.approved&limit=${pageSize}&offset=${offset}`
    const res = await fetch(endpoint(tableName, query), { headers })
    if (!res.ok) {
      throw new Error(`${tableName} 查询失败: ${res.status}`)
    }
    const data = await res.json()
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }

  return rows
}

async function upsertSnapshotRows(rows) {
  if (rows.length === 0) return 0
  let affected = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const res = await fetch(endpoint('resource_star_snapshots', '?on_conflict=resource_type,resource_id,snapshot_date'), {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`snapshot upsert 失败: ${res.status} ${text}`)
    }
    affected += chunk.length
  }
  return affected
}

async function countToday() {
  const res = await fetch(endpoint('resource_star_snapshots', `?select=resource_type&snapshot_date=eq.${today}`), {
    headers: {
      ...headers,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const range = res.headers.get('content-range') || ''
  const total = range.includes('/') ? Number(range.split('/')[1]) : 0
  return Number.isFinite(total) ? total : 0
}

async function main() {
  console.log(`🔄 开始回填 resource_star_snapshots (${today})`)
  const [skills, mcps] = await Promise.all([
    fetchResources('skills'),
    fetchResources('mcps'),
  ])

  const snapshotRows = [
    ...skills.map(item => ({
      resource_type: 'skill',
      resource_id: item.id,
      stars: Number(item.github_stars || 0),
      snapshot_date: today,
    })),
    ...mcps.map(item => ({
      resource_type: 'mcp',
      resource_id: item.id,
      stars: Number(item.github_stars || 0),
      snapshot_date: today,
    })),
  ]

  const affected = await upsertSnapshotRows(snapshotRows)
  const todayCount = await countToday()
  console.log(`✅ 回填完成: upsert=${affected}, today_snapshot_count=${todayCount}`)
}

main().catch((error) => {
  console.error(`❌ 回填失败: ${error.message}`)
  process.exit(1)
})
