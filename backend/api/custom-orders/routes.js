import express from 'express'
import CustomOrderModel from '../../models/CustomOrder.js'
import { authenticate } from '../../middleware/auth.js'

const router = express.Router()

// 获取定制需求列表（公开）
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, category } = req.query
    const result = await CustomOrderModel.findAll({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      status,
      category,
    })
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
})

// 获取单个需求详情
router.get('/:id', async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    res.json({ success: true, data: order })
  } catch (error) {
    next(error)
  }
})

// 发布定制需求（需登录）
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { title, description, budget_min, budget_max, deadline, category } = req.body

    if (!title || !description) {
      return res.status(400).json({ success: false, error: '缺少必填字段：title, description' })
    }

    const order = await CustomOrderModel.create({
      user_id: req.user.id,
      title,
      description,
      budget_min: budget_min || null,
      budget_max: budget_max || null,
      deadline: deadline || null,
      category: category || null,
    })

    res.status(201).json({ success: true, data: order, message: '需求发布成功' })
  } catch (error) {
    next(error)
  }
})

// 更新需求状态
router.put('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body
    const order = await CustomOrderModel.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }

    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '无权限修改此需求' })
    }

    const updated = await CustomOrderModel.updateStatus(req.params.id, status)
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// 删除需求
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }

    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '无权限删除此需求' })
    }

    await CustomOrderModel.delete(req.params.id)
    res.json({ success: true, message: '需求已删除' })
  } catch (error) {
    next(error)
  }
})

export default router
