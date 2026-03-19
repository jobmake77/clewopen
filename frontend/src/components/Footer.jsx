import { Layout as AntLayout } from 'antd'
import { Link } from 'react-router-dom'

const { Footer: AntFooter } = AntLayout

function Footer() {
  return (
    <AntFooter style={{ textAlign: 'center', borderTop: '1px solid var(--cream-border)' }}>
      <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 18 }}>ClewOpen ©2026</div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
        让专业知识可以打包变现
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
        <Link to="/legal/privacy">隐私政策</Link>
        <Link to="/legal/terms">用户协议</Link>
        <Link to="/legal/ai-usage">AI 使用说明</Link>
        <Link to="/legal/complaint">投诉与封禁流程</Link>
      </div>
    </AntFooter>
  )
}

export default Footer
