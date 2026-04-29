import { useEffect, useState } from 'react'
import { Table, Tag, Typography, Empty } from 'antd'
import { getSeasons } from '../api/seasons'
import { getMyEvidence } from '../api/evidence'
import { useAuthStore } from '../store/authStore'
import type { Season } from '../types/models'

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

export default function EvidenceList() {
  const { user } = useAuthStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [data, setData] = useState<any[]>([])
  const [seasonId, setSeasonId] = useState<number>()

  useEffect(() => {
    getSeasons().then(res => {
      setSeasons(res.data)
      const active = res.data.find((s: Season) => s.status === 'active')
      if (active) { setSeasonId(active.id); loadEvidence(active.id) }
    })
  }, [])

  async function loadEvidence(sid: number) {
    const res = await getMyEvidence(sid)
    setData(res.data)
  }

  const columns = [
    { title: '标题', dataIndex: 'title' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', render: (s: string) => {
      const m = statusMap[s]
      return <Tag color={m.color}>{m.label}</Tag>
    }},
    { title: '审核意见', dataIndex: 'review_comment' },
  ]

  return (
    <div>
      <Typography.Title level={4}>我的举证</Typography.Title>
      {data.length === 0 ? <Empty description="暂无举证记录" /> : (
        <Table dataSource={data} columns={columns} rowKey="id" size="middle" />
      )}
    </div>
  )
}
