import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Card, Button, Tag, Rate, Divider, Spin, Tabs, message, Space } from 'antd'
import { DownloadOutlined, LinkOutlined, GithubOutlined } from '@ant-design/icons'
import { fetchMcpDetail } from '../../store/slices/mcpSlice'
import api from '../../services/api'
import { visitMcp } from '../../services/mcpService'

const sourceLabelMap = {
  github: 'GitHub',
  manual: '平台上传',
  external: '外部来源',
}

function McpDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { currentMcp: current, loading } = useSelector((state) => state.mcp)
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [downloading, setDownloading] = useState(false)
  const [openingSource, setOpeningSource] = useState(false)

  const tags = useMemo(() => {
    if (!current?.tags) return []
    return Array.isArray(current.tags) ? current.tags : String(current.tags).split(',').map(tag => tag.trim()).filter(Boolean)
  }, [current])

  useEffect(() => {
    dispatch(fetchMcpDetail(id))
  }, [dispatch, id])

  const handleDownload = async () => {
    if (!isAuthenticated) {
      message.warning('请先登录')
      navigate('/login')
      return
    }
    setDownloading(true)
    try {
      const response = await api.post(`/mcps/${id}/download`, {}, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${current.name}-${current.version}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      message.success('下载成功')
      dispatch(fetchMcpDetail(id))
    } catch (error) {
      message.error(error.response?.data?.error?.message || error.response?.data?.error || '下载失败')
    } finally {
      setDownloading(false)
    }
  }

  const handleVisitSource = async () => {
    if (!current?.external_url) return
    setOpeningSource(true)
    try {
      const response = await visitMcp(id)
      const targetUrl = response.data?.external_url || current.external_url
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
      message.success('已打开外部资源')
      dispatch(fetchMcpDetail(id))
    } catch (error) {
      message.error(error.response?.data?.error?.message || '打开外部资源失败')
    } finally {
      setOpeningSource(false)
    }
  }

  if (loading || !current) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  const isExternal = current.source_type === 'external'
  const sourceLabel = sourceLabelMap[current.source_platform] || (isExternal ? '外部资源' : '平台上传')

  const tabItems = [
    {
      key: 'overview',
      label: '概述',
      children: (
        <div>
          <h3>功能描述</h3>
          <p>{current.description}</p>

          {isExternal && current.external_url && (
            <>
              <h3>资源来源</h3>
              <p>这是一个由平台聚合展示的外部 MCP，实际内容托管在 {sourceLabel}。</p>
              <p><a href={current.external_url} target="_blank" rel="noreferrer">{current.external_url}</a></p>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="page-shell" style={{ paddingTop: 10 }}>
      <div style={{ marginBottom: 18 }}>
        <p className="section-label">{current.category || 'MCP Detail'}</p>
      </div>
      <Row gutter={24}>
        <Col span={16}>
          <Card className="cream-panel">
            <div style={{ marginBottom: 24 }}>
              <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
                <Tag color={isExternal ? 'geekblue' : 'blue'}>{sourceLabel}</Tag>
                {current.category && <Tag color="magenta">{current.category}</Tag>}
                {tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </Space>
              <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)' }}>{current.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                <span><Rate disabled value={Number(current.rating_average || 0)} /> ({current.reviews_count || 0} 评价)</span>
                {isExternal ? (
                  <>
                    <span><GithubOutlined /> {current.github_stars || 0} Stars</span>
                    <span><LinkOutlined /> {current.visits_count || 0} 次访问</span>
                  </>
                ) : (
                  <span><DownloadOutlined /> {current.downloads_count || 0} 下载</span>
                )}
              </div>
            </div>
            <Divider />
            <Tabs items={tabItems} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="cream-panel" style={{ position: 'sticky', top: 86 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: '100%', height: 200, background: 'linear-gradient(135deg, var(--status-purple) 0%, var(--status-danger) 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, marginBottom: 16, color: '#fff' }}>
                M
              </div>
            </div>

            {isExternal ? (
              <>
                <Button type="primary" size="large" block icon={<GithubOutlined />} style={{ marginBottom: 12 }} onClick={handleVisitSource} loading={openingSource}>
                  查看源码
                </Button>
              </>
            ) : (
              <Button type="primary" size="large" block icon={<DownloadOutlined />} style={{ marginBottom: 12 }} onClick={handleDownload} loading={downloading}>
                下载 MCP
              </Button>
            )}
            <Divider />
            <div>
              <h4>MCP 信息</h4>
              <p><strong>版本:</strong> {current.version}</p>
              <p><strong>作者:</strong> {current.author_name}</p>
              <p><strong>分类:</strong> {current.category}</p>
              <p><strong>来源:</strong> {sourceLabel}</p>
              <p><strong>更新时间:</strong> {current.updated_at ? new Date(current.updated_at).toLocaleDateString() : '-'}</p>
              {isExternal && (
                <p><strong>上次同步:</strong> {current.last_synced_at ? new Date(current.last_synced_at).toLocaleDateString() : '-'}</p>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default McpDetail
