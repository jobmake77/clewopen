import { List, Typography } from 'antd'
import ComplianceLayout from './ComplianceLayout'

const { Paragraph, Text } = Typography

const sections = [
  {
    title: '1. 我们收集的数据',
    content: (
      <>
        <Paragraph>我们仅收集运行服务所必需的信息：账号资料、上传内容、试用会话输入输出、访问日志与运营指标。</Paragraph>
        <Paragraph>
          <Text strong>默认不采集敏感个人信息</Text>（如身份证号、银行卡号、生物特征等）。
        </Paragraph>
      </>
    ),
  },
  {
    title: '2. 数据用途与最小化原则',
    content: (
      <List
        size="small"
        dataSource={[
          '用于账号登录、资源发布、下载和评分等核心功能。',
          '用于试用沙盒运行、问题排查与安全审计。',
          '用于统计分析（如热榜、访问趋势），不用于出售用户数据。',
        ]}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    ),
  },
  {
    title: '3. 数据保留周期',
    content: (
      <>
        <Paragraph>试用消息默认保留 30 天；访问日志/行为日志默认保留 90 天；到期由系统自动清理。</Paragraph>
        <Paragraph>如法律法规或争议处理需要，平台可在最小范围内延长保留期限。</Paragraph>
      </>
    ),
  },
  {
    title: '4. 数据安全',
    content: (
      <>
        <Paragraph>平台会进行日志脱敏处理，不记录原始密钥明文到日志。</Paragraph>
        <Paragraph>第三方模型 API Key 可启用主密钥加密存储，防止数据库明文泄露风险。</Paragraph>
      </>
    ),
  },
]

export default function PrivacyPolicy() {
  return (
    <ComplianceLayout
      title="隐私政策"
      subtitle="本政策说明 ClewOpen 如何收集、使用、存储和保护你的信息。"
      sections={sections}
    />
  )
}
