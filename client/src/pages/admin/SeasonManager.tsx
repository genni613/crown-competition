import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, DatePicker, Tag, Space, Select, Popconfirm, message, Typography, Card, Avatar, Checkbox } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { getSeasons, createSeason, activateSeason, endSeason, getMembers, removeMember, addMembersBatch } from '../../api/seasons'
import { getLocalFeishuUsers } from '../../api/feishu'
import { copilotConfig } from '../../components/copilot/config'
import type { LocalFeishuUser } from '../../api/feishu'
import type { Season, SeasonMember } from '../../types/models'
import { formatDate } from '../../utils/datetime'

const statusColors: Record<string, string> = { draft: 'default', active: 'green', ended: 'red' }
const statusLabels: Record<string, string> = { draft: '草稿', active: '进行中', ended: '已结束' }
const gradeOptions = ['A', 'B+', 'B', 'B-', 'C'].map(g => ({ label: g, value: g }))
const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

export default function SeasonManager() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [feishuUsers, setFeishuUsers] = useState<LocalFeishuUser[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number>()
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { loadSeasons(); getLocalFeishuUsers().then(r => setFeishuUsers(r.data)) }, [])

  useCopilotReadable(
    copilotConfig.enabled ? {
      description: '用户当前在赛季管理页面。如果用户问赛季相关问题，请基于这些数据回答',
      value: seasons.length > 0
        ? { total: seasons.length, active: seasons.filter(s => s.status === 'active').length, draft: seasons.filter(s => s.status === 'draft').length, ended: seasons.filter(s => s.status === 'ended').length, activeSeasonName: seasons.find(s => s.status === 'active')?.name || null }
        : '暂无赛季',
    } : null as any,
  )

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_seasons',
      description: '查询所有赛季列表，包括名称、时间范围和状态',
      parameters: [],
      handler: async () => {
        try {
          const res = await getSeasons()
          return { seasons: res.data }
        } catch (e: any) {
          return { error: e.message || '查询赛季失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>
        const list: Season[] = result.seasons
        if (!list?.length) return <Typography.Text type="secondary">暂无赛季</Typography.Text>
        return (
          <Card size="small" style={{ maxWidth: 440 }}>
            {list.map(s => (
              <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid #fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Typography.Text strong style={{ fontSize: 13 }}>{s.name}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{formatDate(s.start_date)} ~ {formatDate(s.end_date)}</Typography.Text>
                </div>
                <Tag color={statusColors[s.status]} style={{ margin: 0 }}>{statusLabels[s.status]}</Tag>
              </div>
            ))}
          </Card>
        )
      },
    } : null as any,
  )

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

  const [selectedUserKeys, setSelectedUserKeys] = useState<string[]>([])
  const [gradeMap, setGradeMap] = useState<Record<string, string>>({})
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())

  async function onAddMember() {
    if (!selectedSeason || selectedUserKeys.length === 0) return

    const res = await addMembersBatch(selectedSeason, {
      members: selectedUserKeys.map(uk => ({ user_key: uk, performance_grade: gradeMap[uk] || undefined })),
    })
    const { added, skipped } = res.data
    if (added > 0) message.success(`成功添加 ${added} 名成员`)
    if (skipped.length > 0) {
      Modal.info({
        title: '部分成员已跳过',
        content: (
          <div>
            {skipped.map((s, i) => (
              <div key={i}>{s.name || s.user_key}：{s.reason}</div>
            ))}
          </div>
        ),
      })
    }
    setSelectedUserKeys([])
    setGradeMap({})
    showMembers(selectedSeason)
  }

  const columns = [
    { title: '赛季名称', dataIndex: 'name' },
    { title: '时间', render: (_: any, r: Season) => `${formatDate(r.start_date)} ~ ${formatDate(r.end_date)}` },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s]}</Tag> },
    { title: '操作', render: (_: any, r: Season) => (
      <Space>
        <Button size="small" onClick={() => showMembers(r.id)}>成员</Button>
        {r.status === 'draft' && <Button size="small" type="primary" onClick={async () => { await activateSeason(r.id); message.success('已激活'); loadSeasons() }}>激活</Button>}
        {r.status === 'active' && <Button size="small" danger onClick={async () => { await endSeason(r.id); message.success('已结束'); loadSeasons() }}>结束</Button>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>赛季管理</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>创建和管理竞赛赛季</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建赛季</Button>
      </div>

      <Table dataSource={seasons} columns={columns} rowKey="id" size="middle" />

      <Modal title="创建赛季" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item
            name="name"
            label="赛季名称"
            extra="建议使用统一格式，例如 2026-Q2，方便后续检索和归档。"
            rules={[{ required: true }]}
          >
            <Input placeholder="例如：2026-Q2" />
          </Form.Item>
          <Form.Item name="dates" label="时间范围" rules={[{ required: true }]}><DatePicker.RangePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="成员管理" open={!!selectedSeason} onCancel={() => setSelectedSeason(undefined)} footer={null} width={700}>
        <Table dataSource={members} columns={memberColumns} rowKey="id" size="small" pagination={false} />
        <Card title="添加成员" size="small" style={{ marginTop: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            多选用户后批量添加，岗位自动从飞书用户信息带出。勾选多人后可点击绩效等级批量赋值。
          </Typography.Paragraph>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
            <Select
              mode="multiple"
              showSearch
              placeholder="搜索并选择用户"
              optionFilterProp="label"
              style={{ minWidth: 320 }}
              value={selectedUserKeys}
              onChange={keys => { setSelectedUserKeys(keys); setCheckedKeys(new Set()) }}
              optionRender={({ data: { label, value } }) => {
                const u = feishuUsers.find(f => f.user_key === value)
                return <Space><Avatar src={u?.avatar_url} size="small" />{label}</Space>
              }}
            >
              {feishuUsers.map(u => <Select.Option key={u.user_key} value={u.user_key} label={u.name}>{u.name}</Select.Option>)}
            </Select>
            <Button type="primary" onClick={onAddMember} disabled={selectedUserKeys.length === 0}>
              批量添加
            </Button>
          </div>
          {selectedUserKeys.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <Checkbox
                  checked={checkedKeys.size === selectedUserKeys.length && selectedUserKeys.length > 0}
                  indeterminate={checkedKeys.size > 0 && checkedKeys.size < selectedUserKeys.length}
                  onChange={e => setCheckedKeys(e.target.checked ? new Set(selectedUserKeys) : new Set())}
                >
                  全选
                </Checkbox>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>已勾选 {checkedKeys.size} 人，批量设为：</span>
                {gradeOptions.map(o => (
                  <Tag
                    key={o.value}
                    style={{ cursor: checkedKeys.size > 0 ? 'pointer' : 'not-allowed', opacity: checkedKeys.size > 0 ? 1 : 0.4 }}
                    color="blue"
                    onClick={() => {
                      if (checkedKeys.size === 0) return
                      setGradeMap(prev => {
                        const next = { ...prev }
                        for (const k of checkedKeys) next[k] = o.value
                        return next
                      })
                    }}
                  >
                    {o.label}
                  </Tag>
                ))}
                <Tag
                  style={{ cursor: checkedKeys.size > 0 ? 'pointer' : 'not-allowed', opacity: checkedKeys.size > 0 ? 1 : 0.4 }}
                  onClick={() => {
                    if (checkedKeys.size === 0) return
                    setGradeMap(prev => {
                      const next = { ...prev }
                      for (const k of checkedKeys) delete next[k]
                      return next
                    })
                  }}
                >
                  清除绩效
                </Tag>
              </div>
              {selectedUserKeys.map(uk => {
                const u = feishuUsers.find(f => f.user_key === uk)
                const roleLabel = u?.job_role ? jobRoleOptions.find(j => j.value === u.job_role)?.label : null
                return (
                  <div key={uk} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <Checkbox
                      checked={checkedKeys.has(uk)}
                      onChange={e => {
                        setCheckedKeys(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(uk) : next.delete(uk)
                          return next
                        })
                      }}
                    />
                    <Tag color={roleLabel ? 'green' : 'warning'}>
                      {u?.name ?? uk} {roleLabel ? `· ${roleLabel}` : '· 岗位未设置'}
                    </Tag>
                    <Tag color={gradeMap[uk] ? 'geekblue' : undefined} style={{ marginRight: 0 }}>
                      {gradeMap[uk] ? `绩效 ${gradeMap[uk]}` : '未设绩效'}
                    </Tag>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </Modal>
    </div>
  )
}
