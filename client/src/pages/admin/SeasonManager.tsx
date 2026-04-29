import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Modal, Form, Input, DatePicker, Tag, Space, Select, Popconfirm, message, Typography, Card } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getSeasons, createSeason, activateSeason, endSeason, getMembers, addMember, removeMember } from '../../api/seasons'
import { getUsers } from '../../api/users'
import type { Season, SeasonMember, User } from '../../types/models'

const statusColors: Record<string, string> = { draft: 'default', active: 'green', ended: 'red' }
const statusLabels: Record<string, string> = { draft: '草稿', active: '进行中', ended: '已结束' }
const gradeOptions = ['A', 'B+', 'B', 'B-', 'C'].map(g => ({ label: g, value: g }))
const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

export default function SeasonManager() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number>()
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()

  useEffect(() => { loadSeasons(); getUsers().then(r => setUsers(r.data)) }, [])

  async function loadSeasons() {
    const res = await getSeasons()
    setSeasons(res.data)
  }

  async function showMembers(seasonId: number) {
    setSelectedSeason(seasonId)
    const res = await getMembers(seasonId)
    setMembers(res.data)
  }

  async function onCreate(values: any) {
    await createSeason({ ...values, start_date: values.dates[0].format('YYYY-MM-DD'), end_date: values.dates[1].format('YYYY-MM-DD') })
    message.success('创建成功')
    setCreateOpen(false)
    form.resetFields()
    loadSeasons()
  }

  async function onAddMember(values: any) {
    if (!selectedSeason) return
    await addMember(selectedSeason, values)
    message.success('添加成功')
    memberForm.resetFields()
    showMembers(selectedSeason)
  }

  const columns = [
    { title: '赛季名称', dataIndex: 'name' },
    { title: '时间', render: (_: any, r: Season) => `${r.start_date} ~ ${r.end_date}` },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s]}</Tag> },
    { title: '操作', render: (_: any, r: Season) => (
      <Space>
        <Button size="small" onClick={() => showMembers(r.id)}>成员</Button>
        {r.status === 'draft' && <Button size="small" type="primary" onClick={async () => { await activateSeason(r.id); message.success('已激活'); loadSeasons() }}>激活</Button>}
        {r.status === 'active' && <Button size="small" danger onClick={async () => { await endSeason(r.id); message.success('已结束'); loadSeasons() }}>结束</Button>}
        {r.status === 'active' && <Button size="small" onClick={() => navigate(`/admin/scores/${r.id}`)}>录入分数</Button>}
        <Button size="small" onClick={() => navigate(`/admin/feishu/${r.id}`)}>飞书工时</Button>
      </Space>
    )},
  ]

  const memberColumns = [
    { title: '成员', dataIndex: 'user_name' },
    { title: '岗位', dataIndex: 'job_role', render: (v: string) => jobRoleOptions.find(j => j.value === v)?.label ?? '-' },
    { title: '上期绩效', dataIndex: 'performance_grade', render: (value: string | null) => value || '-' },
    { title: '操作', render: (_: any, r: SeasonMember) => (
      <Popconfirm title="确认移除？" onConfirm={async () => { await removeMember(r.season_id, r.id); message.success('已移除'); showMembers(r.season_id) }}>
        <Button size="small" danger>移除</Button>
      </Popconfirm>
    )},
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>赛季管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建赛季</Button>
      </div>

      <Table dataSource={seasons} columns={columns} rowKey="id" size="middle" />

      <Modal title="创建赛季" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="name" label="赛季名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="dates" label="时间范围" rules={[{ required: true }]}><DatePicker.RangePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="成员管理" open={!!selectedSeason} onCancel={() => setSelectedSeason(undefined)} footer={null} width={700}>
        <Table dataSource={members} columns={memberColumns} rowKey="id" size="small" pagination={false} />
        <Card title="添加成员" size="small" style={{ marginTop: 16 }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            上期绩效仅作为增长保护基线，可选填写；本赛季分数仍由飞书数据、举证审批和管理员录分共同计算。
          </Typography.Paragraph>
          <Form form={memberForm} layout="inline" onFinish={onAddMember}>
            <Form.Item name="user_id" rules={[{ required: true }]}>
              <Select showSearch placeholder="选择用户" optionFilterProp="label" style={{ width: 150 }}>
                {users.map(u => <Select.Option key={u.id} value={u.id} label={u.name}>{u.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="job_role" rules={[{ required: true }]}>
              <Select placeholder="岗位" style={{ width: 100 }}>{jobRoleOptions.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}</Select>
            </Form.Item>
            <Form.Item name="performance_grade">
              <Select placeholder="上期绩效" allowClear style={{ width: 110 }}>
                {gradeOptions.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item><Button type="primary" htmlType="submit">添加</Button></Form.Item>
          </Form>
        </Card>
      </Modal>
    </div>
  )
}
