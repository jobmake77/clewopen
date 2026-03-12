import { logger } from '../config/logger.js'

export const auditLog = (action) => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res)

    res.json = (data) => {
      const logEntry = {
        action,
        admin_id: req.user?.id,
        admin_username: req.user?.username,
        target_id: req.params?.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        success: data?.success || false,
        timestamp: new Date().toISOString(),
        ip: req.ip
      }

      if (req.body?.reason) {
        logEntry.reason = req.body.reason
      }

      logger.info('AUDIT', logEntry)

      return originalJson(data)
    }

    next()
  }
}
