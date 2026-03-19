import { List, Typography } from 'antd'
import ComplianceLayout from './ComplianceLayout'

const { Paragraph, Text } = Typography

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
      <Paragraph>
        你可以通过页面顶部“公开合规信息”里的投诉邮箱提交材料。我们会在合理时间内反馈处理进度。
        <br />
        <Text type="secondary">说明：当前页面先上线流程与入口，后续可接入工单系统与自动化通知。</Text>
      </Paragraph>
    ),
  },
]

export default function ComplaintPolicy() {
  return (
    <ComplianceLayout
      title="投诉与封禁流程"
      subtitle="明确违规处理标准，保障平台用户和开发者权益。"
      sections={sections}
    />
  )
}
