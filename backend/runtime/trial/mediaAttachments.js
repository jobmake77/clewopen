const MAX_ATTACHMENTS_PER_MESSAGE = Math.max(
  1,
  Number.parseInt(process.env.TRIAL_MAX_ATTACHMENTS_PER_MESSAGE || '4', 10),
)
const MAX_IMAGE_BYTES = Math.max(
  256 * 1024,
  Number.parseInt(process.env.TRIAL_MAX_IMAGE_BYTES || String(5 * 1024 * 1024), 10),
)
const MAX_AUDIO_BYTES = Math.max(
  256 * 1024,
  Number.parseInt(process.env.TRIAL_MAX_AUDIO_BYTES || String(20 * 1024 * 1024), 10),
)
const MAX_VIDEO_BYTES = Math.max(
  512 * 1024,
  Number.parseInt(process.env.TRIAL_MAX_VIDEO_BYTES || String(50 * 1024 * 1024), 10),
)

const IMAGE_MIME_WHITELIST = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const AUDIO_MIME_WHITELIST = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
])

const VIDEO_MIME_WHITELIST = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
])

function dataUrlSizeBytes(dataUrl) {
  const data = String(dataUrl || '')
  const commaIndex = data.indexOf(',')
  if (commaIndex === -1) return 0
  const base64 = data.slice(commaIndex + 1).replace(/\s/g, '')
  if (!base64) return 0
  const padding = (base64.match(/=*$/) || [''])[0].length
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function normalizeKind(kind) {
  return String(kind || '').trim().toLowerCase()
}

function normalizeAttachment(raw, index) {
  const kind = normalizeKind(raw?.kind)
  const mimeType = String(raw?.mimeType || '').trim().toLowerCase()
  const fileName = String(raw?.fileName || '').trim() || `attachment-${index + 1}`
  const dataUrl = String(raw?.dataUrl || '').trim()

  if (!kind) {
    const error = new Error('附件类型缺失')
    error.statusCode = 400
    throw error
  }

  if (!['image', 'audio', 'video'].includes(kind)) {
    const error = new Error(`暂不支持的附件类型: ${kind}`)
    error.statusCode = 400
    throw error
  }

  if (!mimeType) {
    const error = new Error('附件 MIME 类型缺失')
    error.statusCode = 400
    throw error
  }

  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
    const error = new Error('附件数据格式无效，请重新上传')
    error.statusCode = 400
    throw error
  }

  const sizeBytes = dataUrlSizeBytes(dataUrl)
  if (sizeBytes <= 0) {
    const error = new Error('附件内容为空')
    error.statusCode = 400
    throw error
  }

  if (kind === 'image') {
    if (!IMAGE_MIME_WHITELIST.has(mimeType)) {
      const error = new Error(`图片格式不支持: ${mimeType}`)
      error.statusCode = 400
      throw error
    }
    if (sizeBytes > MAX_IMAGE_BYTES) {
      const error = new Error(`图片过大，单张不超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB`)
      error.statusCode = 400
      throw error
    }
  }

  if (kind === 'audio') {
    if (!AUDIO_MIME_WHITELIST.has(mimeType)) {
      const error = new Error(`音频格式不支持: ${mimeType}`)
      error.statusCode = 400
      throw error
    }
    if (sizeBytes > MAX_AUDIO_BYTES) {
      const error = new Error(`音频过大，单个不超过 ${Math.floor(MAX_AUDIO_BYTES / 1024 / 1024)}MB`)
      error.statusCode = 400
      throw error
    }
  }

  if (kind === 'video') {
    if (!VIDEO_MIME_WHITELIST.has(mimeType)) {
      const error = new Error(`视频格式不支持: ${mimeType}`)
      error.statusCode = 400
      throw error
    }
    if (sizeBytes > MAX_VIDEO_BYTES) {
      const error = new Error(`视频过大，单个不超过 ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB`)
      error.statusCode = 400
      throw error
    }
  }

  return {
    id: String(raw?.id || `${Date.now()}-${index}`),
    kind,
    mimeType,
    fileName,
    sizeBytes,
    dataUrl,
  }
}

export function normalizeTrialAttachments(rawValue) {
  if (!Array.isArray(rawValue) || rawValue.length === 0) return []

  if (rawValue.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    const error = new Error(`单条消息最多上传 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`)
    error.statusCode = 400
    throw error
  }

  return rawValue.map((item, index) => normalizeAttachment(item, index))
}

export function ensureTrialAttachmentCapabilities(attachments) {
  const hasAudio = attachments.some((item) => item.kind === 'audio')
  const hasVideo = attachments.some((item) => item.kind === 'video')
  if (!hasAudio && !hasVideo) return

  const error = new Error(
    '当前试用环境仅启用图片输入。音频/视频接口已预留，后续版本开放。'
  )
  error.statusCode = 422
  error.code = 'TRIAL_MEDIA_NOT_ENABLED'
  throw error
}

export function buildAttachmentSummary(attachments) {
  return attachments.map((item) => ({
    id: item.id,
    kind: item.kind,
    mimeType: item.mimeType,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
  }))
}

export function buildUserMessageForModel(message, attachments) {
  const trimmed = String(message || '').trim()
  const imageCount = attachments.filter((item) => item.kind === 'image').length

  if (!imageCount) return trimmed
  if (trimmed) return `${trimmed}\n\n[用户附加了 ${imageCount} 张图片]`
  return `[用户附加了 ${imageCount} 张图片，请结合图片内容回答]`
}
