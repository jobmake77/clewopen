import { List, Typography } from 'antd'
import ComplianceLayout from './ComplianceLayout'

const { Paragraph } = Typography

const sections = [
  {
    title: '1. AI 输出说明',
    content: (
      <Paragraph>
        Agent 试用输出由第三方大模型与用户输入共同决定，可能出现不完整、偏差或过时内容。请勿直接作为医疗、法律、投资等高风险决策依据。
      </Paragraph>
    ),
  },
  {
    title: '2. 建议使用方式',
    content: (
      <List
        size="small"
        dataSource={[
          '将 AI 结果作为草稿，再由人工复核。',
          '避免输入敏感个人信息、核心商业机密或未授权数据。',
          '在生产场景上线前，进行充分测试与风险评估。',
        ]}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    ),
  },
  {
    title: '3. 模型提供方与数据流向',
    content: (
      <>
        <Paragraph>
          平台会调用第三方模型提供方进行推理服务。提交到试用框中的内容可能发送到对应模型服务端进行处理。
        </Paragraph>
        <Paragraph>公开页面仅展示第三方处理方类别与数据用途，不展示具体模型厂商品牌。</Paragraph>
      </>
    ),
  },
]

export default function AiUsageGuide() {
  return (
    <ComplianceLayout
      title="AI 使用说明"
      subtitle="帮助你安全、清晰地使用 Agent 试用能力。"
      sections={sections}
    />
  )
}
