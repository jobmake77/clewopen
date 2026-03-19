import winston from 'winston'
import { redactObject, redactString } from '../utils/redaction.js'

const sanitizeFormat = winston.format((info) => {
  const sanitized = { ...info }
  if (typeof sanitized.message === 'string') {
    sanitized.message = redactString(sanitized.message)
  } else if (sanitized.message && typeof sanitized.message === 'object') {
    sanitized.message = redactObject(sanitized.message)
  }

  for (const [key, value] of Object.entries(sanitized)) {
    if (key === 'message' || key === 'level' || key === 'timestamp') continue
    sanitized[key] = redactObject(value)
  }

  return sanitized
})

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    sanitizeFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})
