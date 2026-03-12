import { getScoreColor } from '../utils/scoring'

function ScoreBadge({ score, size = 36 }) {
  const color = getScoreColor(score)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.4,
        fontWeight: 'bold',
        flexShrink: 0,
      }}
    >
      {score}
    </div>
  )
}

export default ScoreBadge
