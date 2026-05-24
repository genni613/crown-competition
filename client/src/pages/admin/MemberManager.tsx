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
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { ImportOutlined, PlusOutlined, ReloadOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons'
import {
  getSeasons,
  getMembers,
  updateMember,
  removeMember,
  addMembersBatch,
  importPrevMembers,
  getPrevGrades,
} from '../../api/seasons'
import { getLocalFeishuUsers, syncMemberSeasonScore } from '../../api/feishu'
import { getMemberSeasonHistory, updateMemberDirectoryJobRole } from '../../api/users'
import { getScoreHistory } from '../../api/scores'
import GrowthCurveChart from '../../components/GrowthCurveChart'
import type { ScoreHistoryRow } from '../../components/GrowthCurveChart'
import type { LocalFeishuUser } from '../../api/feishu'
import type { MemberSeasonHistoryItem, Season, SeasonMember } from '../../types/models'
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

const gradeOptions = ['A', 'B+', 'B', 'B-', 'C'].map(g => ({ label: g, value: g }))

const seasonStatusColor: Record<string, string> = { draft: 'default', active: 'green', ended: 'red' }
const seasonStatusLabel: Record<string, string> = { draft: '草稿', active: '进行中', ended: '已结束' }

const roleLabelMap: Record<string, string> = {
  product: '产品', design: '设计', tech: '研发',
  client: '客户端', frontend: '前端', backend: '后端',
}

function renderScore(value: number | null | undefined) {
  return value == null ? '-' : value.toFixed(1)
}

function renderRole(jobRole: string | null, subRole: string | null) {
  if (!jobRole) return '-'
  if (jobRole !== 'tech') return roleLabelMap[jobRole] || jobRole
  return `${roleLabelMap[jobRole] || jobRole} / ${roleLabelMap[subRole || ''] || '未设置'}`
}

export default function MemberManager() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [feishuUsers, setFeishuUsers] = useState<LocalFeishuUser[]>([])
  const [prevGradeMap, setPrevGradeMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // 添加成员
  const [addOpen, setAddOpen] = useState(false)
  const [selectedUserKeys, setSelectedUserKeys] = useState<string[]>([])
  const [gradeMap, setGradeMap] = useState<Record<string, string>>({})
  const [roleMap, setRoleMap] = useState<Record<string, string>>({})
  const [subRoleMap, setSubRoleMap] = useState<Record<string, string>>({})
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  // 详情抽屉
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<SeasonMember | null>(null)
  const [history, setHistory] = useState<MemberSeasonHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingJobRole, setEditingJobRole] = useState<string | null>(null)
  const [editingSubRole, setEditingSubRole] = useState<string | null>(null)
  const [syncDraftSeasonMembers, setSyncDraftSeasonMembers] = useState(true)
  const [savingRole, setSavingRole] = useState(false)
  const [syncingMemberKey, setSyncingMemberKey] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [growthData, setGrowthData] = useState<ScoreHistoryRow[] | null>(null)
  const [growthLoading, setGrowthLoading] = useState(false)

  useEffect(() => {
    void loadSeasons()
    getLocalFeishuUsers().then(r => setFeishuUsers(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedSeasonId) {
      void loadMembers()
    } else {
      setMembers([])
    }
  }, [selectedSeasonId])

  const selectedSeason = useMemo(
    () => seasons.find(item => item.id === selectedSeasonId),
    [seasons, selectedSeasonId],
  )

  // 已在赛季中的 user_key 集合，用于添加成员时排除
  const existingUserKeys = useMemo(
    () => new Set(members.map(m => m.user_key)),
    [members],
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

  async function loadMembers() {
    if (!selectedSeasonId) return
    setLoading(true)
    try {
      const res = await getMembers(selectedSeasonId)
      setMembers(res.data)
    } catch (error) {
      console.error(error)
      message.error('加载成员失败')
    } finally {
      setLoading(false)
    }
  }

  // ---- 添加成员 ----
  function openAddMember() {
    if (!selectedSeasonId) { message.warning('请先选择赛季'); return }
    setSelectedUserKeys([])
    setGradeMap({})
    setRoleMap({})
    setSubRoleMap({})
    setCheckedKeys(new Set())
    getPrevGrades().then(r => setPrevGradeMap(r.data)).catch(() => setPrevGradeMap({}))
    setAddOpen(true)
  }

  async function onAddMember() {
    if (!selectedSeasonId || selectedUserKeys.length === 0) return
    setAdding(true)
    try {
      const res = await addMembersBatch(selectedSeasonId, {
        members: selectedUserKeys.map(uk => ({
          user_key: uk,
          performance_grade: gradeMap[uk] || undefined,
          job_role: roleMap[uk] || undefined,
          sub_role: roleMap[uk] === 'tech' ? (subRoleMap[uk] || undefined) : undefined,
        })),
      })
      const { added, skipped } = res.data
      if (added > 0) message.success(`成功添加 ${added} 名成员`)
      if (skipped.length > 0) {
        Modal.info({
          title: '部分成员已跳过',
          content: skipped.map((s, i) => <div key={i}>{s.name || s.user_key}：{s.reason}</div>),
        })
      }
      setAddOpen(false)
      await loadMembers()
    } catch (err: any) {
      message.error(`添加失败: ${err.message || '未知错误'}`)
    } finally {
      setAdding(false)
    }
  }

  async function onRemoveMember(member: SeasonMember) {
    try {
      await removeMember(member.season_id, member.id)
      message.success('已移除')
      await loadMembers()
    } catch {
      message.error('移除失败')
    }
  }

  async function onEditMemberField(member: SeasonMember, field: string, value: string | null) {
    try {
      await updateMember(member.season_id, member.id, { [field]: value })
      await loadMembers()
    } catch {
      message.error('编辑失败')
    }
  }

  // ---- 详情抽屉 ----
  async function openMemberDetail(record: SeasonMember) {
    setSelectedMember(record)
    setEditingJobRole(record.job_role)
    setEditingSubRole(record.sub_role)
    setSyncDraftSeasonMembers(true)
    setDrawerOpen(true)
    setHistoryLoading(true)
    setGrowthLoading(true)
    try {
      if (record.user_key) {
        const [historyRes, growthRes] = await Promise.all([
          getMemberSeasonHistory(record.user_key),
          getScoreHistory(record.user_key).catch(() => ({ data: null })),
        ])
        setHistory(historyRes.data)
        setGrowthData(growthRes.data)
      } else {
        setHistory([])
        setGrowthData(null)
      }
    } catch {
      setHistory([])
      setGrowthData(null)
    } finally {
      setHistoryLoading(false)
      setGrowthLoading(false)
    }
  }

  async function handleSaveJobRole() {
    if (!selectedMember?.user_key) { message.warning('缺少 user_key'); return }
    setSavingRole(true)
    try {
      await updateMemberDirectoryJobRole(selectedMember.user_key, {
        job_role: editingJobRole,
        sub_role: editingJobRole === 'tech' ? editingSubRole : null,
        syncDraftSeasonMembers,
      })
      message.success('岗位已更新')
      setDrawerOpen(false)
      await loadMembers()
    } catch {
      message.error('更新岗位失败')
    } finally {
      setSavingRole(false)
    }
  }

  async function handleSyncMember(record: SeasonMember) {
    if (!selectedSeasonId || !record.user_key) return
    setSyncingMemberKey(record.user_key)
    try {
      await syncMemberSeasonScore(selectedSeasonId, record.user_key)
      message.success('同步完成')
      await loadMembers()
    } catch {
      message.error('同步失败')
    } finally {
      setSyncingMemberKey(null)
    }
  }

  async function handleImportPrev() {
    if (!selectedSeasonId) return
    setImporting(true)
    try {
      const res = await importPrevMembers(selectedSeasonId)
      const { added, skipped, prevSeasonName, prevSeasonMembers } = res.data
      if (added > 0) {
        message.success(`从「${prevSeasonName}」导入 ${added} 名成员`)
      } else {
        message.info('没有新成员需要导入')
      }
      if (skipped.length > 0) {
        Modal.info({
          title: `${skipped.length} 人已跳过`,
          content: skipped.map((s, i) => <div key={i}>{s.user_key}：{s.reason}</div>),
        })
      }
      await loadMembers()
    } catch (err: any) {
      message.error(err.response?.data?.error || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // ---- 表格列 ----
  const columns = [
    {
      title: '成员',
      dataIndex: 'user_name',
      width: 200,
      render: (_: unknown, r: SeasonMember) => (
        <Space size={12}>
          <Avatar src={r.user_avatar_url} icon={<UserOutlined />} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.user_name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{r.user_key}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '岗位',
      dataIndex: 'job_role',
      width: 200,
      render: (_: unknown, r: SeasonMember) => (
        <Space size={4}>
          <Select
            size="small"
            style={{ width: 90 }}
            value={r.job_role || undefined}
            placeholder="未设置"
            allowClear
            onChange={val => onEditMemberField(r, 'job_role', val ?? null)}
            options={jobRoleOptions}
          />
          {r.job_role === 'tech' && (
            <Select
              size="small"
              style={{ width: 90 }}
              value={r.sub_role || undefined}
              placeholder="细分"
              allowClear
              onChange={val => onEditMemberField(r, 'sub_role', val ?? null)}
              options={subRoleOptions}
            />
          )}
        </Space>
      ),
    },
    {
      title: '上期绩效',
      dataIndex: 'performance_grade',
      width: 110,
      render: (v: string | null, r: SeasonMember) => (
        <Select
          size="small"
          style={{ width: 80 }}
          value={v || undefined}
          placeholder="未设置"
          allowClear
          onChange={val => onEditMemberField(r, 'performance_grade', val ?? null)}
          options={gradeOptions}
        />
      ),
    },
    { title: '总分', dataIndex: 'total_score', width: 90, render: (v: number | null) => <span style={{ fontWeight: 600 }}>{renderScore(v)}</span> },
    { title: '岗位分', dataIndex: 'final_position_score', width: 90, render: renderScore },
    { title: '组织分', dataIndex: 'total_org_score', width: 90, render: renderScore },
    { title: '排名', dataIndex: 'rank', width: 70, render: (v: number | null) => v ?? '-' },
    { title: '271', dataIndex: 'distribution', width: 60, render: (v: string | null) => v || '-' },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: unknown, r: SeasonMember) => (
        <Space>
          <Button size="small" onClick={() => openMemberDetail(r)}>详情</Button>
          <Button size="small" icon={<SyncOutlined />} loading={syncingMemberKey === r.user_key} onClick={() => handleSyncMember(r)}>同步</Button>
          <Popconfirm title="确认移除？" onConfirm={() => onRemoveMember(r)}>
            <Button size="small" danger>移除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const historyColumns = [
    { title: '赛季', dataIndex: 'season_name', render: (v: string, r: MemberSeasonHistoryItem) => (
      <Space size={8}><span>{v}</span><Tag color={seasonStatusColor[r.season_status]}>{seasonStatusLabel[r.season_status]}</Tag></Space>
    ) },
    { title: '时间', render: (_: unknown, r: MemberSeasonHistoryItem) => `${formatDate(r.start_date)} ~ ${formatDate(r.end_date)}` },
    { title: '岗位', render: (_: unknown, r: MemberSeasonHistoryItem) => renderRole(r.job_role, r.sub_role) },
    { title: '绩效', dataIndex: 'performance_grade', render: (v: string | null) => v || '-' },
    { title: '总分', dataIndex: 'total_score', render: renderScore },
    { title: '岗位分', dataIndex: 'final_position_score', render: renderScore },
    { title: '组织分', dataIndex: 'total_org_score', render: renderScore },
    { title: '排名', dataIndex: 'rank', render: (v: number | null) => v ?? '-' },
    { title: '271', dataIndex: 'distribution', render: (v: string | null) => v || '-' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>成员管理</Typography.Title>
          <Typography.Text style={{ fontSize: 13, color: '#94a3b8' }}>
            管理赛季参赛成员、岗位和分数
          </Typography.Text>
        </div>
        <Space wrap>
          <Select
            value={selectedSeasonId}
            onChange={val => setSelectedSeasonId(val)}
            style={{ width: 180 }}
            options={seasons.map(item => ({ label: item.name, value: item.id }))}
            placeholder="选择赛季"
          />
          <Button icon={<ImportOutlined />} onClick={handleImportPrev} loading={importing} disabled={!selectedSeasonId}>
            导入上赛季成员
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddMember} disabled={!selectedSeasonId}>
            添加成员
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadMembers()} disabled={!selectedSeasonId}>
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
              <Tag>{members.length} 人</Tag>
            </Space>
            <Space>
              <Button onClick={() => navigate(`/admin/scores/${selectedSeason.id}`)}>岗位分录入</Button>
              <Button onClick={() => navigate(`/admin/org-scores/${selectedSeason.id}`)}>组织分录入</Button>
            </Space>
          </div>
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Empty description="请先选择一个赛季" />
          </div>
        )}

        {selectedSeasonId && (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={members}
            columns={columns}
            scroll={{ x: 1300 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            locale={{ emptyText: <Empty description="暂无参赛成员，点击「添加成员」配置" /> }}
          />
        )}
      </Card>

      {/* 添加成员 Modal */}
      <Modal
        title="添加参赛成员"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={onAddMember}
        confirmLoading={adding}
        okText={`添加 ${selectedUserKeys.length} 人`}
        okButtonProps={{ disabled: selectedUserKeys.length === 0 }}
        width={680}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          搜索并选择用户，可批量设置岗位和绩效等级。已在赛季中的用户不会出现。
        </Typography.Paragraph>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <Select
            mode="multiple"
            showSearch
            placeholder="搜索并选择用户"
            optionFilterProp="label"
            style={{ minWidth: 320 }}
            value={selectedUserKeys}
            onChange={keys => {
              setSelectedUserKeys(keys)
              setCheckedKeys(new Set())
              setGradeMap(prev => {
                const next = { ...prev }
                for (const k of keys) { if (!next[k] && prevGradeMap[k]) next[k] = prevGradeMap[k] }
                return next
              })
            }}
            optionRender={({ data: { label, value } }) => {
              const u = feishuUsers.find(f => f.user_key === value)
              return <Space><Avatar src={u?.avatar_url} size="small" />{label}</Space>
            }}
          >
            {feishuUsers.filter(u => !existingUserKeys.has(u.user_key)).map(u => (
              <Select.Option key={u.user_key} value={u.user_key} label={u.name}>{u.name}</Select.Option>
            ))}
          </Select>
        </div>
        {selectedUserKeys.length > 0 && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <Checkbox
                checked={checkedKeys.size === selectedUserKeys.length && selectedUserKeys.length > 0}
                indeterminate={checkedKeys.size > 0 && checkedKeys.size < selectedUserKeys.length}
                onChange={e => setCheckedKeys(e.target.checked ? new Set(selectedUserKeys) : new Set())}
              >
                全选
              </Checkbox>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>已勾选 {checkedKeys.size} 人</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontSize: 12, width: 48 }}>岗位：</span>
              {jobRoleOptions.map(o => (
                <Tag key={o.value} style={{ cursor: checkedKeys.size > 0 ? 'pointer' : 'not-allowed', opacity: checkedKeys.size > 0 ? 1 : 0.4 }}
                  color="green" onClick={() => { if (checkedKeys.size > 0) setRoleMap(prev => { const next = { ...prev }; for (const k of checkedKeys) next[k] = o.value; return next }) }}>{o.label}</Tag>
              ))}
            </div>
            {selectedUserKeys.some(uk => (roleMap[uk] || feishuUsers.find(f => f.user_key === uk)?.job_role) === 'tech') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontSize: 12, width: 48 }}>细分：</span>
                {subRoleOptions.map(o => (
                  <Tag key={o.value} style={{ cursor: checkedKeys.size > 0 ? 'pointer' : 'not-allowed', opacity: checkedKeys.size > 0 ? 1 : 0.4 }}
                    color="purple" onClick={() => { if (checkedKeys.size > 0) setSubRoleMap(prev => { const next = { ...prev }; for (const k of checkedKeys) next[k] = o.value; return next }) }}>{o.label}</Tag>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontSize: 12, width: 48 }}>绩效：</span>
              {gradeOptions.map(o => (
                <Tag key={o.value} style={{ cursor: checkedKeys.size > 0 ? 'pointer' : 'not-allowed', opacity: checkedKeys.size > 0 ? 1 : 0.4 }}
                  color="blue" onClick={() => { if (checkedKeys.size > 0) setGradeMap(prev => { const next = { ...prev }; for (const k of checkedKeys) next[k] = o.value; return next }) }}>{o.label}</Tag>
              ))}
            </div>
            {selectedUserKeys.map(uk => {
              const u = feishuUsers.find(f => f.user_key === uk)
              const effectiveRole = roleMap[uk] || u?.job_role
              const roleLabel = effectiveRole ? jobRoleOptions.find(j => j.value === effectiveRole)?.label : null
              const effectiveSubRole = subRoleMap[uk] || u?.sub_role
              const subRoleLabel = effectiveSubRole ? subRoleOptions.find(s => s.value === effectiveSubRole)?.label : null
              const effectiveGrade = gradeMap[uk] || prevGradeMap[uk]
              return (
                <div key={uk} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <Checkbox checked={checkedKeys.has(uk)} onChange={e => setCheckedKeys(prev => { const next = new Set(prev); e.target.checked ? next.add(uk) : next.delete(uk); return next })} />
                  <Tag color={roleLabel ? 'green' : 'warning'}>{u?.name ?? uk} {roleLabel ? `· ${roleLabel}` : '· 岗位未设置'}</Tag>
                  {effectiveRole === 'tech' && <Tag color={subRoleLabel ? 'purple' : undefined}>{subRoleLabel ?? '细分未设置'}</Tag>}
                  <Tag color={effectiveGrade ? 'geekblue' : undefined}>{effectiveGrade ? `绩效 ${effectiveGrade}` : '未设绩效'}</Tag>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* 成员详情抽屉 */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedMember ? `${selectedMember.user_name} · 成员详情` : '成员详情'}
        width={760}
        destroyOnClose
      >
        {selectedMember ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Descriptions column={2} size="small" labelStyle={{ width: 88 }}>
                <Descriptions.Item label="姓名">{selectedMember.user_name}</Descriptions.Item>
                <Descriptions.Item label="岗位">{renderRole(selectedMember.job_role, selectedMember.sub_role)}</Descriptions.Item>
                <Descriptions.Item label="绩效等级">{selectedMember.performance_grade || '-'}</Descriptions.Item>
                <Descriptions.Item label="总分">{renderScore(selectedMember.total_score)}</Descriptions.Item>
                <Descriptions.Item label="岗位分">{renderScore(selectedMember.final_position_score)}</Descriptions.Item>
                <Descriptions.Item label="组织分">{renderScore(selectedMember.total_org_score)}</Descriptions.Item>
                <Descriptions.Item label="排名">{selectedMember.rank ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="271">{selectedMember.distribution || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title="岗位维护" style={{ borderRadius: 12 }}
              extra={<Button size="small" icon={<SyncOutlined />} loading={syncingMemberKey === selectedMember.user_key} onClick={() => handleSyncMember(selectedMember)}>同步</Button>}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Select allowClear style={{ width: 140 }} placeholder="选择岗位" value={editingJobRole || undefined} options={jobRoleOptions}
                    onChange={value => { setEditingJobRole(value ?? null); if (value !== 'tech') setEditingSubRole(null) }} />
                  {editingJobRole === 'tech' && (
                    <Select allowClear style={{ width: 140 }} placeholder="选择子岗位" value={editingSubRole || undefined} options={subRoleOptions}
                      onChange={value => setEditingSubRole(value ?? null)} />
                  )}
                </Space>
                <Checkbox checked={syncDraftSeasonMembers} onChange={e => setSyncDraftSeasonMembers(e.target.checked)}>
                  同步更新草稿赛季中的岗位快照
                </Checkbox>
                <Space>
                  <Button type="primary" loading={savingRole} disabled={!selectedMember.user_key || (editingJobRole === 'tech' && !editingSubRole)} onClick={handleSaveJobRole}>
                    保存岗位
                  </Button>
                  {selectedMember.season_id && <Button onClick={() => navigate(`/admin/scores/${selectedMember.season_id}`)}>岗位分录入</Button>}
                  {selectedMember.season_id && <Button onClick={() => navigate(`/admin/org-scores/${selectedMember.season_id}`)}>组织分录入</Button>}
                </Space>
              </Space>
            </Card>

            <Card size="small" title="赛季成绩历史" style={{ borderRadius: 12 }}>
              <Table rowKey="season_member_id" loading={historyLoading} dataSource={history} columns={historyColumns}
                pagination={false} locale={{ emptyText: <Empty description="暂无历史成绩" /> }} scroll={{ x: 900 }} />
            </Card>

            <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600, color: '#1e1b4b' }}>成长曲线</span>} style={{ borderRadius: 12 }}>
              <GrowthCurveChart data={growthData} loading={growthLoading} />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  )
}
