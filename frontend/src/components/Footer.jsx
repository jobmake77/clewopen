import { Layout as AntLayout } from 'antd'

const { Footer: AntFooter } = AntLayout

function Footer() {
  return (
    <AntFooter style={{ textAlign: 'center', background: '#f0f0f0' }}>
      <div>OpenCLEW ©2026 - AI Agent 市场平台</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
        让专业知识可以打包变现
      </div>
    </AntFooter>
  )
}

export default Footer
