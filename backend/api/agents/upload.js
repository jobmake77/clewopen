import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import AgentModel from '../../models/Agent.js'
import { validateAgentPackage } from '../../utils/manifestValidator.js'
import { runAgentAutoReview } from '../../utils/agentAutoReview.js'
import { scanAgentPackageSensitiveContent } from '../../utils/agentSensitiveReview.js'
import { runPolicyAgentReview } from '../../services/agentPolicyReviewService.js'
import { logger } from '../../config/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '../..')

function resolveStoredPackagePath(packageUrl) {
  return path.join(backendRoot, String(packageUrl || '').replace(/^\/+/, ''))
}

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(backendRoot, 'uploads/agents')

    // 确保上传目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 只允许 zip 文件
  if (file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      path.extname(file.originalname).toLowerCase() === '.zip') {
    cb(null, true)
  } else {
    cb(new Error('只支持 .zip 格式的 Agent 包'))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  }
})

function buildSensitiveRejectMessage(sensitiveReview) {
  const highFindings = (sensitiveReview?.findings || []).filter((item) => item.severity === 'high')
  if (highFindings.length === 0) {
    return '检测到高危敏感信息，上传已拒绝。请移除密钥、证件、私钥等内容后重试。'
  }
  const first = highFindings[0]
  return `检测到高危敏感信息，上传已拒绝。文件: ${first.file}，类型: ${first.category}，位置: ${first.line ? `第 ${first.line} 行` : '未知行'}。请清理后重试。`
}

function buildUploadReviewMessage({ autoRejected, sensitiveReview, policyReview }) {
  if (autoRejected) {
    if (sensitiveReview?.summary?.highCount > 0) {
      return buildSensitiveRejectMessage(sensitiveReview)
    }
    if (policyReview?.decision === 'reject') {
      return '平台策略审核拒绝，请根据审核建议修复后重新提交。'
    }
    return 'Agent 已被自动审核拒绝，请修复后重新提交'
  }

  if (sensitiveReview?.summary?.mediumCount > 0) {
    if (policyReview?.status === 'completed' && policyReview?.decision === 'pass') {
      return 'Agent 上传成功，已完成策略复核，等待人工审核'
    }
    return 'Agent 上传成功，检测到中危信息，已进入平台策略复核与人工审核'
  }

  return 'Agent 上传成功，已通过自动审核，等待人工审核'
}

