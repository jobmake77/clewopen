const toBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

export function buildDbPoolConfig(env = process.env) {
  const config = {
    max: Number(env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(env.DB_POOL_CONNECT_TIMEOUT_MS || 2000),
  }

  const databaseUrl = (env.DATABASE_URL || '').trim()
  if (databaseUrl) {
    config.connectionString = databaseUrl
  } else {
    config.host = env.DB_HOST || 'localhost'
    config.port = Number(env.DB_PORT || 5432)
    config.database = env.DB_NAME || 'clewopen'
    config.user = env.DB_USER || 'postgres'
    config.password = env.DB_PASSWORD || 'postgres'
  }

  const forceSsl = toBoolean(env.DB_SSL, false) || toBoolean(env.DATABASE_SSL, false)
  if (forceSsl) {
    const rejectUnauthorized = toBoolean(env.DB_SSL_REJECT_UNAUTHORIZED, false)
    config.ssl = { rejectUnauthorized }
  }

  return config
}
