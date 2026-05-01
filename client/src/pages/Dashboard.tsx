import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Tag, Spin, Empty, Typography, Button, Progress, Space, Row, Col, Collapse, Popover } from 'antd'
import {
  TrophyOutlined, CrownOutlined, FireOutlined,
  RiseOutlined, TeamOutlined, BulbOutlined,
  CheckCircleOutlined, WarningOutlined,
} from '@ant-design/icons'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuthStore } from '../store/authStore'
import { getSeasons, getMembers } from '../api/seasons'
import { getBreakdown } from '../api/scoring'
import { getMyWorkSummary, type MyWorkSummaryResponse } from '../api/feishu'
import type { Season, SeasonMember } from '../types/models'

const { Title, Text } = Typography

const distConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '2': { label: '优秀', color: '#52c41a', bg: 'linear-gradient(135deg, #52c41a22, #52c41a08)', icon: <CrownOutlined /> },
  '7': { label: '达标', color: '#1677ff', bg: 'linear-gradient(135deg, #1677ff22, #1677ff08)', icon: <CheckCircleOutlined /> },
  '1': { label: '待改进', color: '#faad14', bg: 'linear-gradient(135deg, #faad1422, #faad1408)', icon: <WarningOutlined /> },
}

const dimIcons: Record<string, React.ReactNode> = {
  交付效率: <FireOutlined />,
  需求价值: <BulbOutlined />,
  创新突破: <RiseOutlined />,
  交付质量: <CheckCircleOutlined />,
  协作贡献: <TeamOutlined />,
}

