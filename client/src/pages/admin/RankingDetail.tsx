import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Table, Tag, Spin, Empty, Button, Typography, Tabs } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  BarChart, Bar, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, LabelList, XAxis, YAxis,
} from 'recharts'
import { getRankings } from '../../api/scoring'
import type { SeasonMember } from '../../types/models'

const { Title, Text } = Typography

const jobRoleMap: Record<string, string> = { product: '产品', design: '设计', tech: '研发' }
const distColors: Record<string, string> = { '2': '#52c41a', '7': '#1677ff', '1': '#ff4d4f' }
const distLabels: Record<string, string> = { '2': 'Top 20%', '7': 'Middle 70%', '1': 'Bottom 10%' }

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? '-' : v.toFixed(digits)

const fmtGrowth = (v: number | null | undefined) => {
  if (v == null) return <Text type="secondary">-</Text>
  const pct = (v * 100).toFixed(1) + '%'
  return v >= 0 ? <Text style={{ color: '#52c41a' }}>+{pct}</Text> : <Text style={{ color: '#ff4d4f' }}>{pct}</Text>
}

const PAGE_SIZE = 10

export default function RankingDetail() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const navigate = useNavigate()
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!seasonId) return
    setLoading(true)
    getRankings(Number(seasonId))
      .then(r => setMembers(r.data))
      .finally(() => setLoading(false))
  }, [seasonId])

  const ranked = useMemo(() => members.filter(m => m.rank != null), [members])
  const unranked = useMemo(() => members.filter(m => m.rank == null), [members])

  // 按增长率降序（赋分排序依据）
  const byGrowth = useMemo(
    () => [...ranked].sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity)),
    [ranked],
  )

  // 全局排名
  const globalRanked = useMemo(
    () => [...ranked].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
    [ranked],
  )

  const protectionHighlighted = (m: SeasonMember) =>
    m.raw_position_score != null && m.linear_score != null
    && m.raw_position_score >= 85 && m.raw_position_score > m.linear_score

  const barData = useMemo(
    () => [...ranked].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)).map(m => ({
      name: m.user_name || m.user_key,
      岗位分: m.final_position_score ?? 0,
      组织分: m.total_org_score ?? 0,
      distribution: m.distribution,
    })),
    [ranked],
  )

  const pagination = (len: number) =>
    len > PAGE_SIZE ? { pageSize: PAGE_SIZE, size: 'small' as const } : false

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  if (ranked.length === 0) return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/scoring')} />
        <Title level={4} style={{ margin: 0 }}>排名计算过程</Title>
      </div>
      <Empty description="暂无排名数据，请先完成评分计算" />
    </div>
  )

  const tabItems = [
    {
      key: 'growth',
      label: '1. 增长率 & 赋分',
      children: (
        <div>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            增长率 = (当前原始分 - 上赛季原始分) / 上赛季原始分。按岗位分组内按增长率降序，线性赋分：第1名 = 100分，最后1名 = 60分。保护机制：原始分 ≥ 85 时取 MAX(原始分, 赋分分)。
          </Typography.Paragraph>
          <Table
            dataSource={byGrowth}
            rowKey="id"
            size="small"
            pagination={pagination(byGrowth.length)}
            rowClassName={(m: SeasonMember) => protectionHighlighted(m) ? 'ant-table-row-selected' : ''}
            columns={[
              { title: '序', width: 60, render: (_: any, __: any, i: number) => <Text strong>{i + 1}</Text> },
              { title: '伙伴', dataIndex: 'user_name', ellipsis: true },
              { title: '岗位', dataIndex: 'job_role', render: (v: string) => jobRoleMap[v] || v || '-' },
              { title: '上赛季分', dataIndex: 'prev_raw_score', render: (v: number | null) => fmt(v) },
              { title: '当前原始分', dataIndex: 'raw_position_score', render: (v: number | null) => fmt(v) },
              { title: '增长率', dataIndex: 'growth', render: (v: number | null) => fmtGrowth(v) },
              { title: '赋分分', dataIndex: 'linear_score', render: (v: number | null) => <Text strong>{fmt(v)}</Text> },
              {
                title: '保护触发', render: (_: any, m: SeasonMember) => {
                  if (!protectionHighlighted(m)) return <Text type="secondary">-</Text>
                  return <Tag color="gold">MAX({fmt(m.raw_position_score)}, {fmt(m.linear_score)}) = {fmt(m.final_position_score)}</Tag>
                },
              },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'final',
      label: '2. 全局排名 & 271',
      children: (
        <div>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            个人总分 = 最终岗位分 + 组织分。全员按总分排名，271 分布：Top 20% = 2，Middle 70% = 7，Bottom 10% = 1。
          </Typography.Paragraph>
          {barData.length > 0 && (
            <ResponsiveContainer width="100%" height={Math.min(360, Math.max(220, barData.length * 44))}>
              <BarChart data={barData} layout="vertical" margin={{ left: 60, right: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={56} tick={{ fontSize: 12 }} />
                <RTooltip />
                <Legend />
                <Bar dataKey="岗位分" stackId="a" fill="#6366f1" />
                <Bar dataKey="组织分" stackId="a" fill="#38bdf8">
                  <LabelList
                    dataKey="distribution"
                    position="right"
                    formatter={(v: any) => v ? `[${v}]` : ''}
                    style={{ fontSize: 12, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <Table
            dataSource={globalRanked}
            rowKey="id"
            size="small"
            pagination={pagination(globalRanked.length)}
            style={{ marginTop: 16 }}
            columns={[
              { title: '排名', dataIndex: 'rank', width: 60, render: (v: number) => <Text strong>{v}</Text> },
              { title: '伙伴', dataIndex: 'user_name', ellipsis: true },
              { title: '岗位', dataIndex: 'job_role', render: (v: string) => jobRoleMap[v] || v || '-' },
              { title: '岗位分', dataIndex: 'final_position_score', render: (v: number | null) => fmt(v) },
              { title: '组织分', dataIndex: 'total_org_score', render: (v: number | null) => fmt(v) },
              { title: '总分', dataIndex: 'total_score', render: (v: number | null) => <Text strong>{fmt(v)}</Text> },
              { title: '271', dataIndex: 'distribution', render: (v: string) => v ? <Tag color={distColors[v]}>{v} ({distLabels[v]})</Tag> : '-' },
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/scoring')} />
        <Title level={4} style={{ margin: 0 }}>排名计算过程</Title>
        <Tag color="purple">{ranked.length} 位成员</Tag>
      </div>

      <Tabs type="card" items={tabItems} defaultActiveKey="growth" />

      {unranked.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">未排名成员（{unranked.length} 位）：{unranked.map(m => m.user_name).join('、')}</Text>
        </div>
      )}
    </div>
  )
}
