import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function getMasterKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY || ''
  if (!raw) return null
  return crypto.createHash('sha256').update(raw).digest()
}

export function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(value) {
  if (value == null || value === '') return value
  if (isEncryptedSecret(value)) return value

  const key = getMasterKey()
  if (!key) return value

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptSecret(value) {
  if (value == null || value === '') return value
  if (!isEncryptedSecret(value)) return value

  const key = getMasterKey()
  if (!key) {
    throw new Error('SECRET_ENCRYPTION_KEY 未配置，无法解密已加密密钥')
  }

  const payload = String(value).slice(PREFIX.length)
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('密钥加密格式无效')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
