import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import CustomOrderModel from '../../models/CustomOrder.js'
import { authenticate } from '../../middleware/auth.js'
import { extractManifest } from '../../utils/manifestValidator.js'
import { downloadGithubArtifact, uploadCustomOrderArtifactToGithub } from '../../services/githubArtifactService.js'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '../..')

const submissionUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(backendRoot, 'uploads/custom-orders')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }
      cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
      cb(null, `submission-${suffix}${path.extname(file.originalname)}`)
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (ext !== '.zip') {
      cb(new Error('仅支持 .zip 交付包'))
      return
    }
    cb(null, true)
  },
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
})

function resolveMessageRole(order, user) {
  if (user.role === 'admin') return 'admin'
  if (order.user_id === user.id) return 'buyer'
  if (order.developer_id === user.id) return 'developer'
  return 'developer'
}

function ensureOrderEditable(order, user) {
  return user.role === 'admin' || order.user_id === user.id || order.developer_id === user.id
}

// 获取定制需求列表（公开）
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, category } = req.query
    const result = await CustomOrderModel.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status,
      category,
    })
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
})

// 获取单个需求详情（公开）
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
      return res.status(400).json({ success: false, error: { message: '缺少必填字段：title, description' } })
    }

    const order = await CustomOrderModel.create({
      user_id: req.user.id,
      title: String(title).trim(),
      description: String(description).trim(),
      budget_min: budget_min || null,
      budget_max: budget_max || null,
      deadline: deadline || null,
      category: category || null,
    })

    await CustomOrderModel.createMessage({
      order_id: order.id,
      sender_id: req.user.id,
      role: 'buyer',
      content: '买方已创建需求，等待开发者提交方案。',
      metadata: { type: 'system-note' },
    })

    res.status(201).json({ success: true, data: order, message: '需求发布成功' })
  } catch (error) {
    next(error)
  }
})

// 买方指派开发者并进入进行中
router.post('/:id/assign', authenticate, async (req, res, next) => {
  try {
    const { developer_id } = req.body
    if (!developer_id) {
      return res.status(400).json({ success: false, error: { message: '缺少 developer_id' } })
    }

    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅买方可指派开发者' } })
    }

    const updated = await CustomOrderModel.assignDeveloper(req.params.id, developer_id)
    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'buyer',
      content: '买方已指派开发者，任务进入进行中。',
      metadata: { type: 'assign', developer_id },
    })
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// 更新需求状态（不涉及支付）
router.put('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body
    const order = await CustomOrderModel.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }

    if (!ensureOrderEditable(order, req.user)) {
      return res.status(403).json({ success: false, error: { message: '无权限修改此需求' } })
    }

    const updated = await CustomOrderModel.updateStatus(req.params.id, status)
    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: resolveMessageRole(order, req.user),
      content: `状态已更新为 ${status}`,
      metadata: { type: 'status-change', to: status },
    })
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// 开发者提交方案（支持关联 agent）
router.post('/:id/submissions', authenticate, submissionUpload.single('package'), async (req, res, next) => {
  try {
    const { title, summary, agent_id, version_label } = req.body
    const order = await CustomOrderModel.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }

    if (!title || !summary) {
      return res.status(400).json({ success: false, error: { message: '缺少必填字段：title, summary' } })
    }

    if (req.body.package_url) {
      return res.status(400).json({ success: false, error: { message: '不允许外链交付，请上传 ZIP 包' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: '请上传 ZIP 交付包（字段名 package）' } })
    }

    if (![order.developer_id, null].includes(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅指派开发者可提交方案' } })
    }

    const manifestResult = extractManifest(req.file.path)
    if (!manifestResult.success) {
      return res.status(400).json({ success: false, error: { message: `ZIP 解析失败：${manifestResult.error}` } })
    }

    const parsedManifest = manifestResult.manifest || {}
    if (!parsedManifest.name || !parsedManifest.version || !parsedManifest.description) {
      return res.status(400).json({
        success: false,
        error: { message: 'manifest.json 必须包含 name/version/description' },
      })
    }

    const artifactRemote = await uploadCustomOrderArtifactToGithub({
      orderId: req.params.id,
      submissionIdHint: `${String(req.user.id || 'dev').slice(0, 8)}-${Date.now()}`,
      originalName: req.file.originalname,
      localFilePath: req.file.path,
      manifest: parsedManifest,
    })

    const artifact = await CustomOrderModel.createArtifact({
      order_id: req.params.id,
      developer_id: req.user.id,
      repository: artifactRemote.repository,
      git_path: artifactRemote.git_path,
      git_sha: artifactRemote.git_sha,
      file_name: artifactRemote.file_name,
      file_size_bytes: artifactRemote.file_size_bytes,
      sha256: artifactRemote.sha256,
      manifest: artifactRemote.manifest,
      metadata: artifactRemote.metadata,
    })

    const submission = await CustomOrderModel.createSubmission({
      order_id: req.params.id,
      developer_id: req.user.id,
      agent_id,
      title: String(title).trim(),
      summary: String(summary).trim(),
      version_label: version_label || null,
      artifact_id: artifact?.id || null,
      parsed_manifest: parsedManifest,
    })

    if (order.status === 'open') {
      await CustomOrderModel.assignDeveloper(order.id, req.user.id)
    }

    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'developer',
      content: `开发者提交了新方案：${submission.title}`,
      metadata: { type: 'submission', submission_id: submission.id },
    })

    res.status(201).json({
      success: true,
      data: {
        ...submission,
        artifact_repository: artifact?.repository,
        artifact_file_name: artifact?.file_name,
        artifact_sha256: artifact?.sha256,
      },
    })
  } catch (error) {
    next(error)
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
  }
})

