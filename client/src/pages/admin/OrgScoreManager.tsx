import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Table, Button, InputNumber, Select, message, Typography, Space, Modal, Form, Input } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getMembers } from '../../api/seasons'
import { getOrgScoreTypes, getOrgScores, addOrgScore, deleteOrgScore } from '../../api/orgScores'
import type { SeasonMember, OrgScoreType } from '../../types/models'

export default function OrgScoreManager() {
  const { seasonId } = useParams()
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [types, setTypes] = useState<OrgScoreType[]>([])
  const [scoreData, setScoreData] = useState<Record<number, any[]>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<number>()
  const [form] = Form.useForm()

  useEffect(() => { loadData() }, [seasonId])

  async function loadData() {
    if (!seasonId) return
    const [memRes, typeRes] = await Promise.all([getMembers(Number(seasonId)), getOrgScoreTypes()])
    setMembers(memRes.data)
    setTypes(typeRes.data)

    const data: Record<number, any[]> = {}
    for (const m of memRes.data) {
      try {
        const res = await getOrgScores(Number(seasonId), m.id)
        data[m.id] = res.data
      } catch { data[m.id] = [] }
    }
    setScoreData(data)
  }

  async function onAdd(values: any) {
    if (!seasonId || !selectedMember) return
    try {
      await addOrgScore(Number(seasonId), selectedMember, values)
      message.success('添加成功')
      setAddOpen(false)
      form.resetFields()
      loadData()
    } catch (e: any) {
      message.error(e.response?.data?.error || '添加失败')
    }
  }

  const columns = [
    { title: '成员', dataIndex: 'user_name', fixed: 'left' as const, width: 100 },
    ...types.map(t => ({
      title: t.display_name,
      dataIndex: `org_${t.id}`,
      width: 150,
      render: (_: any, record: SeasonMember) => {
        const items = scoreData[record.id]?.filter((s: any) => s.org_score_type_id === t.id) || []
        const total = items.reduce((sum: number, s: any) => sum + s.points, 0)
        return total > 0 ? (
          <span>
            {total.toFixed(1)}分
            {items.map((item: any) => (
              <Button key={item.id} type="link" size="small" danger onClick={async () => {
                await deleteOrgScore(item.id)
                message.success('已删除')
                loadData()
              }}>删</Button>
            ))}
          </span>
        ) : '-'
      },
    })),
    {
      title: '合计', width: 80,
      render: (_: any, record: SeasonMember) => record.total_org_score?.toFixed(1) ?? '0',
    },
    {
      title: '操作', width: 60,
      render: (_: any, record: SeasonMember) => (
        <Button size="small" icon={<PlusOutlined />} onClick={() => { setSelectedMember(record.id); setAddOpen(true) }} />
      ),
    },
  ]

  return (
    <div>
      <Typography.Title level={4}>组织分管理</Typography.Title>
      <Table dataSource={members} columns={columns} rowKey="id" size="small" scroll={{ x: 'max-content' }} pagination={false} />

      <Modal title="添加组织分" open={addOpen} onCancel={() => setAddOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={onAdd}>
          <Form.Item name="org_score_type_id" label="类型" rules={[{ required: true }]}>
            <Select options={types.map(t => ({ label: `${t.display_name} (${t.points_per_unit > 0 ? '+' : ''}${t.points_per_unit}分)`, value: t.id }))} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" initialValue={1}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="说明"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
