import express from 'express'
import multer from 'multer'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import CustomOrderModel from '../../models/CustomOrder.js'
import { authenticate } from '../../middleware/auth.js'
import { extractManifest } from '../../utils/manifestValidator.js'
import { downloadGithubArtifact, uploadCustomOrderArtifactToGithub } from '../../services/githubArtifactService.js'
import CustomOrderArtifactInstallTokenModel from '../../models/CustomOrderArtifactInstallToken.js'
import { createTrialSession } from '../../runtime/trial/orchestrator.js'

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

function buildServerOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = forwardedProto ? String(forwardedProto).split(',')[0] : req.protocol
  const host = req.get('host')
  return `${proto}://${host}`
}

function parseArtifactMetadata(rawMetadata) {
  if (!rawMetadata) return {}
  if (typeof rawMetadata === 'object') return rawMetadata
  try {
    return JSON.parse(rawMetadata)
  } catch {
    return {}
  }
}

async function loadSubmissionArtifactZipBuffer(submission) {
  const artifactMetadata = parseArtifactMetadata(submission.artifact_metadata)
  return downloadGithubArtifact({
    repository: submission.artifact_repository,
    gitPath: submission.artifact_git_path,
    metadata: artifactMetadata,
  })
}

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
    const { page = 1, pageSize = 20, status, category, sortBy = 'latest' } = req.query
    const result = await CustomOrderModel.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status,
      category,
      sortBy,
    })
    res.json({ success: true, data: result })
  } catch (error) {
    next(error)
  }
})

// 使用短期安装 token 下载交付包（公开）
router.get('/install/:token/download', async (req, res, next) => {
  try {
    const tokenRecord = await CustomOrderArtifactInstallTokenModel.findUsable(req.params.token)
    if (!tokenRecord) {
      return res.status(410).json({
        success: false,
        error: { message: '安装链接已失效或使用次数已耗尽' },
      })
    }

    const submission = await CustomOrderModel.findSubmissionById(tokenRecord.order_id, tokenRecord.submission_id)
    if (!submission || !submission.artifact_repository || !submission.artifact_git_path) {
      return res.status(404).json({ success: false, error: { message: '交付包不存在' } })
    }

    const consumed = await CustomOrderArtifactInstallTokenModel.consume(req.params.token)
    if (!consumed) {
      return res.status(410).json({
        success: false,
        error: { message: '安装链接已失效或使用次数已耗尽' },
      })
    }

    const zipBuffer = await loadSubmissionArtifactZipBuffer(submission)

    const fileName = submission.artifact_file_name || `custom-order-${submission.id}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.send(zipBuffer)
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

    if (order.developer_id && order.developer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: '当前仅被指派开发者可继续提交方案' } })
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

    await CustomOrderModel.createMessage({
      order_id: req.params.id,
      sender_id: req.user.id,
      role: req.user.role === 'admin' ? 'admin' : 'developer',
      content: `开发者提交了新方案：${submission.title}`,
      metadata: { type: 'submission', submission_id: submission.id, needs_assignment: !order.developer_id },
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

// 生成推荐安装命令
router.get('/:id/submissions/:submissionId/artifact/install-command', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限获取安装命令' } })
    }

    const submission = await CustomOrderModel.findSubmissionById(req.params.id, req.params.submissionId)
    if (!submission || !submission.artifact_repository || !submission.artifact_git_path || !submission.artifact_id) {
      return res.status(404).json({ success: false, error: { message: '交付包不存在' } })
    }

    const requestedTtlMinutes = Number.parseInt(String(req.query?.ttlMinutes || ''), 10)
    const ttlMinutes = Number.isFinite(requestedTtlMinutes)
      ? Math.min(60, Math.max(5, requestedTtlMinutes))
      : 20

    const { token, record } = await CustomOrderArtifactInstallTokenModel.issue({
      orderId: req.params.id,
      submissionId: req.params.submissionId,
      artifactId: submission.artifact_id,
      userId: req.user.id,
      maxUses: 3,
      ttlMinutes,
      metadata: {
        userAgent: req.get('user-agent') || null,
        ip: req.ip || null,
        source: 'custom-order-install-command',
      },
    })

    const serverOrigin = buildServerOrigin(req)
    const signedDownloadUrl = `${serverOrigin}/api/custom-orders/install/${token}/download`
    const command = `openclew install "${signedDownloadUrl}"`

    return res.json({
      success: true,
      data: {
        recommended: true,
        command,
        expiresAt: record.expires_at,
        maxUses: record.max_uses,
        signedDownloadUrl,
        fallbackDownloadEndpoint: `${serverOrigin}/api/custom-orders/${req.params.id}/submissions/${req.params.submissionId}/artifact/download`,
      },
    })
  } catch (error) {
    next(error)
  }
})

// 为指定 submission 创建试用会话（强制绑定该 artifact）
router.post('/:id/submissions/:submissionId/trial-sessions', authenticate, async (req, res, next) => {
  try {
    const order = await CustomOrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ success: false, error: { message: '需求不存在' } })
    }
    if (!(await CustomOrderModel.canViewOrder(order, req.user))) {
      return res.status(403).json({ success: false, error: { message: '无权限创建试用会话' } })
    }

    const submission = await CustomOrderModel.findSubmissionById(req.params.id, req.params.submissionId)
    if (!submission || !submission.artifact_repository || !submission.artifact_git_path) {
      return res.status(404).json({ success: false, error: { message: '交付包不存在' } })
    }
    if (!submission.agent_id) {
      return res.status(409).json({
        success: false,
        error: { message: '该方案未关联 Agent，暂无法创建试用会话' },
      })
    }

    const zipBuffer = await loadSubmissionArtifactZipBuffer(submission)
    const artifactSha = String(submission.artifact_sha256 || '')
    if (!artifactSha) {
      return res.status(409).json({
        success: false,
        error: { message: '交付包缺少 hash 元数据，无法校验试用一致性' },
      })
    }

    const cacheDir = path.join(backendRoot, '.trial-runtime', 'custom-order-artifacts')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const localZipPath = path.join(cacheDir, `${artifactSha}.zip`)
    await fsp.writeFile(localZipPath, zipBuffer)

    const parsedManifest = (() => {
      if (!submission.parsed_manifest) return null
      if (typeof submission.parsed_manifest === 'object') return submission.parsed_manifest
      try {
        return JSON.parse(submission.parsed_manifest)
      } catch {
        return null
      }
    })()

    const result = await createTrialSession({
      userId: req.user.id,
      agentId: submission.agent_id,
      packageOverride: {
        localPath: localZipPath,
      },
      metadataPatch: {
        source: 'custom-order-submission-trial',
        custom_order_id: req.params.id,
        custom_order_submission_id: req.params.submissionId,
        artifact_id: submission.artifact_id || null,
        artifact_sha256: artifactSha,
      },
    })

    res.status(201).json({
      success: true,
      data: {
        sessionId: result.session.id,
        status: result.session.status,
        runtimeType: result.session.runtime_type,
        expiresAt: result.session.expires_at,
        remainingTrials: result.remainingTrials,
        provisioning: result.session.metadata?.provisioning || null,
        artifact: {
          id: submission.artifact_id,
          sha256: artifactSha,
          submissionId: req.params.submissionId,
        },
      },
    })
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

    const zipBuffer = await loadSubmissionArtifactZipBuffer(submission)
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