router.get('/:id/submissions', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限查看方案' } })
    }

    const submissions = await CustomOrderModel.listSubmissions(req.params.id)
    res.json({ success: true, data: submissions })
  } catch (error) {
    next(error)
  }
})

// 下载交付包（平台代理下载，避免暴露外链）
router.get('/:id/submissions/:submissionId/artifact/download', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限下载交付包' } })
    }

    const submission = await CustomOrderModel.findSubmissionById(req.params.id, req.params.submissionId)
    if (!submission || !submission.artifact_repository || !submission.artifact_git_path) {
      return res.status(404).json({ success: false, error: { message: '交付包不存在' } })
    }

    const zipBuffer = await downloadGithubArtifact({
      repository: submission.artifact_repository,
      gitPath: submission.artifact_git_path,
    })
    const fileName = submission.artifact_file_name || `custom-order-${req.params.submissionId}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.send(zipBuffer)
  } catch (error) {
    next(error)
  }
})

// 开发者请求验收
router.post('/:id/request-acceptance', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (order.developer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅开发者可发起验收' } })
    }

    const updated = await CustomOrderModel.updateStatus(req.params.id, 'awaiting_acceptance')
    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'developer',
      content: '开发者已发起验收，请买方确认。',
      metadata: { type: 'acceptance-request' },
    })
    res.json({ success: true, data: updated })
  } catch (error) {
    next(error)
  }
})

// 买方确认验收（不触发支付）
router.post('/:id/accept', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅买方可确认验收' } })
    }

    const accepted = await CustomOrderModel.updateStatus(req.params.id, 'accepted')
    const completed = await CustomOrderModel.updateStatus(req.params.id, 'completed')
    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'buyer',
      content: '买方已确认验收，订单已完成（支付模块未启用）。',
      metadata: { type: 'acceptance-confirmed' },
    })
    res.json({ success: true, data: { accepted, completed } })
  } catch (error) {
    next(error)
  }
})

// 订单留言
router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限查看消息' } })
    }
    const data = await CustomOrderModel.listMessages(req.params.id, {
      limit: Number.parseInt(req.query.limit || '200', 10),
    })
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { content, metadata } = req.body
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限发消息' } })
    }
    if (!content || String(content).trim().length < 1) {
      return res.status(400).json({ success: false, error: { message: '消息内容不能为空' } })
    }

    const message = await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: resolveMessageRole(order, req.user),
      content: String(content).trim(),
      metadata: metadata || {},
    })
    res.status(201).json({ success: true, data: message })
  } catch (error) {
    next(error)
  }
})

// 买方发起争议（非支付纠纷）
router.post('/:id/disputes', authenticate, async (req, res, next) => {
  try {
    const { reason, evidence } = req.body
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅买方可发起争议' } })
    }
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ success: false, error: { message: '争议原因至少 10 个字符' } })
    }

    const dispute = await CustomOrderModel.createDispute({
      order_id: req.params.id,
      buyer_id: order.user_id,
      developer_id: order.developer_id,
      reason: String(reason).trim(),
      evidence: Array.isArray(evidence) ? evidence : [],
    })
    await CustomOrderModel.updateStatus(req.params.id, 'disputed')
    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'buyer',
      content: '买方已发起争议，等待平台处理。',
      metadata: { type: 'dispute-open', dispute_id: dispute.id },
    })
    res.status(201).json({ success: true, data: dispute })
  } catch (error) {
    next(error)
  }
})

router.get('/:id/disputes', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限查看争议' } })
    }
    const data = await CustomOrderModel.listDisputes(req.params.id)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

// 管理员裁决争议（支付模块未接入，先仅处理任务状态）
router.post('/:id/disputes/:disputeId/resolve', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '仅管理员可裁决争议' } })
    }
    const { status, resolution, next_status } = req.body
    if (!['resolved_buyer', 'resolved_developer', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: '非法争议状态' } })
    }

    const dispute = await CustomOrderModel.resolveDispute(req.params.id, req.params.disputeId, {
      status,
      resolution,
      resolver_id: req.user.id,
    })
    if (!dispute) {
      return res.status(404).json({ success: false, error: { message: '争议不存在' } })
    }

    const resolvedNextStatus = next_status || 'closed'
    await CustomOrderModel.updateStatus(req.params.id, resolvedNextStatus)

    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: 'admin',
      content: `争议已裁决：${status}`,
      metadata: { type: 'dispute-resolved', dispute_id: dispute.id, status },
    })

    res.json({ success: true, data: dispute })
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
      return res.status(403).json({ success: false, error: { message: '无权限删除此需求' } })
    }

    await CustomOrderModel.delete(req.params.id)
    res.json({ success: true, message: '需求已删除' })
  } catch (error) {
    next(error)
  }
})

export default router
