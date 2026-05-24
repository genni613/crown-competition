import { Tag, Typography, Space } from 'antd'
import {
  CrownOutlined, FireOutlined,
  RiseOutlined, TeamOutlined, BulbOutlined,
  CheckCircleOutlined, WarningOutlined,
} from '@ant-design/icons'
import type { MyWorkSummaryResponse } from '../api/feishu'

const { Text } = Typography

export const distConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '2': { label: '优秀', color: '#10b981', bg: '#ecfdf5', icon: <CrownOutlined /> },
  '7': { label: '达标', color: '#6366f1', bg: '#eef2ff', icon: <CheckCircleOutlined /> },
  '1': { label: '待改进', color: '#f59e0b', bg: '#fffbeb', icon: <WarningOutlined /> },
}

export const dimIcons: Record<string, React.ReactNode> = {
  交付效率: <FireOutlined />,
  需求价值: <BulbOutlined />,
  创新突破: <RiseOutlined />,
  交付质量: <CheckCircleOutlined />,
  协作贡献: <TeamOutlined />,
}

export const dimIconBg: Record<string, string> = {
  交付效率: 'linear-gradient(135deg, #f97316, #fb923c)',
  需求价值: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
  创新突破: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
  交付质量: 'linear-gradient(135deg, #10b981, #34d399)',
  协作贡献: 'linear-gradient(135deg, #f43f5e, #fb7185)',
}

export const scoreColor = (v: number) => {
  if (v >= 85) return '#6366f1'
  if (v >= 70) return '#8b5cf6'
  if (v >= 60) return '#f59e0b'
  return '#f43f5e'
}

export const dimGradient = (v: number) => {
  if (v >= 85) return 'linear-gradient(90deg, #6366f1, #818cf8)'
  if (v >= 70) return 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
  if (v >= 60) return 'linear-gradient(90deg, #f59e0b, #fbbf24)'
  return 'linear-gradient(90deg, #f43f5e, #fb7185)'
}

export function groupByDimension(scores: any[]) {
  const map = new Map<string, any>()
  for (const s of scores) {
    const key = s.dimension_name
    if (!map.has(key)) map.set(key, { name: key, weight: s.dimension_weight, items: [] })
    map.get(key)!.items.push(s)
  }
  return Array.from(map.values())
}

export function resolveEffectiveValue(dimName: string, item: any, workSummary: MyWorkSummaryResponse | null): number | null {
  if (dimName === '交付效率' && workSummary?.found && workSummary.people?.[0]) {
    return workSummary.people[0].total_hours
  }
  return item.raw_value ?? null
}

export function calcThresholdScore(value: number | null, t100: number | null, t60: number | null): number | null {
  if (value == null || t100 == null || t60 == null) return null
  if (value >= t100) return 100
  if (value >= t60) return 60 + ((value - t60) / (t100 - t60)) * 40
  return 0
}

export function resolveEffectiveScore(item: any, effectiveValue: number | null): number | null {
  if (effectiveValue == null) return null
  if (item.score_type === 'threshold' && item.threshold_100 != null && item.threshold_60 != null) {
    return calcThresholdScore(effectiveValue, item.threshold_100, item.threshold_60)
  }
  if (item.score_type === 'threshold' && item.threshold_100 == null && item.threshold_60 == null) {
    return effectiveValue
  }
  return item.final_score ?? null
}

export function calcDimensionScore(items: any[], workSummary: MyWorkSummaryResponse | null, dimName: string): number | null {
  let dimScore = 0
  let totalDeduction = 0
  let hasAny = false
  for (const item of items) {
    const val = resolveEffectiveValue(dimName, item, workSummary)
    if (item.score_type === 'deduction') {
      if (val != null && val > 0) {
        const perUnit = item.deduction_per_unit || 1
        const divisor = item.deduction_divisor || 1
        const cap = item.deduction_cap || 0
        totalDeduction += Math.min(val * perUnit / divisor, cap)
      }
      continue
    }
    const score = resolveEffectiveScore(item, val)
    if (score != null) {
      dimScore += score * item.indicator_weight
      hasAny = true
    }
  }
  return hasAny ? dimScore - totalDeduction : null
}

export function ScoreStatus({ score }: { score: number }) {
  const label = score >= 100 ? '满分' : score >= 60 ? '及格' : '不及格'
  const color = score >= 100 ? '#10b981' : score >= 60 ? '#6366f1' : '#f43f5e'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 600 }}>{score.toFixed(1)}</span>
      <span style={{
        fontSize: 11, color, fontWeight: 600,
        background: `${color}14`, padding: '2px 8px', borderRadius: 6,
        border: `1px solid ${color}30`,
      }}>{label}</span>
    </span>
  )
}

export function sourceTag(source?: string) {
  const map: Record<string, { color: string; label: string }> = {
    feishu: { color: '#10b981', label: '飞书' },
    admin: { color: '#f59e0b', label: '录入' },
    evidence: { color: '#6366f1', label: '举证' },
  }
  const s = map[source || 'admin']
  return <Tag color={s.color} style={{ margin: 0, color: '#fff', border: 'none' }}>{s.label}</Tag>
}

export function ruleText(item: any) {
  if (item.score_type === 'deduction') {
    const parts: string[] = []
    if (item.deduction_per_unit) parts.push(`扣${item.deduction_per_unit}/单位`)
    if (item.deduction_cap) parts.push(`上限${item.deduction_cap}`)
    return parts.length > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>{parts.join('，')}</Text> : '-'
  }
  if (item.threshold_100 != null && item.threshold_60 != null) {
    return (
      <Space size={4} wrap>
        <Tag style={{ margin: 0, fontSize: 11, background: '#eef2ff', color: '#4f46e5', border: 'none' }}>≥{item.threshold_100}=100</Tag>
        <Tag style={{ margin: 0, fontSize: 11, background: '#fefce8', color: '#a16207', border: 'none' }}>≥{item.threshold_60}=60</Tag>
      </Space>
    )
  }
  return <Text type="secondary" style={{ fontSize: 12 }}>直接计分</Text>
}

export function WorkSummaryCard({ summary }: { summary: MyWorkSummaryResponse }) {
  const person = summary.people![0]
  const dateLabel = `${summary.startDate!.slice(0, 7).replace('-', '.')} ~ ${summary.endDate!.slice(0, 7).replace('-', '.')}`
  return (
    <Typography.Text style={{ marginTop: 8 }}>
      <Space size={24} style={{ marginBottom: 8 }}>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>总 PD</Typography.Text><div style={{ fontWeight: 700, color: '#4f46e5' }}>{person.total_pd?.toFixed(2)}</div></div>
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>总工时</Typography.Text><div style={{ fontWeight: 700, color: '#4f46e5' }}>{person.total_hours?.toFixed(2)}h</div></div>
      </Space>
    </Typography.Text>
  )
}
