import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Tabs, Table, Tag, Avatar, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
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

const distColors: Record<string, string> = { '2': '#52c41a', '7': '#1677ff', '1': '#ff4d4f' }

export default function Rankings() {
  const { seasonId } = useParams()
  const { user } = useAuthStore()
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
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ padding: 4, textAlign: 'center' }}>排名</th>
                  <th style={{ padding: 4, textAlign: 'left' }}>成员</th>
                  <th style={{ padding: 4, textAlign: 'center' }}>总分</th>
                  <th style={{ padding: 4, textAlign: 'center' }}>271</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const isMe = r.user_key === result.currentUserKey
                  return (
                    <tr key={r.id} style={{ background: isMe ? '#e6f4ff' : undefined, borderBottom: '1px solid #fafafa' }}>
                      <td style={{ padding: 4, textAlign: 'center', fontWeight: isMe ? 700 : 400 }}>{r.rank ? `#${r.rank}` : '-'}</td>
                      <td style={{ padding: 4 }}>{isMe ? <Typography.Text strong>{r.user_name}</Typography.Text> : r.user_name}</td>
                      <td style={{ padding: 4, textAlign: 'center', fontWeight: 600 }}>{r.total_score?.toFixed(1) ?? '-'}</td>
                      <td style={{ padding: 4, textAlign: 'center' }}>{r.distribution ? <Tag color={distColors[r.distribution]} style={{ margin: 0 }}>{r.distribution}</Tag> : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
    { title: '排名', dataIndex: 'rank', width: 60, render: (v: number) => v ? `#${v}` : '-' },
    { title: '成员', dataIndex: 'user_name', render: (name: string, r: SeasonMember) => (
      <span><Avatar src={r.user_avatar_url} icon={<UserOutlined />} size="small" style={{ marginRight: 8 }} />{name}</span>
    )},
    { title: '部门', dataIndex: 'user_department_name', render: (v: string | null) => v || '-' },
    { title: '岗位分', dataIndex: 'final_position_score', render: (v: number) => v?.toFixed(1) ?? '-' },
    { title: '组织分', dataIndex: 'total_org_score', render: (v: number) => v?.toFixed(1) ?? '0' },
    { title: '总分', dataIndex: 'total_score', render: (v: number) => <Typography.Text strong>{v?.toFixed(1) ?? '-'}</Typography.Text> },
    { title: '271', dataIndex: 'distribution', render: (v: string) => v ? <Tag color={distColors[v]}>{v}</Tag> : '-' },
  ]

  return (
    <div>
      <Typography.Title level={4}>排名看板</Typography.Title>
      <Tabs items={jobRoles.map(j => ({ key: j.key, label: j.label }))} onChange={setRole} />
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} pagination={false} size="middle" />
    </div>
  )
}
