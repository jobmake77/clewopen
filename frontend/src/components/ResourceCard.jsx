import { Card, Tag, Avatar } from 'antd'
import { StarFilled, DownloadOutlined, LinkOutlined, GithubOutlined } from '@ant-design/icons'

function ResourceCard({ item, onClick, resourceType = 'skill' }) {
  const isExternal = resourceType === 'skill' || resourceType === 'mcp'

  const tags = Array.isArray(item.tags)
    ? item.tags
    : typeof item.tags === 'string'
      ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
      : []

  return (
    <Card
      hoverable
      onClick={() => onClick?.(item)}
      bodyStyle={{ padding: 16 }}
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 顶部：头像/名称/外链图标 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {isExternal && (
            <Avatar
              src={item.author_avatar_url || item.author_avatar}
              size={22}
              style={{ flexShrink: 0 }}
            >
              {(item.author_name || item.name || '?')[0].toUpperCase()}
            </Avatar>
          )}
          <span style={{ fontSize: 16, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {item.name}
          </span>
          {isExternal && (
            <LinkOutlined style={{ color: '#888', fontSize: 14, flexShrink: 0 }} />
          )}
        </div>

        {/* 描述 */}
        <p
          style={{
            color: '#666',
            fontSize: 13,
            lineHeight: '20px',
            height: 40,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            marginBottom: 10,
          }}
        >
          {item.description}
        </p>

        {/* 标签行 */}
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {item.category && (
            <Tag color={resourceType === 'skill' ? 'green' : resourceType === 'mcp' ? 'magenta' : 'blue'}>{item.category}</Tag>
          )}
          {tags.slice(0, 3).map((tag, i) => (
            <Tag key={i}>{tag}</Tag>
          ))}
        </div>

        {/* 底部信息 */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#888' }}>
          {isExternal ? (
            /* Skill/MCP: 显示 GitHub 星数 */
            <span>
              <GithubOutlined style={{ marginRight: 4 }} />
              <StarFilled style={{ color: '#faad14', marginRight: 2 }} />
              {item.github_stars || 0}
            </span>
          ) : (
            /* Agent: 显示评分 + 下载量 */
            <>
              <span>
                <StarFilled style={{ color: '#faad14' }} /> {parseFloat(item.rating_average || 0).toFixed(1)}
              </span>
              <span>
                <DownloadOutlined /> {item.downloads_count || 0}
              </span>
            </>
          )}
        </div>

        {/* 作者 — 仅 Agent 显示 */}
        {!isExternal && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
            by {item.author_name || '未知'}
          </div>
        )}
      </div>
    </Card>
  )
}

export default ResourceCard
