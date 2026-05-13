import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { ReloadOutlined, SyncOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { getSeasons } from '../../api/seasons'
import { syncMemberSeasonScore } from '../../api/feishu'
import {
  getMemberDirectory,
  getMemberSeasonHistory,
  updateMemberDirectoryJobRole,
} from '../../api/users'
import type { MemberDirectoryItem, MemberSeasonHistoryItem, Season } from '../../types/models'
import { formatDate, formatDateTime } from '../../utils/datetime'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

const subRoleOptions = [
  { label: '客户端', value: 'client' },
  { label: '前端', value: 'frontend' },
  { label: '后端', value: 'backend' },
]

const seasonStatusColor: Record<string, string> = {
  draft: 'default',
  active: 'green',
  ended: 'red',
}

const seasonStatusLabel: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
}

const roleLabelMap: Record<string, string> = {
  product: '产品',
  design: '设计',
  tech: '研发',
  client: '客户端',
  frontend: '前端',
  backend: '后端',
}

function renderScore(value: number | null | undefined) {
  return value == null ? '-' : value.toFixed(1)
}

function renderRole(jobRole: string | null, subRole: string | null) {
  if (!jobRole) return '-'
  if (jobRole !== 'tech') return roleLabelMap[jobRole] || jobRole
  return `${roleLabelMap[jobRole] || jobRole} / ${roleLabelMap[subRole || ''] || '未设置'}`
}

function getMemberIdentityKey(record: MemberDirectoryItem) {
  return record.user_key || record.open_id || String(record.user_id || record.name)
}

