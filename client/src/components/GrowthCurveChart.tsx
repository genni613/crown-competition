import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Spin, Empty, Card, Typography, Table } from 'antd'

const { Text } = Typography

interface ScoreHistoryRow {
  season_id: number
  season_name: string
  season_status: string
  job_role: string
  raw_position_score: number | null
  final_position_score: number | null
  total_score: number | null
  rank: number | null
  distribution: string | null
  growth: number | null
  raw_value: number | null
  threshold_score: number | null
  final_score: number | null
  dimension_name: string
  indicator_name: string
  dimension_weight: number
  indicator_weight: number
  score_type: string
  sort_order: number
}

interface Props {
  data: ScoreHistoryRow[] | null
  loading?: boolean
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#ec4899']

function transformToChartData(rows: ScoreHistoryRow[]) {
  // Group by season, compute dimension-level weighted score per season
  const seasonMap = new Map<string, { season: string; dims: Map<string, { weighted: number; weight: number }> }>()
  const allDimensions: string[] = []

  for (const row of rows) {
    const key = row.season_name
    if (!seasonMap.has(key)) {
      seasonMap.set(key, { season: key, dims: new Map() })
    }
    const entry = seasonMap.get(key)!

    if (!entry.dims.has(row.dimension_name)) {
      entry.dims.set(row.dimension_name, { weighted: 0, weight: row.dimension_weight })
    }
    const dim = entry.dims.get(row.dimension_name)!

    if (row.score_type === 'deduction') {
      if (row.raw_value != null && row.raw_value > 0) {
        dim.weighted -= Math.min(
          row.raw_value * (row as any).deduction_per_unit / ((row as any).deduction_divisor || 1),
          (row as any).deduction_cap || 0
        )
      }
    } else if (row.final_score != null) {
      dim.weighted += row.final_score * row.indicator_weight
    }

    if (!allDimensions.includes(row.dimension_name)) {
      allDimensions.push(row.dimension_name)
    }
  }

  return {
    chartData: Array.from(seasonMap.values()).map(s => {
      const point: Record<string, any> = { season: s.season }
      for (const [dimName, dim] of s.dims) {
        point[dimName] = Math.round((dim.weighted / dim.weight) * 10) / 10
      }
      return point
    }),
    dimensions: allDimensions,
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <Card
      size="small"
      style={{
        borderRadius: 10,
        border: '1px solid #e0e7ff',
        boxShadow: '0 4px 12px rgba(99,102,241,0.12)',
        minWidth: 240,
      }}
    >
      <Text strong style={{ fontSize: 13, color: '#1e1b4b', display: 'block', marginBottom: 8 }}>
        {label}
      </Text>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #eef2ff' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px', color: '#64748b', fontWeight: 500 }}>维度</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', color: '#64748b', fontWeight: 500 }}>得分</th>
          </tr>
        </thead>
        <tbody>
          {payload.map((entry: any, idx: number) => (
            <tr key={idx}>
              <td style={{ padding: '3px 6px', color: entry.color, fontWeight: 600 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                  background: entry.color, marginRight: 6,
                }} />
                {entry.name}
              </td>
              <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {entry.value?.toFixed(1) ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function GrowthCurveChart({ data, loading }: Props) {
  const { chartData, dimensions } = useMemo(
    () => data ? transformToChartData(data) : { chartData: [], dimensions: [] },
    [data],
  )

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  if (!data || chartData.length < 2) {
    return <Empty description="至少需要两个赛季的数据才能展示成长曲线" style={{ padding: 24 }} />
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
        <XAxis dataKey="season" tick={{ fontSize: 12, fill: '#64748b' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value: string) => <span style={{ color: '#334155' }}>{value}</span>}
        />
        {dimensions.map((dim, idx) => (
          <Line
            key={dim}
            type="monotone"
            dataKey={dim}
            name={dim}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2.5}
            dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, strokeWidth: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export type { ScoreHistoryRow }
