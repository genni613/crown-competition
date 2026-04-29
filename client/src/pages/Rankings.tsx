import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Tabs, Table, Tag, Avatar, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { getRankings } from '../api/scoring'
import type { SeasonMember } from '../types/models'

const jobRoles = [
  { key: 'product', label: '产品' },
  { key: 'design', label: '设计' },
  { key: 'tech', label: '研发' },
]

const distColors: Record<string, string> = { '2': '#52c41a', '7': '#1677ff', '1': '#ff4d4f' }

export default function Rankings() {
  const { seasonId } = useParams()
  const [role, setRole] = useState('product')
  const [data, setData] = useState<SeasonMember[]>([])
  const [loading, setLoading] = useState(false)

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
    { title: '部门', dataIndex: 'user_department_name' },
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
