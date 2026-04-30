import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Spin, Empty, Typography, Button, Collapse, Popover, Statistic, Space } from 'antd'
import { TrophyOutlined } from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'
import { getSeasons, getMembers } from '../api/seasons'
import { getBreakdown } from '../api/scoring'
import { getMyWorkSummary, type MyWorkSummaryResponse } from '../api/feishu'
import type { Season, SeasonMember } from '../types/models'

const { Title } = Typography

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [myMember, setMyMember] = useState<SeasonMember | null>(null)
  const [breakdown, setBreakdown] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [workSummary, setWorkSummary] = useState<MyWorkSummaryResponse | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const res = await getSeasons()
      const activeSeason = res.data.find((s: Season) => s.status === 'active')
      if (!activeSeason) { setLoading(false); return }

      const membersRes = await getMembers(activeSeason.id)
      const me = membersRes.data.find((m: SeasonMember) => m.user_id === user?.id)
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

  const distColors: Record<string, string> = { '2': '#52c41a', '7': '#1677ff', '1': '#ff4d4f' }

  return (
    <div>
      <Title level={4}>我的成绩</Title>
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={4}>
          <Descriptions.Item label="岗位分">{myMember.final_position_score?.toFixed(1) ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="组织分">{myMember.total_org_score?.toFixed(1) ?? '0'}</Descriptions.Item>
          <Descriptions.Item label="总分">{myMember.total_score?.toFixed(1) ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="排名">{myMember.rank ? `第${myMember.rank}名` : '-'}</Descriptions.Item>
        </Descriptions>
        {myMember.distribution && (
          <Tag color={distColors[myMember.distribution]} style={{ marginTop: 8 }}>
            271: {myMember.distribution === '2' ? '优秀' : myMember.distribution === '7' ? '达标' : '待改进'}
          </Tag>
        )}
      </Card>

      {breakdown?.scores && (
        <Collapse
          items={groupByDimension(breakdown.scores).map((g: any) => ({
            key: g.name,
            label: `${g.name} (${(g.weight * 100).toFixed(0)}%) — 得分: ${g.avgScore?.toFixed(1) ?? '-'}`,
            children: (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>指标</th>
                      <th style={{ padding: 8 }}>原始值</th>
                      <th style={{ padding: 8 }}>得分</th>
                      <th style={{ padding: 8 }}>来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item: any) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: 8 }}>{item.indicator_name} ({(item.indicator_weight * 100).toFixed(0)}%)</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{item.raw_value ?? '-'}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{item.final_score?.toFixed(1) ?? '-'}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{sourceTag(item.data_source)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.name === '交付效率' && workSummary?.found && workSummary.people?.[0] && (
                  <WorkSummaryCard summary={workSummary} />
                )}
              </>
            ),
          }))}
        />
      )}

      <Button type="link" onClick={() => {
        const active = seasons.find(s => s.status === 'active')
        if (active) navigate(`/rankings/${active.id}`)
      }}>
        查看排名看板
      </Button>
    </div>
  )
}

function groupByDimension(scores: any[]) {
  const map = new Map<string, any>()
  for (const s of scores) {
    const key = s.dimension_name
    if (!map.has(key)) map.set(key, { name: key, weight: s.dimension_weight, items: [] })
    map.get(key)!.items.push(s)
  }
  return Array.from(map.values())
}

function sourceTag(source?: string) {
  const map: Record<string, { color: string; label: string }> = {
    feishu: { color: 'green', label: '飞书' },
    admin: { color: 'orange', label: '录入' },
    evidence: { color: 'blue', label: '举证' },
  }
  const s = map[source || 'admin']
  return <Tag color={s.color}>{s.label}</Tag>
}

function TagList({ items, max = 6, label }: { items: string[]; max?: number; label: string }) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return <Typography.Text type="secondary">暂无{label}</Typography.Text>
  const visible = expanded ? items : items.slice(0, max)
  return (
    <div>
      <Space size={[4, 8]} wrap>
        {visible.map((name, i) => (
          <Tag key={i} style={{ margin: 0 }}>{name}</Tag>
        ))}
        {items.length > max && !expanded && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExpanded(true)}>
            +{items.length - max} 更多
          </Button>
        )}
        {expanded && items.length > max && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExpanded(false)}>
            收起
          </Button>
        )}
      </Space>
    </div>
  )
}

function WorkSummaryCard({ summary }: { summary: MyWorkSummaryResponse }) {
  const person = summary.people![0]
  const dateLabel = `${summary.startDate!.slice(0, 7).replace('-', '.')} ~ ${summary.endDate!.slice(0, 7).replace('-', '.')}`
  return (
    <Card size="small" title="工时明细" extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{dateLabel}</Typography.Text>} style={{ marginTop: 12 }}>
      <Space size={32} style={{ marginBottom: 16 }}>
        <Statistic title="总 PD" value={person.total_pd} precision={2} valueStyle={{ fontSize: 22 }} />
        <Statistic title="总工时" value={person.total_hours} precision={2} suffix="h" valueStyle={{ fontSize: 22 }} />
      </Space>
      <div style={{ marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13, marginRight: 8 }}>关联项目（{person.project_names.length}）</Typography.Text>
        <TagList items={person.project_names} label="项目" />
      </div>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 13, marginRight: 8 }}>关联需求（{person.requirement_names.length}）</Typography.Text>
        <TagList items={person.requirement_names} max={8} label="需求" />
      </div>
    </Card>
  )
}
