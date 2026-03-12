/**
 * 为资源列表计算 0-100 复合分数
 * 公式: 0.4 * (downloads/maxDownloads*100) + 0.4 * (rating/5*100) + 0.2 * (reviews/maxReviews*100)
 */
export function computeScoresForList(items) {
  if (!items || items.length === 0) return []

  const maxDownloads = Math.max(...items.map(i => i.downloads_count || 0), 1)
  const maxReviews = Math.max(...items.map(i => i.reviews_count || 0), 1)

  return items.map(item => {
    const dlScore = ((item.downloads_count || 0) / maxDownloads) * 100
    const ratingScore = ((item.rating_average || 0) / 5) * 100
    const reviewScore = ((item.reviews_count || 0) / maxReviews) * 100

    const score = Math.round(0.4 * dlScore + 0.4 * ratingScore + 0.2 * reviewScore)
    return { ...item, score }
  })
}

/**
 * 根据分数返回颜色
 * ≥80 绿色, ≥60 金色, ≥40 蓝色, <40 灰色
 */
export function getScoreColor(score) {
  if (score >= 80) return '#52c41a'
  if (score >= 60) return '#faad14'
  if (score >= 40) return '#1890ff'
  return '#999'
}

/**
 * 将日期字符串转换为相对时间描述
 */
export function getRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const months = Math.floor(diff / 2592000000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  if (months < 12) return `${months}个月前`
  return `${Math.floor(months / 12)}年前`
}
