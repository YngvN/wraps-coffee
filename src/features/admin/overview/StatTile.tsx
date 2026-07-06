import { Card } from '../../../components'
import './StatTile.scss'

interface StatTileProps {
  label: string
  /** Auto-compacted display value, e.g. "4,280 kr" or "62". */
  value: string
  /** Signed percentage change vs. the same period last week. */
  deltaPct: number
  /** 7-day trend, oldest first; the last point is the current period. */
  trend: number[]
}

/** Builds an SVG polyline path plotting `values` across a `width` x `height` box. */
function sparklinePoints(values: number[], width: number, height: number): string {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')
}

const SPARKLINE_WIDTH = 72
const SPARKLINE_HEIGHT = 24

/** A single cafe statistic: label, current value, delta vs. last week, and a small trend sparkline. */
export function StatTile({ label, value, deltaPct, trend }: StatTileProps) {
  const isUp = deltaPct >= 0
  const points = sparklinePoints(trend, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)
  const lastPoint = points.split(' ').pop()

  return (
    <Card className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      <div className="stat-tile__footer">
        <span className={`stat-tile__delta${isUp ? ' stat-tile__delta--up' : ' stat-tile__delta--down'}`}>
          {isUp ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
        </span>
        <svg className="stat-tile__sparkline" width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}>
          <polyline points={points} fill="none" className="stat-tile__sparkline-line" />
          {lastPoint && <circle cx={lastPoint.split(',')[0]} cy={lastPoint.split(',')[1]} r={2.5} className="stat-tile__sparkline-dot" />}
        </svg>
      </div>
    </Card>
  )
}
