import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Tabs, Table, Tag, Avatar, Typography, Card } from 'antd'
import { UserOutlined, TrophyOutlined, CrownOutlined } from '@ant-design/icons'
import { useCopilotAction } from '@copilotkit/react-core'
import { getRankings } from '../api/scoring'
import { copilotConfig } from '../components/copilot/config'
import { useAuthStore } from '../store/authStore'
import type { SeasonMember } from '../types/models'

const jobRoles = [
  { key: 'product', label: '产品' },
  { key: 'design', label: '设计' },
  { key: 'tech', label: '研发' },
]

const distColors: Record<string, string> = { '2': '#10b981', '7': '#6366f1', '1': '#f59e0b' }
const distLabels: Record<string, string> = { '2': '优秀', '7': '达标', '1': '待改进' }

export default function Rankings() {
  const { seasonId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'
  const [role, setRole] = useState('product')
  const [data, setData] = useState<SeasonMember[]>([])
  const [loading, setLoading] = useState(false)

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_rankings',
      description: '查询当前赛季的排名，可按岗位筛选（product/design/tech）',
      parameters: [
        { name: 'jobRole', type: 'string', required: false, description: '岗位筛选：product/design/tech，不传则查全部' },
      ],
      handler: async ({ jobRole }: { jobRole?: string }) => {
        if (!seasonId) return { error: '未选择赛季' }
        try {
          const res = await getRankings(Number(seasonId), jobRole || undefined)
          return { rankings: res.data, currentUserKey: user?.user_key }
        } catch (e: any) {
          return { error: e.message || '查询排名失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询排名...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>

        const rankings: SeasonMember[] = result.rankings
        if (!rankings?.length) return <Typography.Text type="secondary">暂无排名数据</Typography.Text>

        return (
          <Card size="small" style={{ maxHeight: 320, overflow: 'auto', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eef2ff' }}>
                  <th style={{ padding: 6, textAlign: 'center', fontWeight: 600 }}>排名</th>
                  <th style={{ padding: 6, textAlign: 'left', fontWeight: 600 }}>成员</th>
                  <th style={{ padding: 6, textAlign: 'center', fontWeight: 600 }}>总分</th>
                  <th style={{ padding: 6, textAlign: 'center', fontWeight: 600 }}>271</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const isMe = r.user_key === result.currentUserKey
                  return (
                    <tr key={r.id} style={{ background: isMe ? '#eef2ff' : undefined, borderBottom: '1px solid #f5f3ff' }}>
                      <td style={{ padding: 6, textAlign: 'center', fontWeight: isMe ? 700 : 400 }}>{r.rank ? `#${r.rank}` : '-'}</td>
                      <td style={{ padding: 6 }}>{isMe ? <Typography.Text strong>{r.user_name}</Typography.Text> : r.user_name}</td>
                      <td style={{ padding: 6, textAlign: 'center', fontWeight: 700, color: '#4f46e5' }}>{r.total_score?.toFixed(1) ?? '-'}</td>
                      <td style={{ padding: 6, textAlign: 'center' }}>{r.distribution ? <Tag color={distColors[r.distribution]} style={{ margin: 0, color: '#fff', border: 'none' }}>{r.distribution}</Tag> : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )
      },
    } : null as any,
  )

  useEffect(() => {
    if (seasonId) load(role)
  }, [seasonId, role])

  async function load(r: string) {
    setLoading(true)
    try {
      const res = await getRankings(Number(seasonId), r)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '排名', dataIndex: 'rank', width: 70, render: (_v: any, _record: any, index: number) => {
      const rank = index + 1
      if (rank <= 3) {
        return (
          <span className={`rank-podium rank-podium-${rank}`}>
            {rank === 1 ? <CrownOutlined style={{ fontSize: 14 }} /> : rank}
          </span>
        )
      }
      return <span style={{ fontWeight: 600, color: '#64748b', paddingLeft: 4 }}>{rank}</span>
    }},
    { title: '成员', dataIndex: 'user_name', render: (name: string, r: SeasonMember) => {
      const isMe = r.user_key === user?.user_key
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            src={r.user_avatar_url}
            icon={<UserOutlined />}
            size={34}
            style={{
              background: isMe ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '#e0e7ff',
              boxShadow: isMe ? '0 0 0 2px #fff, 0 0 0 3px #a5b4fc' : 'none',
            }}
          />
          <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? '#4f46e5' : '#1e1b4b' }}>{name}</span>
        </span>
      )
    }},
    { title: '部门', dataIndex: 'user_department_name', render: (v: string | null) => <span style={{ color: '#64748b' }}>{v || '-'}</span> },
    { title: '岗位分', dataIndex: 'final_position_score', render: (v: number) => <span style={{ fontWeight: 600 }}>{v?.toFixed(1) ?? '-'}</span> },
    { title: '组织分', dataIndex: 'total_org_score', render: (v: number) => <span style={{ fontWeight: 600 }}>{v?.toFixed(1) ?? '0'}</span> },
    { title: '总分', dataIndex: 'total_score', render: (v: number) => (
      <Typography.Text strong style={{ fontSize: 15, color: '#4f46e5', fontVariantNumeric: 'tabular-nums' }}>{v?.toFixed(1) ?? '-'}</Typography.Text>
    )},
    { title: '271', dataIndex: 'distribution', render: (v: string) => v ? (
      <Tag color={distColors[v]} style={{ color: '#fff', border: 'none', margin: 0, fontWeight: 600, padding: '2px 12px' }}>
        {distLabels[v] || v}
      </Tag>
    ) : '-' },
  ]

  return (
    <div className="anim-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18,
          boxShadow: '0 2px 12px rgba(99, 102, 241, 0.3)',
        }}>
          <TrophyOutlined />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#1e1b4b' }}>排名看板</Typography.Title>
        </div>
      </div>
      <Card style={{ borderRadius: 14, border: 'none' }} styles={{ body: { padding: '4px 0 0' } }}>
        <Tabs
          items={jobRoles.map(j => ({ key: j.key, label: j.label }))}
          onChange={setRole}
          style={{ padding: '0 20px' }}
        />
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          rowClassName={(record: any) => record.user_key === user?.user_key ? 'ant-table-row-selected' : ''}
          onRow={(record: any) => ({
            style: {
              ...(record.user_key === user?.user_key ? { background: '#eef2ff' } : {}),
              ...(isAdmin ? { cursor: 'pointer' } : {}),
            },
            onClick: () => {
              if (isAdmin && seasonId) {
                navigate(`/admin/member-score/${seasonId}/${record.id}`)
              }
            },
          })}
        />
      </Card>
    </div>
  )
}
