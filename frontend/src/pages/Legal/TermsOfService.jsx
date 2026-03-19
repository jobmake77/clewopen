import { List, Typography } from 'antd'
import ComplianceLayout from './ComplianceLayout'

const { Paragraph } = Typography

const sections = [
  {
    title: '1. 服务范围',
    content: (
      <Paragraph>
        ClewOpen 提供 Agent/Skill/MCP 发布、下载、试用和社区互动服务。你需遵守适用法律法规及平台规则。
      </Paragraph>
    ),
  },
  {
    title: '2. 用户义务',
    content: (
      <List
        size="small"
        dataSource={[
          '不得上传违法、有害、侵权或恶意代码内容。',
          '不得利用平台进行未授权攻击、爬虫滥用或商业转售违规行为。',
          '不得使用自动化手段刷榜、刷评、刷下载等扰乱秩序行为。',
        ]}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    ),
  },
  {
    title: '3. 平台权利',
    content: (
      <Paragraph>
        对于违规内容或账号，平台可采取下架、限流、禁言、封禁、删除内容等处置，并保留追责权利。
      </Paragraph>
    ),
  },
  {
    title: '4. 责任限制',
    content: (
      <Paragraph>
        平台将尽力保障稳定性与安全性，但不对第三方模型服务中断、网络波动、不可抗力导致的损失承担无限责任。
      </Paragraph>
    ),
  },
]

export default function TermsOfService() {
  return (
    <ComplianceLayout
      title="用户协议"
      subtitle="使用本平台即表示你已阅读并同意本协议。"
      sections={sections}
    />
  )
}
