import { Layout as AntLayout } from 'antd'

const { Footer: AntFooter } = AntLayout

function Footer() {
  return (
    <AntFooter style={{ textAlign: 'center', borderTop: '1px solid var(--cream-border)' }}>
      <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 18 }}>ClewOpen ©2026</div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
        让专业知识可以打包变现
      </div>
    </AntFooter>
  )
}

export default Footer
