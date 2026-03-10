import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import AgentModel from '../../models/Agent.js'
import { validateAgentPackage } from '../../utils/manifestValidator.js'
import { logger } from '../../config/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/agents')

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
    const { name, description, category, version, price, tags } = req.body

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

    logger.info(`Agent 包验证成功，manifest: ${JSON.stringify(validationResult.manifest)}`)

    // 使用 manifest 中的信息（如果提供）
    const manifest = validationResult.manifest
    const agentData = {
      name: name || manifest.name,
      description: description || manifest.description,
      category: category || manifest.category || 'other',
      version: version || manifest.version,
      author_id: userId,
      package_url: `/uploads/agents/${req.file.filename}`,
      price: price ? JSON.parse(price) : (manifest.price || { type: 'free', amount: 0 }),
      tags: tags ? JSON.parse(tags) : (manifest.tags || []),
      status: 'pending',
      manifest: manifest // 保存完整的 manifest 信息
    }

    // 创建 Agent 记录
    const agent = await AgentModel.create(agentData)

    res.status(201).json({
      success: true,
      data: agent,
      message: 'Agent 上传成功，等待审核',
      validation: {
        manifest: validationResult.manifest,
        files: validationResult.files,
        warnings: validationResult.warnings || []
      }
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
      const oldFilePath = path.join(__dirname, '../../../', agent.package_url)
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
    const filePath = path.join(__dirname, '../../../', agent.package_url)
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
