import { query } from '../config/database.js'
import { encryptSecret, isEncryptedSecret } from '../utils/secretCrypto.js'

async function main() {
  if (!process.env.SECRET_ENCRYPTION_KEY) {
    throw new Error('请先配置 SECRET_ENCRYPTION_KEY 再执行密钥加密迁移')
  }

  const rows = await query('SELECT id, api_key FROM llm_configs WHERE api_key IS NOT NULL')
  let updated = 0

  for (const row of rows.rows) {
    const raw = row.api_key
    if (!raw || isEncryptedSecret(raw)) continue
    const encrypted = encryptSecret(raw)
    await query('UPDATE llm_configs SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      encrypted,
      row.id,
    ])
    updated += 1
  }

  console.log(`llm_configs api_key encryption completed, updated rows: ${updated}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
