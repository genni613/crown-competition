import { useEffect, useState } from 'react'
import { Table, Tag, Button, Input, Space, message, Typography, Modal } from 'antd'
import { getPendingEvidence, reviewEvidence } from '../../api/evidence'

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

export default function EvidenceReview() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await getPendingEvidence()
      setData(res.data)
    } finally { setLoading(false) }
  }

  async function handleReview(id: number, status: string) {
    const comment = status === 'rejected' ? (await new Promise<string>(resolve => {
      let val = ''
      Modal.confirm({
        title: '驳回原因',
        content: <Input.TextArea rows={3} onChange={e => val = e.target.value} />,
        onOk: () => resolve(val),
      })
    })) : undefined

    await reviewEvidence(id, status, comment)
    message.success(status === 'approved' ? '已通过' : '已驳回')
    load()
  }

  const columns = [
    { title: '提交人', dataIndex: 'user_name' },
    { title: '标题', dataIndex: 'title' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label}</Tag> },
    { title: '操作', render: (_: any, r: any) => r.status === 'pending' ? (
      <Space>
        <Button size="small" type="primary" onClick={() => handleReview(r.id, 'approved')}>通过</Button>
        <Button size="small" danger onClick={() => handleReview(r.id, 'rejected')}>驳回</Button>
      </Space>
    ) : '-' },
  ]

  return (
    <div>
      <Typography.Title level={4}>举证审核</Typography.Title>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />
    </div>
  )
}