const scoreColor = (v: number) => (v >= 85 ? '#52c41a' : v >= 70 ? '#1677ff' : v >= 60 ? '#faad14' : '#ff4d4f')
const scoreGradient = (v: number) => {
  if (v >= 85) return { '0%': '#73d13d', '100%': '#389e0d' }
  if (v >= 70) return { '0%': '#4096ff', '100%': '#1677ff' }
  if (v >= 60) return { '0%': '#ffc53d', '100%': '#faad14' }
  return { '0%': '#ff7875', '100%': '#ff4d4f' }
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [myMember, setMyMember] = useState<SeasonMember | null>(null)
  const [breakdown, setBreakdown] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [workSummary, setWorkSummary] = useState<MyWorkSummaryResponse | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const res = await getSeasons()
      const activeSeason = res.data.find((s: Season) => s.status === 'active')
      if (!activeSeason) { setLoading(false); return }

      const membersRes = await getMembers(activeSeason.id)
      const me = membersRes.data.find((m: SeasonMember) => m.user_key === user?.user_key)
      setMyMember(me || null)
      setSeasons(res.data)

      if (me) {
        const [bdRes, wsRes] = await Promise.all([
          getBreakdown(activeSeason.id, me.id),
          getMyWorkSummary(activeSeason.id).catch(() => ({ data: { found: false } as MyWorkSummaryResponse })),
        ])
        setBreakdown(bdRes.data)
        setWorkSummary(wsRes.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spin />
  if (!myMember) return <Empty description="暂无参赛信息，请等待管理员添加" />

  const dimensions = breakdown?.scores ? groupByDimension(breakdown.scores) : []
  const dist = myMember.distribution ? distConfig[myMember.distribution] : null
  const positionScore = myMember.final_position_score ?? 0
  const orgScore = myMember.total_org_score ?? 0
  const totalScore = myMember.total_score ?? 0
  const rank = myMember.rank

  const radarData = dimensions.map((g: any) => {
    const dimScore = calcDimensionScore(g.items, workSummary, g.name)
    return { dimension: g.name, score: dimScore ?? 0, fullMark: 100 }
  })

  return (
    <div style={{ maxWidth: 900 }}>
      {/* 顶部总分卡片 */}
      <Card
        style={{
          marginBottom: 20,
          background: dist?.bg ?? '#fff',
          borderRadius: 12,
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={40}>
              <div>
                <Text type="secondary" style={{ fontSize: 13, letterSpacing: 1 }}>TOTAL</Text>
                <div style={{
                  fontSize: 44, fontWeight: 800, lineHeight: 1.15,
                  color: scoreColor(totalScore),
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {totalScore.toFixed(1)}
                </div>
              </div>
              <div style={{ width: 1, height: 52, background: 'linear-gradient(180deg, transparent, #d9d9d9, transparent)' }} />
              <Space size={24}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>岗位分</Text>
                  <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{positionScore.toFixed(1)}</div>
                </div>
                <div style={{ color: '#d9d9d9' }}>+</div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>组织分</Text>
                  <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{orgScore.toFixed(1)}</div>
                </div>
              </Space>
            </Space>
          </Col>
          <Col>
            <Space size={24}>
              {rank && (
                <div style={{
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #fffbe6, #fff1b8)',
                  borderRadius: 12,
                  padding: '8px 20px',
                }}>
                  <TrophyOutlined style={{ color: '#d4b106', fontSize: 16 }} />
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>#{rank}</div>
                </div>
              )}
              {dist && (
                <Tag
                  style={{
                    fontSize: 13, padding: '6px 18px', borderRadius: 20, margin: 0,
                    background: dist.color, color: '#fff', border: 'none',
                    fontWeight: 500,
                  }}
                >
                  {dist.icon} {dist.label}
                </Tag>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 纬度进度条 */}
      <Card
        style={{ marginBottom: 20, borderRadius: 12 }}
        styles={{ body: { padding: '20px 28px' } }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 15 }}>各纬度得分</Text>
        </div>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {dimensions.map((g: any) => {
            const dimScore = calcDimensionScore(g.items, workSummary, g.name)
            const normalized = dimScore != null ? dimScore / g.weight : 0
            const pct = dimScore != null ? Math.round(normalized) : 0
            return (
              <div key={g.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Space size={8}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 8,
                      background: `${scoreColor(normalized)}14`,
                      color: scoreColor(normalized), fontSize: 14,
                    }}>
                      {dimIcons[g.name] ?? <FireOutlined />}
                    </span>
                    <Text strong>{g.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12, background: '#f5f5f5', padding: '0 6px', borderRadius: 4 }}>
                      {(g.weight * 100).toFixed(0)}%
                    </Text>
                  </Space>
                  <Text style={{ fontWeight: 700, fontSize: 15, color: scoreColor(normalized), fontVariantNumeric: 'tabular-nums' }}>
                    {dimScore?.toFixed(1) ?? '-'}
                  </Text>
                </div>
                <Progress
                  percent={dimScore != null ? pct : 0}
                  strokeColor={dimScore != null ? scoreGradient(normalized) : '#f0f0f0'}
                  showInfo={false}
                  size={['100%', 8]}
                  style={{ margin: 0 }}
                />
              </div>
            )
          })}
        </Space>
      </Card>

      {/* 雷达图 + 指标明细 */}
      <Row gutter={16}>
        <Col span={10}>
          <Card
            title={<Text strong style={{ fontSize: 15 }}>能力雷达</Text>}
            style={{ height: '100%', borderRadius: 12 }}
            styles={{ body: { padding: '12px 12px 8px' } }}
          >
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                  <PolarGrid stroke="#f0f0f0" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: '#8c8c8c' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="得分" dataKey="score"
                    stroke="#1677ff" fill="#1677ff" fillOpacity={0.15} strokeWidth={2}
                    dot={{ r: 3, fill: '#1677ff', fillOpacity: 1 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col span={14}>
          <Card
            title={<Text strong style={{ fontSize: 15 }}>指标明细</Text>}
            style={{ height: '100%', borderRadius: 12 }}
            styles={{ body: { padding: '8px 20px' } }}
          >
            <Collapse
              ghost
              expandIconPosition="end"
              items={dimensions.map((g: any) => ({
                key: g.name,
                label: <Text strong style={{ fontSize: 13 }}>{g.name}</Text>,
                children: (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>指标</th>
                        <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500 }}>规则</th>
                        <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500 }}>原始值</th>
                        <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500 }}>得分</th>
                        <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500 }}>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((item: any) => {
                        const effectiveValue = resolveEffectiveValue(g.name, item, workSummary)
                        const effectiveScore = resolveEffectiveScore(item, effectiveValue)
                        const displayItem = { ...item, raw_value: effectiveValue }
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #fafafa' }}>
                            <td style={{ padding: '6px 8px' }}>
                              {item.indicator_name}
                              <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                {(item.indicator_weight * 100).toFixed(0)}%
                              </Text>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{ruleText(displayItem)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {effectiveValue != null && item.threshold_100 != null && item.threshold_60 != null
                                ? <ValueStatus value={effectiveValue} t100={item.threshold_100} t60={item.threshold_60} />
                                : (effectiveValue ?? '-')}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>
                              {effectiveScore?.toFixed(1) ?? '-'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{sourceTag(item.data_source)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ),
              }))}
            />
            {breakdown?.scores && workSummary?.found && workSummary.people?.[0] && (
              <WorkSummaryCard summary={workSummary} />
            )}
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Button type="link" onClick={() => {
          const active = seasons.find(s => s.status === 'active')
          if (active) navigate(`/rankings/${active.id}`)
        }}>
          查看排名看板
        </Button>
      </div>
    </div>
  )
}

/* ── helpers ───────────────────────────────────── */

function groupByDimension(scores: any[]) {
  const map = new Map<string, any>()
  for (const s of scores) {
    const key = s.dimension_name
    if (!map.has(key)) map.set(key, { name: key, weight: s.dimension_weight, items: [] })
    map.get(key)!.items.push(s)
  }
  return Array.from(map.values())
}

function resolveEffectiveValue(dimName: string, item: any, workSummary: MyWorkSummaryResponse | null): number | null {
  if (item.raw_value != null) return item.raw_value
  if (dimName === '交付效率' && workSummary?.found && workSummary.people?.[0]) {
    return workSummary.people[0].total_hours
  }
  return null
}

function calcThresholdScore(value: number | null, t100: number | null, t60: number | null): number | null {
  if (value == null || t100 == null || t60 == null) return null
  if (value >= t100) return 100
  if (value >= t60) return 60 + ((value - t60) / (t100 - t60)) * 40
  return 0
}

function resolveEffectiveScore(item: any, effectiveValue: number | null): number | null {
  if (item.final_score != null) return item.final_score
  if (effectiveValue == null) return null
  if (item.score_type === 'threshold' && item.threshold_100 != null && item.threshold_60 != null) {
    return calcThresholdScore(effectiveValue, item.threshold_100, item.threshold_60)
  }
  return null
}

function calcDimensionScore(items: any[], workSummary: MyWorkSummaryResponse | null, dimName: string): number | null {
  const weightSum = items.reduce((s: number, item: any) => s + (item.indicator_weight || 0), 0)
  if (weightSum === 0) return null
  let dimIndScore = 0
  let dimWeight = 0
  let hasAny = false
  for (const item of items) {
    const val = resolveEffectiveValue(dimName, item, workSummary)
    const score = resolveEffectiveScore(item, val)
    if (score != null) {
      const normalizedWeight = item.indicator_weight / weightSum
      dimIndScore += score * normalizedWeight
      dimWeight = item.dimension_weight
      hasAny = true
    }
  }
  return hasAny ? dimIndScore * dimWeight : null
}

function ValueStatus({ value, t100, t60 }: { value: number; t100: number; t60: number }) {
  const isFull = value >= t100
  const isPass = value >= t60
  const label = isFull ? '满分' : isPass ? '及格' : '不及格'
  const color = isFull ? '#52c41a' : isPass ? '#1677ff' : '#ff4d4f'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 500 }}>{value}</span>
      <span style={{ fontSize: 11, color, background: `${color}14`, padding: '1px 6px', borderRadius: 4, border: `1px solid ${color}40` }}>{label}</span>
    </span>
  )
}

