import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Empty, Typography, Button, Space, Collapse, Spin, message } from 'antd'
import { ArrowLeftOutlined, FireOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar } from 'antd'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { getBreakdown } from '../../api/scoring'
import { getScoreHistory } from '../../api/scores'
import GrowthCurveChart from '../../components/GrowthCurveChart'
import type { ScoreHistoryRow } from '../../components/GrowthCurveChart'
import {
  distConfig, dimIcons, dimIconBg, scoreColor, dimGradient,
  groupByDimension, resolveEffectiveValue, resolveEffectiveScore,
  calcDimensionScore, ScoreStatus, sourceTag, ruleText,
} from '../dashboardHelpers'

const { Text } = Typography

export default function MemberScoreDetail() {
  const { seasonId, memberId } = useParams()
  const navigate = useNavigate()
  const [breakdown, setBreakdown] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [growthData, setGrowthData] = useState<ScoreHistoryRow[] | null>(null)

  useEffect(() => {
    if (seasonId && memberId) loadData()
  }, [seasonId, memberId])

  async function loadData() {
    try {
      const bdRes = await getBreakdown(Number(seasonId), Number(memberId))
      setBreakdown(bdRes.data)

      if (bdRes.data?.member?.user_key) {
        getScoreHistory(bdRes.data.member.user_key)
          .then(r => setGrowthData(r.data))
          .catch(() => setGrowthData(null))
      }
    } catch (e) {
      console.error(e)
      message.error('加载成员得分失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center', padding: 80 }}>
      <Spin size="large" />
    </div>
  )

  if (!breakdown) return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
      <Empty description="未找到该成员的得分数据" />
      <Button style={{ marginTop: 16 }} onClick={() => navigate(-1)}>返回</Button>
    </div>
  )

  const member = breakdown.member
  const user = breakdown.user
  const dimensions = breakdown.scores ? groupByDimension(breakdown.scores) : []
  const dist = member.distribution ? distConfig[member.distribution] : null
  const positionScore = member.raw_position_score ?? 0
  const orgScore = member.total_org_score ?? 0
  const totalScore = positionScore + orgScore
  const rank = member.rank

  const radarData = dimensions.map((g: any) => {
    const dimScore = calcDimensionScore(g.items, null, g.name)
    const normalized = dimScore != null ? dimScore / g.weight : 0
    return { dimension: g.name, score: Math.round(normalized), fullMark: 100 }
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ borderRadius: 8 }}
        >
          返回排行榜
        </Button>
        <Avatar
          src={user?.avatar_url}
          icon={<UserOutlined />}
          size={36}
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
        />
        <div>
          <Text strong style={{ fontSize: 16, color: '#1e1b4b' }}>{user?.name || '成员'}</Text>
          {member.job_role && (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              {({ product: '产品', design: '设计', tech: '研发' } as Record<string, string>)[member.job_role] || ''}
            </Text>
          )}
        </div>
      </div>

      {/* Score Hero */}
      <div
        className="hero-bg anim-fade-in-up"
        style={{
          borderRadius: 16,
          padding: '32px 36px',
          color: '#fff',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase' }}>综合总分</div>
          <div style={{
            fontSize: 56, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 2px 20px rgba(0,0,0,0.15)',
          }}>
            {totalScore.toFixed(1)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 6, fontWeight: 400 }}>
            岗位分 {positionScore.toFixed(1)} + 组织分 {orgScore.toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {rank && (
            <div style={{
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
              borderRadius: 20, padding: '8px 20px', fontSize: 15, fontWeight: 700,
              marginBottom: 10, letterSpacing: 0.5,
            }}>
              #{rank}
            </div>
          )}
          {dist && (
            <div style={{
              background: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: '5px 16px',
              fontSize: 13, fontWeight: 600, color: '#4f46e5',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              {dist.icon} {dist.label}
            </div>
          )}
        </div>
      </div>

      {/* Dimension Progress + Radar */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
        <Card
          className="anim-fade-in-up anim-delay-1"
          style={{ flex: 1, borderRadius: 14, border: 'none' }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ fontSize: 16, color: '#1e1b4b' }}>各维度得分</Text>
          </div>
          <Space direction="vertical" size={22} style={{ width: '100%' }}>
            {dimensions.map((g: any, idx: number) => {
              const dimScore = calcDimensionScore(g.items, null, g.name)
              const normalized = dimScore != null ? dimScore / g.weight : 0
              const pct = dimScore != null ? Math.round(normalized) : 0
              return (
                <div key={g.name} className="anim-fade-in-up" style={{ animationDelay: `${0.12 + idx * 0.08}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Space size={10}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 32, borderRadius: 10,
                        background: dimIconBg[g.name] || 'linear-gradient(135deg, #6366f1, #818cf8)',
                        color: '#fff', fontSize: 15, boxShadow: '0 2px 8px rgba(99, 102, 241, 0.2)',
                      }}>
                        {dimIcons[g.name] ?? <FireOutlined />}
                      </span>
                      <div>
                        <Text strong style={{ color: '#1e1b4b', fontSize: 14 }}>{g.name}</Text>
                        <div style={{ fontSize: 11, color: '#a5b4fc', marginTop: 1 }}>权重 {(g.weight * 100).toFixed(0)}%</div>
                      </div>
                    </Space>
                    <Text style={{
                      fontWeight: 800, fontSize: 18, color: scoreColor(normalized),
                      fontVariantNumeric: 'tabular-nums', lineHeight: '32px',
                    }}>
                      {dimScore?.toFixed(1) ?? '-'}
                    </Text>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: dimGradient(normalized),
                        animationDelay: `${0.3 + idx * 0.1}s`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </Space>
        </Card>
        <Card
          className="anim-fade-in-up anim-delay-2"
          title={<Text strong style={{ fontSize: 16, color: '#1e1b4b' }}>能力雷达</Text>}
          style={{ width: 400, flexShrink: 0, borderRadius: 14, border: 'none' }}
          styles={{ body: { padding: '12px 12px 8px' } }}
        >
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="62%">
                <PolarGrid stroke="#e0e7ff" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: '#8b5cf6', fontWeight: 500 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="得分" dataKey="score"
                  stroke="#6366f1" fill="url(#adminRadarGrad)" fillOpacity={0.25} strokeWidth={2.5}
                  dot={{ r: 4, fill: '#6366f1', fillOpacity: 1, stroke: '#fff', strokeWidth: 2 }}
                />
                <defs>
                  <linearGradient id="adminRadarGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e0e7ff', boxShadow: '0 4px 12px rgba(99,102,241,0.1)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </div>

      {/* Indicator Detail */}
      <Card
        className="anim-fade-in-up anim-delay-3"
        title={<Text strong style={{ fontSize: 16, color: '#1e1b4b' }}>指标明细</Text>}
        style={{ marginBottom: 24, borderRadius: 14, border: 'none' }}
        styles={{ body: { padding: '8px 20px' } }}
      >
        <Collapse
          ghost
          expandIconPosition="end"
          items={dimensions.map((g: any) => ({
            key: g.name,
            label: <Text strong style={{ fontSize: 13, color: '#1e1b4b' }}>{g.name}</Text>,
            children: (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eef2ff' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>指标</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>规则</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>原始值</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>得分</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((item: any) => {
                    const effectiveValue = resolveEffectiveValue(g.name, item, null)
                    const effectiveScore = resolveEffectiveScore(item, effectiveValue)
                    const displayItem = { ...item, raw_value: effectiveValue }
                    const hasRawValue = effectiveValue != null && effectiveValue !== 0
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f5f3ff' }}>
                        <td style={{ padding: '8px 8px' }}>
                          {item.indicator_name}
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            {(item.indicator_weight * 100).toFixed(0)}%
                          </Text>
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>{ruleText(displayItem)}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                          {item.score_type === 'threshold' && effectiveScore != null && hasRawValue
                            ? <ScoreStatus score={effectiveScore} />
                            : (hasRawValue ? effectiveValue : '-')}
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700, color: '#4f46e5' }}>
                          {item.score_type === 'threshold' && effectiveScore != null && hasRawValue
                            ? (effectiveScore * item.indicator_weight).toFixed(1)
                            : (hasRawValue && effectiveScore != null ? effectiveScore.toFixed(1) : '-')}
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>{sourceTag(item.data_source)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ),
          }))}
        />
      </Card>

      {/* Growth Curve */}
      {growthData && growthData.length >= 2 && (
        <Card
          className="anim-fade-in-up"
          title={<Text strong style={{ fontSize: 16, color: '#1e1b4b' }}>成长曲线</Text>}
          style={{ marginBottom: 24, borderRadius: 14, border: 'none' }}
          styles={{ body: { padding: '16px 20px' } }}
        >
          <GrowthCurveChart data={growthData} loading={false} />
        </Card>
      )}
    </div>
  )
}
