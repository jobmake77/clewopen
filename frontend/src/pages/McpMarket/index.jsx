import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Row, Col, Input, Select, Pagination, Spin, Alert } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchMcps } from '../../store/slices/mcpSlice'
import ResourceCard from '../../components/ResourceCard'

const { Search } = Input

const sortOptions = [
  { label: '综合排序', value: 'default' },
  { label: '星数最多', value: 'stars' },
]

function McpMarket() {
  const dispatch = useDispatch()
  const { list, total, loading, error } = useSelector((state) => state.mcp)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('default')

  useEffect(() => {
    dispatch(fetchMcps({
      page,
      pageSize,
      search: search || undefined,
      sort: sort === 'default' ? undefined : sort,
    }))
  }, [dispatch, page, pageSize, search, sort])

  const handleSearch = (value) => {
    setSearch(value)
    setPage(1)
  }

  const handleSortChange = (value) => {
    setSort(value)
    setPage(1)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* 标题 */}
      <div style={{ marginBottom: 24 }}>
        <h1>MCP 库</h1>
        <p style={{ color: '#666' }}>
          发现和使用 MCP 服务包，为 Agent 提供外部能力接入
        </p>
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
                onClick={(item) => item.package_url && window.open(item.package_url, '_blank')}
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
