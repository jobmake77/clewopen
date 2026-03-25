import { useMemo } from 'react'
import { Button, List, Space, Typography, message } from 'antd'
import { CopyOutlined, MailOutlined } from '@ant-design/icons'
import ComplianceLayout from './ComplianceLayout'

const { Paragraph, Text } = Typography

export default function ComplaintPolicy() {
  const complaintEmail = 'support@clewopen.com'
  const complaintSubject = '[投诉/封禁申诉] 订单号/AgentID'
  const mailtoHref = useMemo(
    () => `mailto:${complaintEmail}?subject=${encodeURIComponent(complaintSubject)}`,
    [complaintEmail],
  )

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(complaintEmail)
      message.success('投诉邮箱已复制')
    } catch {
      message.error('复制失败，请手动复制邮箱地址')
    }
  }

  const sections = [
    {
      title: '1. 投诉受理范围',
      content: (
        <List
          size="small"
          dataSource={[
            '侵权投诉：版权、商标、名誉权、隐私权等。',
            '安全投诉：恶意代码、钓鱼、滥用接口、攻击行为。',
            '内容投诉：违法违规、有害内容、虚假误导信息。',
          ]}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      ),
    },
    {
      title: '2. 处置与封禁流程',
      content: (
        <List
          size="small"
          dataSource={[
            '接收投诉后进行工单登记与初步核验。',
            '必要时先行下架/限流，随后进入人工复核。',
            '根据规则执行：恢复、警告、限期整改、封禁账号或永久下架。',
            '支持申诉，复核通过后可恢复相关权限。',
          ]}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      ),
    },
    {
      title: '3. 证据与时效',
      content: (
        <>
          <Paragraph>投诉时请尽量提供资源链接、截图、权属证明和联系方式，以便快速处理。</Paragraph>
          <Paragraph>
            对于恶意滥用、重复违规或规避风控行为，平台将升级处罚并保留依法追责权利。
          </Paragraph>
        </>
      ),
    },
    {
      title: '4. 联系方式',
      content: (
        <>
          <Paragraph>
            你可以通过投诉邮箱提交材料，邮件主题建议使用：
            <Text code>{complaintSubject}</Text>
          </Paragraph>
          <Space wrap style={{ marginBottom: 12 }}>
            <Button type="primary" icon={<MailOutlined />} href={mailtoHref}>
              发送投诉邮件
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyEmail}>
              复制邮箱
            </Button>
            <Text copyable>{complaintEmail}</Text>
          </Space>
          <Paragraph style={{ marginBottom: 4 }}>
            <Text type="secondary">受理时间：工作日 24 小时内首次响应。</Text>
          </Paragraph>
          <Paragraph style={{ marginBottom: 0 }}>
            <Text type="secondary">说明：当前页面先上线流程与入口，后续可接入工单系统与自动化通知。</Text>
          </Paragraph>
        </>
      ),
    },
  ]

  return (
    <ComplianceLayout
      title="投诉与封禁流程"
      subtitle="明确违规处理标准，保障平台用户和开发者权益。"
      sections={sections}
    />
  )
}
