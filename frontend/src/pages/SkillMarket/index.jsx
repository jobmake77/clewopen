import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Input, Select, Pagination, Spin, Tabs, Alert } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchSkills } from '../../store/slices/skillSlice'
import ResourceCard from '../../components/ResourceCard'

const { Search } = Input

const categories = [
  { label: '全部', value: '全部' },
  { label: 'Agent Tool', value: 'agent-tool' },
  { label: 'Claude Skill', value: 'claude-skill' },
  { label: 'Codex Skill', value: 'codex-skill' },
  { label: 'LLM Plugin', value: 'llm-plugin' },
  { label: 'AI Skill', value: 'ai-skill' },
]

const sortOptions = [
  { label: '综合排序', value: 'default' },
  { label: '星数最多', value: 'stars' },
]

function SkillMarket() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { list, total, loading, error } = useSelector((state) => state.skill)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [category, setCategory] = useState('全部')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('default')
  const [sourcePlatform, setSourcePlatform] = useState('all')

  useEffect(() => {
    dispatch(fetchSkills({
      page,
      pageSize,
      category: category === '全部' ? undefined : category,
      search: search || undefined,
      sort: sort === 'default' ? undefined : sort,
      sourcePlatform: sourcePlatform === 'all' ? undefined : sourcePlatform,
    }))
  }, [dispatch, page, pageSize, category, search, sort, sourcePlatform])

  const handleSearch = (value) => {
    setSearch(value)
    setPage(1)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
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

  return (
    <div className="page-shell">
      {/* 标题 */}
      <div style={{ marginBottom: 24, paddingTop: 12 }}>
        <p className="section-label">Skill Library</p>
        <h1 style={{ fontSize: 'clamp(30px, 5.2vw, 42px)', marginBottom: 8 }}>Skill 库</h1>
        <p style={{ color: 'var(--ink-muted)' }}>
          发现和使用专业的 Skill 技能包，扩展 Agent 能力
        </p>
      </div>

      {/* 搜索栏 */}
      <div style={{ marginBottom: 24 }}>
        <Search
          placeholder="搜索 Skill..."
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

      {/* 分类 Tab + 排序 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Tabs
          activeKey={category}
          onChange={handleCategoryChange}
          items={categories.map(c => ({ key: c.value, label: c.label }))}
          style={{ flex: 1 }}
        />
        <div style={{ display: 'flex', gap: 12, marginLeft: 16 }}>
          <Select
            value={sourcePlatform}
            onChange={handleSourcePlatformChange}
            style={{ width: 140 }}
            options={[
              { label: '全部来源', value: 'all' },
              { label: 'GitHub', value: 'github' },
              { label: 'OpenClaw', value: 'openclaw' },
              { label: '平台上传', value: 'manual' },
            ]}
          />
          <Select
            value={sort}
            onChange={handleSortChange}
            style={{ width: 140, flexShrink: 0 }}
            options={sortOptions}
          />
        </div>
      </div>

      {/* 卡片网格 */}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          {list.map((item) => (
            <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
              <ResourceCard
                item={item}
                resourceType="skill"
                onClick={(item) => navigate(`/skills/${item.id}`)}
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
          showTotal={(total) => `共 ${total} 个 Skill`}
        />
      </div>
    </div>
  )
}

export default SkillMarket
