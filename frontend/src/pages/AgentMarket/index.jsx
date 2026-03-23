import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Input, Pagination, Spin, Alert, Tabs } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchAgents, fetchPlatformStats } from '../../store/slices/agentSlice'
import ResourceCard from '../../components/ResourceCard'

const { Search } = Input

const categoryLabelMap = {
  development: '开发工具',
  'data-analysis': '数据分析',
  automation: '自动化',
  content: '内容创作',
  business: '商业分析',
  education: '教育培训',
  other: '其他',
}

function AgentMarket() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { list, total, loading, error, stats } = useSelector((state) => state.agent)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [category, setCategory] = useState('全部')
  const [search, setSearch] = useState('')

  useEffect(() => {
    dispatch(fetchPlatformStats())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchAgents({
      page,
      pageSize,
      category: category === '全部' ? undefined : category,
      search: search || undefined,
    }))
  }, [dispatch, page, pageSize, category, search])

  const handleSearch = (value) => {
    setSearch(value)
    setPage(1)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    setPage(1)
  }

  const dynamicCategoryItems = Array.isArray(stats?.categories)
    ? stats.categories
      .map((entry) => ({
        key: entry?.category,
        label: categoryLabelMap[entry?.category] || entry?.category,
      }))
      .filter((entry) => entry.key)
    : []

  const fallbackCategoryItems = Array.from(new Set(list.map((item) => item.category).filter(Boolean))).map((value) => ({
    key: value,
    label: categoryLabelMap[value] || value,
  }))

  const categoryTabs = [{ key: '全部', label: '全部' }, ...(dynamicCategoryItems.length > 0 ? dynamicCategoryItems : fallbackCategoryItems)]

  return (
    <div className="page-shell">
      <div style={{ marginBottom: 24, paddingTop: 12 }}>
        <p className="section-label">Agent Library</p>
        <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)', marginBottom: 8 }}>Agent 库</h1>
        <p style={{ color: 'var(--ink-muted)' }}>
          浏览全部可用 Agent，按场景筛选并进入详情试用与下载
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Search
          placeholder="搜索 Agent..."
          allowClear
          enterButton={<SearchOutlined />}
          size="large"
          onSearch={handleSearch}
          style={{ width: '100%' }}
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

      <div style={{ marginBottom: 16 }}>
        <Tabs
          activeKey={category}
          onChange={handleCategoryChange}
          items={categoryTabs}
        />
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          {list.map((item) => (
            <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
              <ResourceCard
                item={item}
                resourceType="agent"
                onClick={(target) => navigate(`/agent/${target.id}`)}
              />
            </Col>
          ))}
        </Row>
      </Spin>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={setPage}
          showSizeChanger={false}
          showTotal={(count) => `共 ${count} 个 Agent`}
        />
      </div>
    </div>
  )
}

export default AgentMarket
