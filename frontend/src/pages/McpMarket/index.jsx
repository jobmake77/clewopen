import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Input, Select, Pagination, Spin, Alert, Tabs } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchMcps } from '../../store/slices/mcpSlice'
import ResourceCard from '../../components/ResourceCard'

const { Search } = Input

const sortOptions = [
  { label: '最新上架', value: 'latest' },
  { label: '星数最多', value: 'stars' },
]

const tagFilters = [
  { label: '全部', value: 'all' },
  { label: 'MCP', value: 'mcp' },
  { label: 'AI', value: 'ai' },
  { label: 'MCP Server', value: 'mcp-server' },
  { label: 'Claude', value: 'claude' },
  { label: 'LLM', value: 'llm' },
  { label: 'AI Agents', value: 'ai-agents' },
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Automation', value: 'automation' },
  { label: 'MCP Client', value: 'mcp-client' },
  { label: 'Developer Tools', value: 'developer-tools' },
]

function McpMarket() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { list, total, loading, error } = useSelector((state) => state.mcp)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [activeTag, setActiveTag] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('latest')
  const [sourcePlatform, setSourcePlatform] = useState('all')
  const mergedSearch = [search, activeTag !== 'all' ? activeTag : ''].filter(Boolean).join(' ').trim()

  useEffect(() => {
    dispatch(fetchMcps({
      page,
      pageSize,
      search: mergedSearch || undefined,
      sort,
      sourcePlatform: sourcePlatform === 'all' ? undefined : sourcePlatform,
    }))
  }, [dispatch, page, pageSize, mergedSearch, sort, sourcePlatform])

  const handleSearch = (value) => {
    setSearch(value)
    setPage(1)
  }

  const handleSortChange = (value) => {
    setSort(value)
    setPage(1)
  }

  const handleSourcePlatformChange = (value) => {
    setSourcePlatform(value)
    setPage(1)
  }

  const handleTagChange = (value) => {
    setActiveTag(value)
    setPage(1)
  }

  return (
    <div className="page-shell">
      {/* 标题 */}
      <div style={{ marginBottom: 24, paddingTop: 12 }}>
        <p className="section-label">MCP Library</p>
        <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)', marginBottom: 8 }}>MCP 库</h1>
        <p style={{ color: 'var(--ink-muted)' }}>
          发现和使用 MCP 服务包，为 Agent 提供外部能力接入
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Tabs
          activeKey={activeTag}
          onChange={handleTagChange}
          items={tagFilters.map((item) => ({ key: item.value, label: item.label }))}
        />
      </div>

      {/* 搜索栏 + 排序 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Search
          placeholder="搜索 MCP..."
          allowClear
          enterButton={<SearchOutlined />}
          size="large"
          onSearch={handleSearch}
          style={{ flex: 1 }}
        />
        <Select
          value={sourcePlatform}
          onChange={handleSourcePlatformChange}
          style={{ width: 140, flexShrink: 0 }}
          size="large"
          options={[
            { label: '全部来源', value: 'all' },
            { label: 'GitHub', value: 'github' },
            { label: '平台上传', value: 'manual' },
          ]}
        />
        <Select
          value={sort}
          onChange={handleSortChange}
          style={{ width: 140, flexShrink: 0 }}
          size="large"
          options={sortOptions}
        />
      </div>

      {error && (
        <Alert
          message="数据加载失败"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 卡片网格 */}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          {list.map((item) => (
            <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
              <ResourceCard
                item={item}
                resourceType="mcp"
                onClick={(item) => navigate(`/mcps/${item.id}`)}
              />
            </Col>
          ))}
        </Row>
      </Spin>

      {/* 分页 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={setPage}
          showSizeChanger={false}
          showTotal={(total) => `共 ${total} 个 MCP`}
        />
      </div>
    </div>
  )
}

export default McpMarket
