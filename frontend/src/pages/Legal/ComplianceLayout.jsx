import { useEffect, useState } from 'react'
import { Alert, Card, Descriptions, Space, Spin, Tag, Typography } from 'antd'
import { getComplianceProfile } from '../../services/complianceService'

const { Title, Paragraph, Text } = Typography

function Section({ title, children }) {
  return (
    <Card className="cream-panel" style={{ marginBottom: 16 }}>
      <Title level={4} style={{ marginTop: 0 }}>{title}</Title>
      {children}
    </Card>
  )
}

export default function ComplianceLayout({ title, subtitle, sections }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let alive = true
    getComplianceProfile()
      .then((payload) => {
        if (!alive) return
        setProfile(payload?.data || null)
      })
      .catch(() => {
        if (!alive) return
        setProfile(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="page-shell">
      <section style={{ padding: '20px 0 12px' }}>
        <p className="section-label">Compliance Center</p>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p style={{ color: 'var(--ink-muted)', marginTop: 12 }}>{subtitle}</p>
      </section>

      <Spin spinning={loading}>
        {profile && (
          <Card className="cream-panel" style={{ marginBottom: 16 }}>
            <Descriptions title="公开合规信息" column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label="数据存储地">{profile.dataStorageRegion}</Descriptions.Item>
              <Descriptions.Item label="对象存储地">{profile.objectStorageRegion}</Descriptions.Item>
              <Descriptions.Item label="备份存储地">{profile.backupRegion}</Descriptions.Item>
              <Descriptions.Item label="策略版本">{profile.policyVersion}</Descriptions.Item>
              <Descriptions.Item label="投诉邮箱">{profile.complaintEmail}</Descriptions.Item>
              <Descriptions.Item label="合规邮箱">{profile.supportEmail}</Descriptions.Item>
            </Descriptions>
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>第三方模型/平台提供方：</Text>
            </Paragraph>
            <Space wrap style={{ marginBottom: 8 }}>
              {(profile.thirdPartyProviders || []).map((provider) => (
                <Tag key={provider}>{provider}</Tag>
              ))}
            </Space>
            {profile.activeTrialModel && (
              <Alert
                type="info"
                showIcon
                message={`当前试用模型：${profile.activeTrialModel.provider} / ${profile.activeTrialModel.model}`}
                description={profile.activeTrialModel.apiUrl}
                style={{ marginTop: 8 }}
              />
            )}
          </Card>
        )}
      </Spin>

      {sections.map((entry) => (
        <Section key={entry.title} title={entry.title}>
          {entry.content}
        </Section>
      ))}
    </div>
  )
}
