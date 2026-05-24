import { useEffect, useState } from 'react'
import { Avatar, Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined, UserOutlined } from '@ant-design/icons'
import { getSeasons } from '../../api/seasons'
import { getMemberDirectory, updateMemberDirectoryJobRole } from '../../api/users'
import type { MemberDirectoryItem, Season } from '../../types/models'
import { formatDate } from '../../utils/datetime'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
  { label: '测试', value: 'test' },
]

const participantRoleValues = new Set(['product', 'design', 'tech'])

const subRoleOptions = [
  { label: '客户端', value: 'client' },
  { label: '前端', value: 'frontend' },
  { label: '后端', value: 'backend' },
]

const jobRoleLabelMap: Record<string, string> = {
  product: '产品',
  design: '设计',
  tech: '研发',
  test: '测试',
}

export default function MemberDirectory() {
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberDirectoryItem[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<number | undefined>(undefined)
  const [jobRole, setJobRole] = useState<string | undefined>(undefined)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    void loadSeasons()
    void loadRows()
  }, [])

  async function loadSeasons() {
    try {
      const res = await getSeasons()
      setSeasons(res.data)
      const activeSeason = res.data.find(item => item.status === 'active')
      if (activeSeason) setSeasonId(activeSeason.id)
    } catch {
      message.error('加载赛季失败')
    }
  }

  async function loadRows() {
    setLoading(true)
    try {
      const res = await getMemberDirectory({
        seasonId,
        jobRole,
        keyword: keyword.trim() || undefined,
      })
      setRows(res.data)
    } catch {
      message.error('加载人员目录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [seasonId, jobRole])

  async function saveRole(row: MemberDirectoryItem, nextRole: string | null, nextSubRole: string | null) {
    if (!row.user_key) {
      message.error('该人员缺少 user_key，暂时无法维护岗位')
      return
    }
    setSavingKey(row.user_key)
    try {
      await updateMemberDirectoryJobRole(row.user_key, {
        job_role: nextRole,
        sub_role: nextRole === 'tech' ? nextSubRole : null,
        syncDraftSeasonMembers: false,
      })
      message.success('岗位已更新')
      await loadRows()
    } catch (error: any) {
      message.error(error?.response?.data?.error || '更新岗位失败')
    } finally {
      setSavingKey(null)
    }
  }

  const selectedSeason = seasons.find(item => item.id === seasonId)

  const columns = [
    {
      title: '人员',
      key: 'name',
      render: (_: unknown, row: MemberDirectoryItem) => (
        <Space>
          <Avatar src={row.avatar_url} icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{row.email || row.user_key || '-'}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '部门 / 职级',
      key: 'dept',
      render: (_: unknown, row: MemberDirectoryItem) => (
        <div>
          <div>{row.department_name || '-'}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{row.title || '-'}</div>
        </div>
      ),
    },
    {
      title: '岗位',
      key: 'job_role',
      render: (_: unknown, row: MemberDirectoryItem) => (
        <Select
          size="small"
          style={{ width: 110 }}
          value={row.job_role || undefined}
          placeholder="未设置"
          allowClear
          loading={savingKey === row.user_key}
          options={jobRoleOptions}
          onChange={value => void saveRole(row, value ?? null, value === 'tech' ? row.sub_role : null)}
        />
      ),
    },
    {
      title: '子岗位',
      key: 'sub_role',
      render: (_: unknown, row: MemberDirectoryItem) => row.job_role === 'tech' ? (
        <Select
          size="small"
          style={{ width: 110 }}
          value={row.sub_role || undefined}
          placeholder="未设置"
          allowClear
          loading={savingKey === row.user_key}
          options={subRoleOptions}
          onChange={value => void saveRole(row, 'tech', value ?? null)}
        />
      ) : (
        <span style={{ color: '#d4d4d8' }}>-</span>
      ),
    },
    {
      title: selectedSeason ? `${selectedSeason.name} 参赛状态` : '参赛状态',
      key: 'season_status',
      render: (_: unknown, row: MemberDirectoryItem) => {
        if (!row.job_role) return <Tag>未设置岗位</Tag>
        if (!participantRoleValues.has(row.job_role)) return <Tag color="purple">非参赛岗位</Tag>
        if (row.selected_season_member_id) {
          return <Tag color="green">已参赛{row.selected_rank ? ` · 第 ${row.selected_rank} 名` : ''}</Tag>
        }
        return <Tag color="default">未参赛</Tag>
      },
    },
    {
      title: '提示',
      key: 'anomalies',
      render: (_: unknown, row: MemberDirectoryItem) => (
        row.anomalies.length > 0
          ? <Space size={[4, 4]} wrap>{row.anomalies.map(item => <Tag key={item} color="warning">{item}</Tag>)}</Space>
          : <Tag color="success">正常</Tag>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>人员目录</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>
            维护全员岗位。测试在这里标记为测试岗位，但不进入赛季排名。
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadRows()} loading={loading}>刷新</Button>
      </div>

      <Card style={{ borderRadius: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="查看赛季"
            style={{ width: 180 }}
            value={seasonId}
            options={seasons.map(item => ({ value: item.id, label: `${item.name} · ${formatDate(item.start_date)} ~ ${formatDate(item.end_date)}` }))}
            onChange={value => setSeasonId(value)}
          />
          <Select
            allowClear
            placeholder="按岗位筛选"
            style={{ width: 140 }}
            value={jobRole}
            options={jobRoleOptions}
            onChange={value => setJobRole(value)}
          />
          <Input.Search
            allowClear
            placeholder="搜姓名 / 邮箱"
            style={{ width: 240 }}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={() => void loadRows()}
          />
        </Space>

        <Table
          rowKey={row => row.user_key || row.open_id || row.name}
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 980 }}
        />
      </Card>
    </div>
  )
}
