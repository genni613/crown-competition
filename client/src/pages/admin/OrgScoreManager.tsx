import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { clearOrgScoreDraft, loadOrgScoreDraft, type OrgScoreDraft } from '../../components/copilot/orgScoreDraft'
import { getMembers } from '../../api/seasons'
import { addOrgScore, deleteOrgScore, getOrgScoreTypes, getOrgScores } from '../../api/orgScores'
import type { SeasonMember, OrgScore, OrgScoreType } from '../../types/models'

type ScoreTabKey = 'all' | 'positive' | 'negative'
type OrgScoreRecord = OrgScore & {
  display_name?: string
  points_per_unit?: number
  max_per_season?: number | null
}

export default function OrgScoreManager() {
  const location = useLocation()
  const { seasonId } = useParams()
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [types, setTypes] = useState<OrgScoreType[]>([])
  const [activeTab, setActiveTab] = useState<ScoreTabKey>('all')
  const [selectedMemberId, setSelectedMemberId] = useState<number>()
  const [records, setRecords] = useState<OrgScoreRecord[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<number>()
  const [copilotDraft, setCopilotDraft] = useState<OrgScoreDraft | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadMeta()
  }, [seasonId])

  useEffect(() => {
    setCopilotDraft(loadOrgScoreDraft())
  }, [seasonId, location.search])

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) setSelectedMemberId(members[0].id)
  }, [members, selectedMemberId])

  useEffect(() => {
    if (selectedMemberId) {
      loadMemberScores(selectedMemberId)
    } else {
      setRecords([])
    }
  }, [selectedMemberId, seasonId])

  async function loadMeta() {
    if (!seasonId) return
    const [memRes, typeRes] = await Promise.all([
      getMembers(Number(seasonId)),
      getOrgScoreTypes(),
    ])
    setMembers(memRes.data)
    setTypes(typeRes.data)
  }

  async function loadMemberScores(memberId: number) {
    if (!seasonId) return
    try {
      const res = await getOrgScores(Number(seasonId), memberId)
      setRecords(res.data)
    } catch {
      setRecords([])
    }
  }

  const filteredTypes = useMemo(() => {
    if (activeTab === 'positive') return types.filter(t => t.points_per_unit > 0)
    if (activeTab === 'negative') return types.filter(t => t.points_per_unit < 0)
    return types
  }, [types, activeTab])

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedMemberId),
    [members, selectedMemberId],
  )

  const selectedType = useMemo(
    () => types.find(t => t.id === selectedTypeId),
    [types, selectedTypeId],
  )

  const memberTotal = selectedMember?.total_org_score ?? 0
  const recordTotal = records.reduce((sum, item) => sum + (item.points || 0), 0)
  const capRemain = Math.max(0, 25 - memberTotal)

  function openRecord(type: OrgScoreType) {
    setSelectedTypeId(type.id)
    setDrawerOpen(true)
    form.setFieldsValue({
      org_score_type_id: type.id,
      quantity: 1,
      description: '',
    })
  }

  function normalizeText(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()（）\-_/,.，。:：]/g, '')
  }

  function getTypeAliases(type: OrgScoreType): string[] {
    const aliases = [type.display_name, type.name]

    const aliasMap: Record<string, string[]> = {
      mentor: ['带教', '带教伙伴', '导师带教'],
      certified_trainer: ['认证讲师', '集团认证讲师', '讲师积分'],
      sharing_group: ['组内分享', '分享组内', '周会分享', '小组分享'],
      sharing_dept: ['会员数字化分享', '部门分享', '分享会员数字化'],
      sharing_group_hq: ['集团分享', '总部分享', '分享集团'],
      duty_no_response: ['值班未响应', '值班响应', '值班扣分'],
      gardener: ['花匠', '花匠工作'],
      referral_onboard: ['内推入职', '内推进人', '推荐入职'],
      referral_confirm: ['内推转正', '推荐转正'],
      value_a: ['价值观a', '价值观A'],
      infra_core: ['复杂基建核心', '基建核心', '核心基建'],
      infra_participate: ['复杂基建参与', '基建参与'],
      special_contribution: ['特别贡献', '组织评定', '特别贡献分'],
    }

    return [...aliases, ...(aliasMap[type.name] || [])]
  }

  const draftMatch = useMemo(() => {
    if (!copilotDraft || !seasonId) return null
    if (copilotDraft.seasonId !== Number(seasonId)) return null

    const memberHint = normalizeText(copilotDraft.memberName)
    const matchedMember = members.find(item => {
      const name = normalizeText(item.user_name || '')
      return name.includes(memberHint) || memberHint.includes(name)
    })

    const typeHint = normalizeText(copilotDraft.scoreTypeHint)
    const matchedType = copilotDraft.matchedTypeId != null
      ? types.find(item => item.id === copilotDraft.matchedTypeId)
      : types.find(item => {
          const aliases = getTypeAliases(item).map(normalizeText)
          return aliases.some(alias => alias.includes(typeHint) || typeHint.includes(alias))
        })

    return {
      matchedMember,
      matchedType,
    }
  }, [copilotDraft, seasonId, members, types])

  function applyDraftToForm() {
    if (!copilotDraft || !draftMatch) return

    if (draftMatch.matchedMember) {
      setSelectedMemberId(draftMatch.matchedMember.id)
    }

    if (draftMatch.matchedType) {
      if (draftMatch.matchedType.points_per_unit > 0) setActiveTab('positive')
      if (draftMatch.matchedType.points_per_unit < 0) setActiveTab('negative')
      setSelectedTypeId(draftMatch.matchedType.id)
      form.setFieldsValue({
        org_score_type_id: draftMatch.matchedType.id,
        quantity: copilotDraft.quantity,
        description: copilotDraft.description,
      })
    } else {
      form.setFieldsValue({
        quantity: copilotDraft.quantity,
        description: copilotDraft.description,
      })
    }

    setDrawerOpen(true)
  }

  async function onAdd(values: any) {
    if (!seasonId || !selectedMemberId || !selectedTypeId) return
    try {
      await addOrgScore(Number(seasonId), selectedMemberId, values)
      message.success('已录入')
      setDrawerOpen(false)
      clearOrgScoreDraft()
      setCopilotDraft(null)
      form.resetFields()
      await Promise.all([
        loadMeta(),
        loadMemberScores(selectedMemberId),
      ])
    } catch (e: any) {
      message.error(e.response?.data?.error || '录入失败')
    }
  }

  async function onDelete(recordId: number) {
    try {
      await deleteOrgScore(recordId)
      message.success('已删除')
      if (selectedMemberId) {
        await Promise.all([
          loadMeta(),
          loadMemberScores(selectedMemberId),
        ])
      } else {
        await loadMeta()
      }
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败')
    }
  }

  const tabItems = [
    { key: 'all', label: <Space size={6}>全部<Tag>{types.length}</Tag></Space> },
    { key: 'positive', label: <Space size={6}>加分<Tag color="green">{types.filter(t => t.points_per_unit > 0).length}</Tag></Space> },
    { key: 'negative', label: <Space size={6}>减分<Tag color="red">{types.filter(t => t.points_per_unit < 0).length}</Tag></Space> },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>组织分管理</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
          先选成员，再点具体加分/减分项录入，避免在大表里找项。
        </Typography.Paragraph>
      </div>

      {copilotDraft && copilotDraft.seasonId === Number(seasonId) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="已载入 AI 草稿"
          description={(
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Typography.Text>
                系统已根据聊天里的自然语言生成组织分草稿。请先核对下面这些内容，再决定是否应用到表单。
              </Typography.Text>
              <Space wrap>
                <Tag color="blue">成员：{copilotDraft.memberName}</Tag>
                <Tag color={draftMatch?.matchedMember ? 'green' : 'orange'}>
                  {draftMatch?.matchedMember ? `已匹配 ${draftMatch.matchedMember.user_name}` : '成员待确认'}
                </Tag>
                <Tag color="purple">分项：{copilotDraft.scoreTypeHint}</Tag>
                <Tag color={draftMatch?.matchedType ? 'green' : 'orange'}>
                  {draftMatch?.matchedType ? `已匹配 ${draftMatch.matchedType.display_name}` : '分项待确认'}
                </Tag>
                <Tag>数量：{copilotDraft.quantity}</Tag>
              </Space>
              {copilotDraft.matchReason && (
                <Typography.Text type="secondary">
                  映射依据：{copilotDraft.matchReason}
                </Typography.Text>
              )}
              {copilotDraft.alternatives && copilotDraft.alternatives.length > 0 && (
                <Space wrap>
                  {copilotDraft.alternatives.map(item => (
                    <Tag key={item.id}>备选：{item.display_name}</Tag>
                  ))}
                </Space>
              )}
              <Typography.Text type="secondary">
                说明：{copilotDraft.description}
              </Typography.Text>
              <Space>
                <Button type="primary" size="small" onClick={applyDraftToForm}>
                  应用到表单
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setDrawerOpen(true)
                    form.setFieldsValue({
                      quantity: copilotDraft.quantity,
                      description: copilotDraft.description,
                    })
                  }}
                >
                  仅带入说明和数量
                </Button>
              </Space>
            </Space>
          )}
          action={(
            <Button
              size="small"
              onClick={() => {
                clearOrgScoreDraft()
                setCopilotDraft(null)
              }}
            >
              清除草稿
            </Button>
          )}
        />
      )}

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card size="small" title="选择成员">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Select
                showSearch
                style={{ width: '100%' }}
                placeholder="选择要录分的成员"
                optionFilterProp="label"
                value={selectedMemberId}
                onChange={value => setSelectedMemberId(value)}
                options={members.map(m => ({
                  value: m.id,
                  label: `${m.user_name} · 当前组织分 ${m.total_org_score?.toFixed(1) ?? '0'} / 25`,
                }))}
              />
              <Space wrap>
                <Tag color="blue">当前组织分 {memberTotal.toFixed(1)}</Tag>
                <Tag color="gold">已录累计 {recordTotal.toFixed(1)}</Tag>
                <Tag color={capRemain > 0 ? 'green' : 'red'}>剩余 {capRemain.toFixed(1)}</Tag>
                <Tag>已录入 {records.length} 条</Tag>
              </Space>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="快速说明">
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              当前页只负责给个人加减组织分。选择成员后，直接点规则卡片即可录入，录完会自动刷新总分。
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <TabsLikeBar
        items={tabItems}
        activeKey={activeTab}
        onChange={key => setActiveTab(key as ScoreTabKey)}
      />

      <div style={{ marginTop: 16 }}>
        <Row gutter={[12, 12]}>
          {filteredTypes.map(type => {
            const current = records.filter(r => r.org_score_type_id === type.id)
            const total = current.reduce((sum, item) => sum + (item.points || 0), 0)
            return (
              <Col key={type.id} xs={24} sm={12} xl={8}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => openRecord(type)}
                  style={{ height: '100%', cursor: 'pointer' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Typography.Text strong>{type.display_name}</Typography.Text>
                      <Tag color={type.points_per_unit > 0 ? 'green' : 'red'}>
                        {type.points_per_unit > 0 ? '+' : ''}{type.points_per_unit} / 次
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary">
                      {type.max_per_season ? `封顶 ${type.max_per_season} 次` : '不设单项封顶'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      当前已录 {current.length} 条，累计 {total.toFixed(1)} 分
                    </Typography.Text>
                  </Space>
                </Card>
              </Col>
            )
          })}
        </Row>
        {filteredTypes.length === 0 && (
          <div style={{ padding: 24 }}>
            <Empty description="当前分类下没有可录入项" />
          </div>
        )}
      </div>

      <Divider style={{ margin: '20px 0' }} />

      <Card size="small" title="当前成员已录记录">
        {records.length > 0 ? (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {records.map(record => (
              <Card key={record.id} size="small" style={{ background: '#fafafa' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                  <Space direction="vertical" size={2}>
                    <Space wrap>
                      <Typography.Text strong>{record.display_name ?? '组织分'}</Typography.Text>
                      <Tag color={record.points >= 0 ? 'green' : 'red'}>
                        {record.points >= 0 ? '+' : ''}{record.points.toFixed(1)} 分
                      </Tag>
                      <Tag>{record.quantity} 次</Tag>
                    </Space>
                    <Typography.Text type="secondary">
                      {record.description || '无说明'}
                    </Typography.Text>
                  </Space>
                  <Button size="small" danger onClick={() => onDelete(record.id)}>删除</Button>
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Empty description="该成员暂无组织分记录" />
        )}
      </Card>

      <Drawer
        title={selectedType ? `录入 ${selectedType.display_name}` : '录入组织分'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
        }}
        width={420}
        destroyOnClose
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => {
              setDrawerOpen(false)
            }}
            >
              取消
            </Button>
            <Button type="primary" onClick={() => form.submit()}>提交</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={onAdd}>
          <Form.Item label="成员">
            <Select
              disabled
              value={selectedMemberId}
              options={members.map(m => ({ value: m.id, label: m.user_name }))}
            />
          </Form.Item>
          <Form.Item name="org_score_type_id" label="类型" rules={[{ required: true }]}>
            <Select disabled options={types.map(t => ({
              value: t.id,
              label: `${t.display_name} (${t.points_per_unit > 0 ? '+' : ''}${t.points_per_unit}分)`,
            }))} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="数量"
            initialValue={1}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={4} placeholder="补充本次录入依据" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}

function TabsLikeBar({
  items,
  activeKey,
  onChange,
}: {
  items: { key: string; label: ReactNode }[]
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <Space wrap size={8}>
      {items.map(item => (
        <Button
          key={item.key}
          type={activeKey === item.key ? 'primary' : 'default'}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </Button>
      ))}
    </Space>
  )
}