function sourceTag(source?: string) {
  const map: Record<string, { color: string; label: string }> = {
    feishu: { color: 'green', label: '飞书' },
    admin: { color: 'orange', label: '录入' },
    evidence: { color: 'blue', label: '举证' },
  }
  const s = map[source || 'admin']
  return <Tag color={s.color} style={{ margin: 0 }}>{s.label}</Tag>
}

function ruleText(item: any) {
  if (item.score_type === 'deduction') {
    const parts = []
    if (item.deduction_per_unit) parts.push(`扣${item.deduction_per_unit}/单位`)
    if (item.deduction_cap) parts.push(`上限${item.deduction_cap}`)
    return parts.length > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>{parts.join('，')}</Text> : '-'
  }
  if (item.threshold_100 != null && item.threshold_60 != null) {
    return (
      <Space size={4} wrap>
        <Tag style={{ margin: 0, fontSize: 11 }}>≥{item.threshold_100}=100</Tag>
        <Tag style={{ margin: 0, fontSize: 11 }}>≥{item.threshold_60}=60</Tag>
      </Space>
    )
  }
  return <Text type="secondary" style={{ fontSize: 12 }}>直接计分</Text>
}

function WorkSummaryCard({ summary }: { summary: MyWorkSummaryResponse }) {
  const person = summary.people![0]
  const dateLabel = `${summary.startDate!.slice(0, 7).replace('-', '.')} ~ ${summary.endDate!.slice(0, 7).replace('-', '.')}`
  return (
    <Card size="small" title="工时明细" extra={<Text type="secondary" style={{ fontSize: 12 }}>{dateLabel}</Text>} style={{ marginTop: 8 }}>
      <Space size={24} style={{ marginBottom: 8 }}>
        <div><Text type="secondary" style={{ fontSize: 12 }}>总 PD</Text><div style={{ fontWeight: 600 }}>{person.total_pd?.toFixed(2)}</div></div>
        <div><Text type="secondary" style={{ fontSize: 12 }}>总工时</Text><div style={{ fontWeight: 600 }}>{person.total_hours?.toFixed(2)}h</div></div>
      </Space>
      <div style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>关联项目（{person.project_names.length}）</Text>
        <Space size={[4, 4]} wrap>{person.project_names.slice(0, 6).map((n, i) => <Tag key={i} style={{ margin: 0 }}>{n}</Tag>)}</Space>
      </div>
    </Card>
  )
}