export default function MemberManager() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()
  const [members, setMembers] = useState<MemberDirectoryItem[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [jobRole, setJobRole] = useState<string>()
  const [department, setDepartment] = useState<string>()
  const [keyword, setKeyword] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberDirectoryItem | null>(null)
  const [history, setHistory] = useState<MemberSeasonHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingJobRole, setEditingJobRole] = useState<string | null>(null)
  const [editingSubRole, setEditingSubRole] = useState<string | null>(null)
  const [syncDraftSeasonMembers, setSyncDraftSeasonMembers] = useState(true)
  const [savingRole, setSavingRole] = useState(false)
  const [syncingMemberKey, setSyncingMemberKey] = useState<string | null>(null)

  useEffect(() => {
    void loadSeasons()
  }, [])

  useEffect(() => {
    if (selectedSeasonId) {
      void loadMembers()
    }
  }, [selectedSeasonId, jobRole, department, anomalyOnly])

  const selectedSeason = useMemo(
    () => seasons.find(item => item.id === selectedSeasonId),
    [seasons, selectedSeasonId],
  )

  async function loadSeasons() {
    try {
      const res = await getSeasons()
      setSeasons(res.data)
      const activeSeason = res.data.find(item => item.status === 'active')
      const fallbackSeason = activeSeason?.id ?? res.data[0]?.id
      setSelectedSeasonId(prev => prev ?? fallbackSeason)
    } catch (error) {
      console.error(error)
      message.error('加载赛季失败')
    }
  }

  async function loadMembers(nextKeyword?: string) {
    const seasonId = selectedSeasonId
    if (!seasonId) return

    setLoading(true)
    try {
      const searchKeyword = nextKeyword ?? keyword
      const res = await getMemberDirectory({
        seasonId,
        jobRole,
        department,
        keyword: searchKeyword || undefined,
        anomalyOnly,
      })
      setMembers(res.data)
      setDepartmentOptions(prev => {
        const merged = new Set(prev)
        res.data
          .map(item => item.department_name)
          .filter((item): item is string => Boolean(item))
          .forEach(item => merged.add(item))
        return Array.from(merged).sort((a, b) => a.localeCompare(b, 'zh-CN'))
      })
      if (selectedMember) {
        const latest = res.data.find(item => getMemberIdentityKey(item) === getMemberIdentityKey(selectedMember)) || null
        setSelectedMember(latest)
      }
    } catch (error) {
      console.error(error)
      message.error('加载成员台账失败')
    } finally {
      setLoading(false)
    }
  }

  async function openMemberDetail(record: MemberDirectoryItem) {
    setSelectedMember(record)
    setEditingJobRole(record.job_role)
    setEditingSubRole(record.sub_role)
    setSyncDraftSeasonMembers(true)
    setDrawerOpen(true)
    setHistoryLoading(true)
    try {
      if (record.user_key) {
        const res = await getMemberSeasonHistory(record.user_key)
        setHistory(res.data)
      } else {
        setHistory([])
      }
    } catch (error) {
      console.error(error)
      message.error('加载成员历史失败')
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleSaveJobRole() {
    if (!selectedMember) return
    if (!selectedMember.user_key) {
      message.warning('当前成员缺少 user_key，无法更新岗位')
      return
    }

    setSavingRole(true)
    try {
      await updateMemberDirectoryJobRole(selectedMember.user_key, {
        job_role: editingJobRole,
        sub_role: editingJobRole === 'tech' ? editingSubRole : null,
        syncDraftSeasonMembers,
      })
      const nextMember: MemberDirectoryItem = {
        ...selectedMember,
        job_role: (editingJobRole as MemberDirectoryItem['job_role']) ?? null,
        sub_role: editingJobRole === 'tech' ? (editingSubRole as MemberDirectoryItem['sub_role']) ?? null : null,
        system_job_role: (editingJobRole as MemberDirectoryItem['system_job_role']) ?? null,
        system_sub_role: editingJobRole === 'tech' ? (editingSubRole as MemberDirectoryItem['system_sub_role']) ?? null : null,
        anomalies: selectedMember.anomalies.filter(item => item !== '未配置岗位' && item !== '岗位数据不一致'),
      }
      setSelectedMember(nextMember)
      message.success('岗位已更新')
      await loadMembers()
    } catch (error) {
      console.error(error)
      message.error('更新岗位失败')
    } finally {
      setSavingRole(false)
    }
  }

  async function handleSyncMember(record: MemberDirectoryItem) {
    if (!selectedSeasonId || !record.user_key) {
      message.warning('当前成员缺少 user_key，无法同步')
      return
    }

    setSyncingMemberKey(getMemberIdentityKey(record))
    try {
      await syncMemberSeasonScore(selectedSeasonId, record.user_key)
      message.success('单人同步完成')
      await loadMembers()
      if (selectedMember && getMemberIdentityKey(selectedMember) === getMemberIdentityKey(record)) {
        const historyRes = await getMemberSeasonHistory(record.user_key)
        setHistory(historyRes.data)
      }
    } catch (error) {
      console.error(error)
      message.error('单人同步失败')
    } finally {
      setSyncingMemberKey(null)
    }
  }

  const columns = [
    {
      title: '成员',
      dataIndex: 'name',
      width: 220,
      render: (_: unknown, record: MemberDirectoryItem) => (
        <Space size={12}>
          <Avatar src={record.avatar_url} icon={<UserOutlined />} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{record.email || '-'}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '部门 / 岗位',
      key: 'org',
      width: 220,
      render: (_: unknown, record: MemberDirectoryItem) => (
        <div>
          <div style={{ color: '#0f172a' }}>{record.department_name || '-'}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{renderRole(record.job_role, record.sub_role)}</div>
        </div>
      ),
    },
    {
      title: '系统角色',
      dataIndex: 'role',
      width: 100,
      render: (value: string | null) => <Tag color={value === 'ADMIN' ? 'gold' : value === 'MEMBER' ? 'default' : 'blue'}>{value || '未登录'}</Tag>,
    },
    {
      title: '当前赛季总分',
      dataIndex: 'selected_total_score',
      width: 120,
      render: (value: number | null) => <span style={{ fontWeight: 600 }}>{renderScore(value)}</span>,
    },
    {
      title: '岗位分',
      dataIndex: 'selected_final_position_score',
      width: 100,
      render: (value: number | null) => renderScore(value),
    },
    {
      title: '组织分',
      dataIndex: 'selected_total_org_score',
      width: 100,
      render: (value: number | null) => renderScore(value),
    },
    {
      title: '历史季度分',
      dataIndex: 'latest_ended_total_score',
      width: 110,
      render: (value: number | null) => renderScore(value),
    },
    {
      title: '赛季数',
      dataIndex: 'season_count',
      width: 80,
    },
    {
      title: '最近同步',
      dataIndex: 'last_sync_at',
      width: 150,
      render: (value: string | null) => (
        <span style={{ color: '#64748b', fontSize: 12 }}>{value ? formatDateTime(value) : '-'}</span>
      ),
    },
    {
      title: '异常',
      dataIndex: 'anomalies',
      width: 220,
      render: (values: string[]) => values.length > 0 ? (
        <Space size={[4, 4]} wrap>
          {values.map(item => <Tag color="orange" key={item}>{item}</Tag>)}
        </Space>
      ) : <Tag color="green">正常</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 210,
      render: (_: unknown, record: MemberDirectoryItem) => (
        <Space>
          <Button size="small" onClick={() => openMemberDetail(record)}>详情</Button>
          <Button
            size="small"
            icon={<SyncOutlined />}
            loading={syncingMemberKey === getMemberIdentityKey(record)}
            onClick={() => handleSyncMember(record)}
          >
            单人同步
          </Button>
        </Space>
      ),
    },
  ]

  const historyColumns = [
    { title: '赛季', dataIndex: 'season_name', render: (value: string, record: MemberSeasonHistoryItem) => (
      <Space size={8}>
        <span>{value}</span>
        <Tag color={seasonStatusColor[record.season_status]}>{seasonStatusLabel[record.season_status]}</Tag>
      </Space>
    ) },
    { title: '时间', render: (_: unknown, record: MemberSeasonHistoryItem) => `${formatDate(record.start_date)} ~ ${formatDate(record.end_date)}` },
    { title: '岗位', render: (_: unknown, record: MemberSeasonHistoryItem) => renderRole(record.job_role, record.sub_role) },
    { title: '绩效等级', dataIndex: 'performance_grade', render: (value: string | null) => value || '-' },
    { title: '总分', dataIndex: 'total_score', render: (value: number | null) => renderScore(value) },
    { title: '岗位分', dataIndex: 'final_position_score', render: (value: number | null) => renderScore(value) },
    { title: '组织分', dataIndex: 'total_org_score', render: (value: number | null) => renderScore(value) },
    { title: '排名', dataIndex: 'rank', render: (value: number | null) => value ?? '-' },
    { title: '271', dataIndex: 'distribution', render: (value: string | null) => value || '-' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>成员管理</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>
            查看成员岗位、赛季分数和数据异常
          </Typography.Text>
        </div>
        <Space wrap>
          <Select
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            style={{ width: 180 }}
            options={seasons.map(item => ({ label: item.name, value: item.id }))}
            placeholder="选择赛季"
          />
          <Select
            allowClear
            value={jobRole}
            onChange={setJobRole}
            style={{ width: 120 }}
            placeholder="岗位"
            options={jobRoleOptions}
          />
          <Select
            allowClear
            showSearch
            value={department}
            onChange={setDepartment}
            style={{ width: 180 }}
            placeholder="部门"
            options={departmentOptions.map(item => ({ label: item, value: item }))}
          />
          <Input.Search
            allowClear
            placeholder="姓名或邮箱"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={value => {
              setKeyword(value)
              void loadMembers(value)
            }}
            style={{ width: 220 }}
          />
          <Checkbox checked={anomalyOnly} onChange={e => setAnomalyOnly(e.target.checked)}>
            仅看异常
          </Checkbox>
          <Button icon={<ReloadOutlined />} onClick={() => loadMembers()}>
            刷新
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ borderRadius: 12 }}>
        {selectedSeason ? (
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Space wrap>
              <Tag color={seasonStatusColor[selectedSeason.status]}>{seasonStatusLabel[selectedSeason.status]}</Tag>
              <Tag>{formatDate(selectedSeason.start_date)} ~ {formatDate(selectedSeason.end_date)}</Tag>
              <Tag icon={<TeamOutlined />}>{members.length} 人</Tag>
            </Space>
            <Space>
              <Button onClick={() => navigate(`/admin/scores/${selectedSeason.id}`)}>岗位分录入</Button>
              <Button onClick={() => navigate(`/admin/org-scores/${selectedSeason.id}`)}>组织分录入</Button>
            </Space>
          </div>
        ) : null}

        <Table
          rowKey={getMemberIdentityKey}
          loading={loading}
          dataSource={members}
          columns={columns}
          scroll={{ x: 1450 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="暂无成员数据" /> }}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedMember ? `${selectedMember.name} · 成员详情` : '成员详情'}
        width={760}
        destroyOnClose
      >
        {selectedMember ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Descriptions column={2} size="small" labelStyle={{ width: 88 }}>
                <Descriptions.Item label="姓名">{selectedMember.name}</Descriptions.Item>
                <Descriptions.Item label="系统角色">{selectedMember.role || '未登录'}</Descriptions.Item>
                <Descriptions.Item label="部门">{selectedMember.department_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="Title">{selectedMember.title || '-'}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{selectedMember.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="user_key">{selectedMember.user_key || '-'}</Descriptions.Item>
                <Descriptions.Item label="当前岗位">{renderRole(selectedMember.job_role, selectedMember.sub_role)}</Descriptions.Item>
                <Descriptions.Item label="最近同步">{selectedMember.last_sync_at ? formatDateTime(selectedMember.last_sync_at) : '-'}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                <Space size={[6, 6]} wrap>
                  {selectedMember.anomalies.length > 0
                    ? selectedMember.anomalies.map(item => <Tag color="orange" key={item}>{item}</Tag>)
                    : <Tag color="green">当前无异常</Tag>}
                </Space>
              </div>
            </Card>

            <Card
              size="small"
              title="岗位维护"
              extra={selectedMember.selected_season_member_id ? (
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  loading={syncingMemberKey === getMemberIdentityKey(selectedMember)}
                  onClick={() => handleSyncMember(selectedMember)}
                >
                  同步当前赛季
                </Button>
              ) : null}
              style={{ borderRadius: 12 }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Select
                    allowClear
                    style={{ width: 140 }}
                    placeholder="选择岗位"
                    value={editingJobRole || undefined}
                    options={jobRoleOptions}
                    onChange={value => {
                      setEditingJobRole(value ?? null)
                      if (value !== 'tech') {
                        setEditingSubRole(null)
                      }
                    }}
                  />
                  <Select
                    allowClear
                    disabled={editingJobRole !== 'tech'}
                    style={{ width: 140 }}
                    placeholder="选择子岗位"
                    value={editingSubRole || undefined}
                    options={subRoleOptions}
                    onChange={value => setEditingSubRole(value ?? null)}
                  />
                </Space>
                <Checkbox
                  checked={syncDraftSeasonMembers}
                  onChange={e => setSyncDraftSeasonMembers(e.target.checked)}
                >
                  同步更新草稿赛季中的岗位快照
                </Checkbox>
                <Space>
                  <Button
                    type="primary"
                    loading={savingRole}
                    disabled={!selectedMember.user_key || (editingJobRole === 'tech' && !editingSubRole)}
                    onClick={handleSaveJobRole}
                  >
                    保存岗位
                  </Button>
                  {selectedMember.selected_season_id && (
                    <Button onClick={() => navigate(`/admin/scores/${selectedMember.selected_season_id}`)}>
                      去岗位分录入
                    </Button>
                  )}
                  {selectedMember.selected_season_id && (
                    <Button onClick={() => navigate(`/admin/org-scores/${selectedMember.selected_season_id}`)}>
                      去组织分录入
                    </Button>
                  )}
                </Space>
              </Space>
            </Card>

            <Card size="small" title="赛季成绩历史" style={{ borderRadius: 12 }}>
              <Table
                rowKey="season_member_id"
                loading={historyLoading}
                dataSource={history}
                columns={historyColumns}
                pagination={false}
                locale={{ emptyText: <Empty description="暂无历史成绩" /> }}
                scroll={{ x: 980 }}
              />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  )
}
