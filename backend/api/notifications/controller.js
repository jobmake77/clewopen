import NotificationModel from '../../models/Notification.js'

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { page = 1, pageSize = 20, unreadOnly = false } = req.query

    const result = await NotificationModel.findByUser(userId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      unreadOnly: unreadOnly === 'true'
    })

    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
}

export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await NotificationModel.getUnreadCount(req.user.id)
    res.json({ success: true, data: { count } })
  } catch (error) {
    next(error)
  }
}

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params
    const notification = await NotificationModel.markAsRead(id, req.user.id)

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: { message: 'Notification not found' }
      })
    }

    res.json({ success: true, data: notification })
  } catch (error) {
    next(error)
  }
}

export const markAllAsRead = async (req, res, next) => {
  try {
    await NotificationModel.markAllAsRead(req.user.id)
    res.json({ success: true, data: { message: 'All notifications marked as read' } })
  } catch (error) {
    next(error)
  }
}
