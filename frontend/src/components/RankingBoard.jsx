import { Card, List, Tag, Spin, Avatar } from 'antd'
import { StarFilled, LinkOutlined, GithubOutlined } from '@ant-design/icons'

const rankColors = {
  1: 'var(--status-warning)', // 金
  2: 'var(--status-silver)',    // 银
  3: 'var(--status-bronze)', // 铜
}

function RankingBoard({ items = [], title = '热门榜单', onItemClick, loading = false, resourceType }) {
  const isExternal = resourceType === 'skill' || resourceType === 'mcp'

  return (
    <Card
      title={<span style={{ fontSize: 22, fontFamily: '"Playfair Display", Georgia, serif' }}>{title}</span>}
      style={{ marginBottom: 24 }}
      className="cream-panel"
    >
      <Spin spinning={loading}>
        <List
          dataSource={items}
          locale={{ emptyText: '暂无数据' }}
          renderItem={(item, index) => {
            const rank = index + 1
            const rankColor = rankColors[rank] || 'var(--ink-muted)'
            const isUploadedResource = item.source_type === 'uploaded'
            const starsGrowth = Number(item.stars_growth ?? item.stars_growth_7d ?? 0)

            return (
              <List.Item
                className="ranking-item"
                style={{ cursor: 'pointer', padding: '14px 0' }}
                onClick={() => onItemClick?.(item)}
              >
                <div className="ranking-row" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12 }}>
                  {/* 排名序号 */}
                  <span
                    style={{
                      width: 28,
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontSize: rank <= 3 ? 18 : 14,
                      color: rankColor,
                      flexShrink: 0,
                    }}
                  >
                    {rank}
                  </span>

                  {/* 头像 */}
                  {isExternal ? (
                    <Avatar
                      src={item.author_avatar_url || item.author_avatar}
                      size={28}
                      style={{ flexShrink: 0 }}
                    >
                      {(item.author_name || item.name || '?')[0].toUpperCase()}
                    </Avatar>
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: 'linear-gradient(135deg, #2f57cc 0%, #7350b6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 'bold',
                        flexShrink: 0,
                      }}
                    >
                      {(item.name || '?')[0].toUpperCase()}
                    </div>
                  )}

                  {/* 名称 + 外链图标 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: 14,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name}
                    </span>
                    {isExternal && !isUploadedResource && (
                      <LinkOutlined style={{ color: 'var(--ink-muted)', fontSize: 12, flexShrink: 0 }} />
                    )}
                  </div>

                  {/* 作者 */}
                  <span className="ranking-author" style={{ color: 'var(--ink-muted)', fontSize: 12, flexShrink: 0 }}>
                    {item.author_name || '未知'}
                  </span>

                  {/* 分类 Tag */}
                  {item.category && (
                    <Tag className="ranking-category-tag" style={{ margin: 0, flexShrink: 0 }}>{item.category}</Tag>
                  )}

                  {/* 星数（Skill/MCP）或 评分（Agent） */}
                  {isExternal ? (
                    isUploadedResource ? (
                      <span style={{ color: 'var(--status-warning)', fontSize: 12, flexShrink: 0 }}>
                        <StarFilled /> {parseFloat(item.rating_average || 0).toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-warning)', fontSize: 12, flexShrink: 0 }}>
                        <GithubOutlined style={{ marginRight: 2 }} />
                        <StarFilled /> {item.github_stars || 0}
                      </span>
                    )
                  ) : (
                    <span style={{ color: 'var(--status-warning)', fontSize: 12, flexShrink: 0 }}>
                      <StarFilled /> {parseFloat(item.rating_average || 0).toFixed(1)}
                    </span>
                  )}

                  {isExternal && !isUploadedResource && (
                    <span
                      style={{
                        color: starsGrowth > 0 ? '#52c41a' : 'var(--ink-muted)',
                        fontSize: 12,
                        flexShrink: 0,
                        minWidth: 52,
                        textAlign: 'right',
                      }}
                    >
                      {starsGrowth > 0 ? `+${starsGrowth}` : '+0'}
                    </span>
                  )}
                </div>
              </List.Item>
            )
          }}
        />
      </Spin>
    </Card>
  )
}

export default RankingBoard
