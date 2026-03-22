import { Router } from 'express'

const router = Router()

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

router.get('/public', async (req, res) => {
  res.json({
    success: true,
    data: {
      dataStorageRegion: process.env.DATA_STORAGE_REGION || '香港',
      objectStorageRegion: process.env.OBJECT_STORAGE_REGION || '香港',
      backupRegion: process.env.BACKUP_STORAGE_REGION || '未配置',
      migrationPlanSummary:
        process.env.DOMESTIC_MIGRATION_PLAN ||
        '支持迁移到中国内地节点，数据库和对象存储可通过导出/增量同步切换。',
      thirdPartyProviders: parseList(process.env.THIRD_PARTY_PROVIDER_CATEGORIES).length > 0
        ? parseList(process.env.THIRD_PARTY_PROVIDER_CATEGORIES)
        : [
          '第三方模型服务商（动态调整）',
          '代码托管与制品分发服务',
          '云基础设施与对象存储服务',
        ],
      thirdPartyProcessorCategories: parseList(process.env.THIRD_PARTY_PROCESSOR_CATEGORIES).length > 0
        ? parseList(process.env.THIRD_PARTY_PROCESSOR_CATEGORIES)
        : ['模型推理处理', '文件存储与分发', '安全监控与风控'],
      supportEmail: process.env.COMPLIANCE_CONTACT_EMAIL || 'compliance@clewopen.com',
      complaintEmail: process.env.COMPLAINT_CONTACT_EMAIL || 'abuse@clewopen.com',
      policyVersion: process.env.POLICY_VERSION || '2026-03-19',
      sensitiveDataCollection: '默认不采集身份证件、银行卡、生物特征等敏感个人信息',
      rawSecretStorage: '服务端不记录原始密钥日志；LLM API Key 可使用主密钥加密存储',
      trainingPolicy: '试用输入与附件不会用于模型训练',
      retentionPolicy: {
        trialMessageDays: Number.parseInt(process.env.TRIAL_MESSAGE_RETENTION_DAYS || '30', 10),
        accessLogDays: Number.parseInt(process.env.ACCESS_LOG_RETENTION_DAYS || '90', 10),
        notificationDays: Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '90', 10),
      },
    },
  })
})

export default router
