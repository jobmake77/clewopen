import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Input, Select, Pagination, Spin, Tag } from 'antd'
import { SearchOutlined, StarFilled, DownloadOutlined } from '@ant-design/icons'
import { fetchAgents } from '../../store/slices/agentSlice'

const { Search } = Input
const { Option } = Select

const categories = [
  '全部',
  '软件开发',
  '数据分析',
  '内容创作',
  '通用办公',
  '设计工具',
  '营销推广',
]

function MarketPlace() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { list, total, loading } = useSelector((state) => state.agent)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [category, setCategory] = useState('全部')
  const [search, setSearch] = useState('')

  useEffect(() => {
    dispatch(fetchAgents({
      page,
      pageSize,
      category: category === '全部' ? undefined : category,
      search
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

  const handleCardClick = (id) => {
    navigate(`/agent/${id}`)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1>AI Agent 市场</h1>
        <p style={{ color: '#666' }}>
          发现和使用专业的 AI Agent，提升工作效率
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={18}>
          <Search
            placeholder="搜索 Agent..."
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={handleSearch}
          />
        </Col>
        <Col span={6}>
          <Select
            value={category}
            onChange={handleCategoryChange}
            style={{ width: '100%' }}
            size="large"
          >
            {categories.map((cat) => (
              <Option key={cat} value={cat}>
                {cat}
              </Option>
            ))}
          </Select>
        </Col>
      </Row>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          {list.map((agent) => (
            <Col key={agent.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                onClick={() => handleCardClick(agent.id)}
                cover={
                  <div
                    style={{
                      height: 160,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 48,
                    }}
                  >
                    🤖
                  </div>
                }
              >
                <Card.Meta
                  title={agent.name}
                  description={
                    <div>
                      <p style={{
                        height: 40,
                        overflow: 'hidden',
                        marginBottom: 8
                      }}>
                        {agent.description}
                      </p>
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="blue">{agent.category}</Tag>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>
                          <StarFilled style={{ color: '#faad14' }} />
                          {' '}{agent.rating || 0}
                        </span>
                        <span>
                          <DownloadOutlined />
                          {' '}{agent.downloads || 0}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, fontWeight: 'bold', color: '#f5222d' }}>
                        ¥{agent.price?.amount || 0}/{agent.price?.billing_period === 'monthly' ? '月' : '年'}
                      </div>
                    </div>
                  }
                />
              </Card>
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
          showTotal={(total) => `共 ${total} 个 Agent`}
        />
      </div>
    </div>
  )
}

export default MarketPlace
