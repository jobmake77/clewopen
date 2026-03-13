import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { validateResourcePackage } from '../../utils/manifestValidator.js'
import { logger } from '../../config/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 创建通用资源上传处理器
 * @param {object} Model - 资源 Model
 * @param {string} uploadDir - 上传子目录名称 ('skills' | 'mcps')
 * @param {string} resourceLabel - 显示名称
 * @param {string} resourceType - 资源类型 ('skill' | 'mcp')
 */
export function createResourceUpload(Model, uploadDir, resourceLabel, resourceType) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, `../../../uploads/${uploadDir}`)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
  })

  const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true)
    } else {
      cb(new Error(`只支持 .zip 格式的 ${resourceLabel} 包`))
    }
  }

  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 }
  })

  const uploadItem = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: `请上传 ${resourceLabel} 包文件` })
      }

      const userId = req.user.id
      const { name, description, category, version, tags } = req.body

      if (!name || !description || !category || !version) {
        fs.unlinkSync(req.file.path)
        return res.status(400).json({
          success: false,
          error: '缺少必填字段：name, description, category, version'
        })
      }

      logger.info(`开始验证 ${resourceLabel} 包: ${req.file.path}`)
      const validationResult = validateResourcePackage(req.file.path, resourceType)

      if (!validationResult.valid) {
        fs.unlinkSync(req.file.path)
        logger.warn(`${resourceLabel} 包验证失败: ${validationResult.errors.join(', ')}`)
        return res.status(400).json({
          success: false,
          error: `${resourceLabel} 包验证失败`,
          details: validationResult.errors
        })
      }

      if (validationResult.warnings?.length > 0) {
        logger.info(`${resourceLabel} 包验证警告: ${validationResult.warnings.join(', ')}`)
      }

      const manifest = validationResult.manifest
      const data = {
        name: name || manifest.name,
        description: description || manifest.description,
        category: category || manifest.category || 'other',
        version: version || manifest.version,
        author_id: userId,
        package_url: `/uploads/${uploadDir}/${req.file.filename}`,
        external_url: null,
        tags: tags ? JSON.parse(tags) : (manifest.tags || []),
        status: 'pending',
        manifest,
        source_type: 'uploaded',
        source_platform: 'manual',
        source_id: `uploaded:${(name || manifest.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`,
        slug: (name || manifest.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now(),
      }

      const item = await Model.create(data)

      res.status(201).json({
        success: true,
        data: item,
        message: `${resourceLabel} 上传成功，等待审核`,
        validation: {
          manifest: validationResult.manifest,
          files: validationResult.files,
          warnings: validationResult.warnings || []
        }
      })
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      next(error)
    }
  }

  const updateItem = async (req, res, next) => {
    try {
      const { id } = req.params
      const userId = req.user.id
      const { name, description, category, version, tags } = req.body

      const item = await Model.findById(id)
      if (!item) {
        return res.status(404).json({ success: false, error: `${resourceLabel} 不存在` })
      }

      if (item.author_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: `无权限修改此 ${resourceLabel}` })
      }

      const updateData = {}
      if (name) updateData.name = name
      if (description) updateData.description = description
      if (category) updateData.category = category
      if (version) updateData.version = version
      if (tags) updateData.tags = JSON.parse(tags)

      if (req.file) {
        const oldFilePath = path.join(__dirname, '../../../', item.package_url)
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath)
        }
        updateData.package_url = `/uploads/${uploadDir}/${req.file.filename}`
      }

      const updated = await Model.update(id, updateData)
      res.json({ success: true, data: updated, message: `${resourceLabel} 更新成功` })
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
      next(error)
    }
  }

  const deleteItem = async (req, res, next) => {
    try {
      const { id } = req.params
      const userId = req.user.id

      const item = await Model.findById(id)
      if (!item) {
        return res.status(404).json({ success: false, error: `${resourceLabel} 不存在` })
      }

      if (item.author_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: `无权限删除此 ${resourceLabel}` })
      }

      const filePath = path.join(__dirname, '../../../', item.package_url)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      await Model.delete(id)
      res.json({ success: true, message: `${resourceLabel} 删除成功` })
    } catch (error) {
      next(error)
    }
  }

  return { upload, uploadItem, updateItem, deleteItem }
}