function buildAgentSlug(name = '') {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${base || 'agent'}-${Date.now()}`
}

/**
 * 上传 Agent 包
 */
export const uploadAgent = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传 Agent 包文件'
      })
    }

    const userId = req.user.id
    const { name, description, category, version, tags, publish_mode } = req.body

    // 验证必填字段
    if (!name || !description || !category || !version) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：name, description, category, version'
      })
    }

    // 验证 Agent 包和 manifest.json
    logger.info(`开始验证 Agent 包: ${req.file.path}`)
    const validationResult = validateAgentPackage(req.file.path)

    if (!validationResult.valid) {
      fs.unlinkSync(req.file.path)
      logger.warn(`Agent 包验证失败: ${validationResult.errors.join(', ')}`)
      return res.status(400).json({
        success: false,
        error: 'Agent 包验证失败',
        details: validationResult.errors
      })
    }

    // 记录警告信息（如果有）
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      logger.info(`Agent 包验证警告: ${validationResult.warnings.join(', ')}`)
    }

    logger.info(`Agent 包验证成功: name=${validationResult.manifest?.name || '-'}, version=${validationResult.manifest?.version || '-'}`)

    // 使用 manifest 中的信息（如果提供）
    const manifest = validationResult.manifest
    const publishMode = ['open', 'commercial'].includes(String(publish_mode || '').toLowerCase())
      ? String(publish_mode).toLowerCase()
      : 'open'
    const autoReviewResult = runAgentAutoReview({
      manifest,
      files: validationResult.files,
      validationWarnings: validationResult.warnings,
    })
    const sensitiveReview = scanAgentPackageSensitiveContent(req.file.path)
    const policyReview =
      sensitiveReview.decision === 'needs_review'
        ? await runPolicyAgentReview({
            resourceType: 'agent',
            manifest: {
              name: manifest?.name || name,
              version: manifest?.version || version,
              category: manifest?.category || category,
            },
            sensitiveReview: {
              summary: sensitiveReview.summary,
              findings: sensitiveReview.findings,
            },
            autoReviewResult,
          })
        : {
            enabled: false,
            status: 'skipped',
            decision: 'pending',
            message: '未触发平台 Agent 复核',
          }

    const highSensitiveRejected = sensitiveReview.decision === 'reject'
    const policyRejected = policyReview.decision === 'reject'
    const autoRejected = autoReviewResult.decision === 'reject' || highSensitiveRejected || policyRejected
    const nextReviewStage = autoRejected ? 'rejected' : 'pending_manual'
    const mergedReviewResult = {
      ...autoReviewResult,
      sensitive_review: {
        decision: sensitiveReview.decision,
        summary: sensitiveReview.summary,
        findings: sensitiveReview.findings,
        remediation: sensitiveReview.remediation || [],
      },
      policy_review: policyReview,
    }

    const agentData = {
      name: name || manifest.name,
      slug: buildAgentSlug(name || manifest.name),
      description: description || manifest.description,
      category: category || manifest.category || 'other',
      version: version || manifest.version,
      author_id: userId,
      package_url: `/uploads/agents/${req.file.filename}`,
      tags: tags ? JSON.parse(tags) : (manifest.tags || []),
      status: autoRejected ? 'rejected' : 'pending',
      review_stage: nextReviewStage,
      auto_review_result: mergedReviewResult,
      publish_mode: publishMode,
      publish_status: 'not_published',
      manifest: manifest // 保存完整的 manifest 信息
    }

    // 创建 Agent 记录
    const agent = await AgentModel.create(agentData)

    res.status(201).json({
      success: true,
      data: agent,
      message: buildUploadReviewMessage({
        autoRejected,
        sensitiveReview,
        policyReview,
      }),
      validation: {
        manifest: validationResult.manifest,
        files: validationResult.files,
        warnings: validationResult.warnings || []
      },
      review: mergedReviewResult,
    })
  } catch (error) {
    // 如果创建失败，删除已上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    next(error)
  }
}

/**
 * 更新 Agent
 */
export const updateAgent = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const { name, description, category, version, price, tags } = req.body

    // 检查 Agent 是否存在
    const agent = await AgentModel.findById(id)

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent 不存在'
      })
    }

    // 检查权限
    if (agent.author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '无权限修改此 Agent'
      })
    }

    // 更新 Agent
    const updateData = {}
    if (name) updateData.name = name
    if (description) updateData.description = description
    if (category) updateData.category = category
    if (version) updateData.version = version
    if (price) updateData.price = JSON.parse(price)
    if (tags) updateData.tags = JSON.parse(tags)

    // 如果上传了新文件
    if (req.file) {
      // 删除旧文件
      const oldFilePath = resolveStoredPackagePath(agent.package_url)
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath)
      }

      updateData.package_url = `/uploads/agents/${req.file.filename}`
    }

    const updatedAgent = await AgentModel.update(id, updateData)

    res.json({
      success: true,
      data: updatedAgent,
      message: 'Agent 更新成功'
    })
  } catch (error) {
    // 如果更新失败，删除新上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    next(error)
  }
}

/**
 * 删除 Agent
 */
export const deleteAgent = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // 检查 Agent 是否存在
    const agent = await AgentModel.findById(id)

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent 不存在'
      })
    }

    // 检查权限
    if (agent.author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '无权限删除此 Agent'
      })
    }

    // 删除文件
    const filePath = resolveStoredPackagePath(agent.package_url)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // 软删除 Agent
    await AgentModel.delete(id)

    res.json({
      success: true,
      message: 'Agent 删除成功'
    })
  } catch (error) {
    next(error)
  }
}
