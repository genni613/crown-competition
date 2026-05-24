import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Avatar, Button, Card, Col, Divider, Empty, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import { InfoCircleOutlined, UserOutlined } from '@ant-design/icons'
import { useCopilotAction } from '@copilotkit/react-core'
import { calculateSeason, getDimensions } from '../../api/scoring'
import { activateSeason, getMembers, getSeason } from '../../api/seasons'
import { batchUpdateScores, getScores } from '../../api/scores'
import { copilotConfig } from '../../components/copilot/config'
import type { IndicatorScore, ScoringDimension, SeasonMember } from '../../types/models'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

const jobRoleLabels: Record<string, string> = {
  product: '产品',
  design: '设计',
  tech: '研发',
}

const sourceLabels: Record<ScoringDimension['data_source'], string> = {
  admin: '手动录入',
  evidence: '举证',
  feishu: '飞书同步',
}

export default function ScoreEntry() {
  const { seasonId } = useParams()
  const [jobRole, setJobRole] = useState<string>('product')
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [dimensions, setDimensions] = useState<ScoringDimension[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number>()
  const [scores, setScores] = useState<Record<number, number | null>>({})
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [seasonStatus, setSeasonStatus] = useState<'draft' | 'active' | 'ended' | null>(null)

  useEffect(() => {
    void loadMeta()
  }, [seasonId, jobRole])

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) {
      setSelectedMemberId(members[0].id)
      return
    }
    if (selectedMemberId && !members.some(item => item.id === selectedMemberId)) {
      setSelectedMemberId(members[0]?.id)
    }
  }, [members, selectedMemberId])

  useEffect(() => {
    if (selectedMemberId) {
      void loadMemberScores(selectedMemberId)
    } else {
      setScores({})
    }
  }, [seasonId, selectedMemberId])

  async function loadMeta() {
    if (!seasonId) return
    try {
      const [memRes, dimRes, seasonRes] = await Promise.all([
        getMembers(Number(seasonId)),
        getDimensions(jobRole),
        getSeason(Number(seasonId)),
      ])
      setMembers(memRes.data.filter((m: SeasonMember) => m.job_role === jobRole))
      setDimensions(dimRes.data)
      setSeasonStatus(seasonRes.data.status)
    } catch (e) {
      message.error('加载数据失败')
      console.error(e)
    }
  }

  async function loadMemberScores(memberId: number) {
    if (!seasonId) return
    try {
      const sRes = await getScores(Number(seasonId), memberId)
      const nextScores: Record<number, number | null> = {}
      for (const item of sRes.data as IndicatorScore[]) {
        nextScores[item.dimension_id] = item.raw_value
      }
      setScores(nextScores)
    } catch {
      setScores({})
    }
  }

  function updateScore(dimId: number, value: number | null) {
    setScores(prev => ({ ...prev, [dimId]: value }))
  }

  async function saveCurrentMember() {
    if (!seasonId || !selectedMemberId) return
    setSaving(true)
    try {
      const updates = adminDims
        .filter(dim => scores[dim.id] != null)
        .map(dim => ({ dimension_id: dim.id, raw_value: scores[dim.id] }))

      if (updates.length === 0) {
        message.info('当前成员还没有可保存的录分项')
        return
      }

      await batchUpdateScores(Number(seasonId), selectedMemberId, updates)
      message.success('当前成员分数已保存')
      await loadMeta()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function recalculate() {
    if (!seasonId) return
    setRecalculating(true)
    try {
      await calculateSeason(Number(seasonId))
      message.success('重新计算完成')
      await loadMeta()
    } catch {
      message.error('计算失败')
    } finally {
      setRecalculating(false)
    }
  }

  const adminDims = useMemo(
    () => dimensions.filter(d => d.data_source === 'admin'),
    [dimensions],
  )

  const dimensionGroups = useMemo(() => {
    const grouped = new Map<string, ScoringDimension[]>()
    dimensions.forEach(item => {
      const list = grouped.get(item.dimension_name) || []
      list.push(item)
      grouped.set(item.dimension_name, list.sort((a, b) => a.sort_order - b.sort_order))
    })
    return Array.from(grouped.entries()).map(([dimensionName, items]) => ({
      dimensionName,
      items,
      dimensionWeight: items[0]?.dimension_weight ?? 0,
    }))
  }, [dimensions])

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'query_member_scores',
      description: '查询当前选中成员在当前赛季的评分明细，包括各指标原始值和阈值分数',
      parameters: [],
      handler: async () => {
        if (!seasonId || !selectedMemberId) return { error: '请先选择赛季和成员' }
        try {
          const [sRes, dRes] = await Promise.all([
            getScores(Number(seasonId), selectedMemberId),
            getDimensions(jobRole),
          ])
          const member = members.find(m => m.id === selectedMemberId)
          return { scores: sRes.data, dimensions: dRes.data, memberName: member?.user_name, jobRole }
        } catch (e: any) {
          return { error: e.message || '查询分数失败' }
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') return <Typography.Text type="secondary">正在查询...</Typography.Text>
        if (!result) return null
        if (result.error) return <Typography.Text type="danger">{result.error}</Typography.Text>
        const scoreList: IndicatorScore[] = result.scores
        const dims: ScoringDimension[] = result.dimensions
        if (!scoreList?.length) return <Typography.Text type="secondary">{result.memberName}暂无评分数据</Typography.Text>
        return (
          <Card size="small" style={{ maxWidth: 460 }}>
            <Typography.Text strong>{result.memberName}</Typography.Text>
            <Tag color="blue" style={{ marginLeft: 8 }}>{result.jobRole}</Tag>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <th style={{ padding: 4, textAlign: 'left' }}>指标</th>
                    <th style={{ padding: 4, textAlign: 'center' }}>原始值</th>
                    <th style={{ padding: 4, textAlign: 'center' }}>阈值分</th>
                    <th style={{ padding: 4, textAlign: 'center' }}>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreList.map((s: any) => {
                    const dim = dims.find((d: any) => d.id === s.dimension_id)
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #fafafa' }}>
                        <td style={{ padding: 4 }}>{dim?.indicator_name || s.dimension_id}</td>
                        <td style={{ padding: 4, textAlign: 'center' }}>{s.raw_value ?? '-'}</td>
                        <td style={{ padding: 4, textAlign: 'center', fontWeight: 600 }}>{s.threshold_score?.toFixed(1) ?? '-'}</td>
                        <td style={{ padding: 4, textAlign: 'center' }}>{s.source || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      },
    } : null as any,
  )

  const selectedMember = useMemo(
    () => members.find(item => item.id === selectedMemberId),
    [members, selectedMemberId],
  )
  const seasonLocked = seasonStatus === 'ended'

  if (members.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>岗位分录入</Typography.Title>
          </div>
        </div>
        <Space style={{ marginBottom: 16 }}>
          <Select value={jobRole} onChange={setJobRole} options={jobRoleOptions} style={{ width: 120 }} />
        </Space>
        <Empty description="暂无可录分成员" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>岗位分录入</Typography.Title>
          <Space size={8} style={{ marginTop: 6 }}>
            <Typography.Text style={{ fontSize: 13, color: '#64748b' }}>
              请按岗位职责与规则口径填写分值，特殊情况建议先查看完整维度规则。
            </Typography.Text>
            <Button
              type="link"
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => setRuleModalOpen(true)}
              style={{ paddingInline: 0 }}
            >
              查看维度规则
            </Button>
          </Space>
        </div>
        <Space wrap>
          <Select value={jobRole} onChange={setJobRole} options={jobRoleOptions} style={{ width: 110 }} />
          <Select
            showSearch
            optionFilterProp="label"
            value={selectedMemberId}
            onChange={setSelectedMemberId}
            options={members.map(member => ({ value: member.id, label: member.user_name || member.user_key, avatarUrl: member.user_avatar_url }))}
            optionRender={({ data }) => (
              <Space>
                <Avatar src={(data as any).avatarUrl} size="small" icon={<UserOutlined />} />
                <span>{data.label}</span>
              </Space>
            )}
            style={{ width: 220 }}
          />
          <Button onClick={saveCurrentMember} loading={saving} disabled={seasonLocked}>保存当前成员</Button>
          <Button type="primary" onClick={recalculate} loading={recalculating} disabled={seasonLocked}>重新计算</Button>
        </Space>
      </div>

      {seasonLocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="当前赛季已结束，岗位分录入已锁定"
          description={(
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <span>如需继续录分或重算，请先重新激活赛季。</span>
              <Button
                type="primary"
                size="small"
                onClick={async () => {
                  if (!seasonId) return
                  try {
                    await activateSeason(Number(seasonId))
                    message.success('赛季已重新激活')
                    await loadMeta()
                  } catch (err: any) {
                    message.error(err?.response?.data?.error || '重新激活失败')
                  }
                }}
              >
                重新激活赛季
              </Button>
            </Space>
          )}
        />
      )}

      {selectedMember && (
        <Space wrap style={{ marginBottom: 16 }}>
          <Tag style={{ marginInlineEnd: 0, paddingInline: 10, height: 32, lineHeight: '30px', borderRadius: 8 }}>
            {selectedMember.user_name}
          </Tag>
          <Tag style={{ marginInlineEnd: 0, paddingInline: 10, height: 32, lineHeight: '30px', borderRadius: 8 }}>
            当前岗位分 {selectedMember.final_position_score?.toFixed(1) ?? '-'}
          </Tag>
          <Tag style={{ marginInlineEnd: 0, paddingInline: 10, height: 32, lineHeight: '30px', borderRadius: 8 }}>
            总分 {selectedMember.total_score?.toFixed(1) ?? '-'}
          </Tag>
        </Space>
      )}

      <Row gutter={[16, 16]}>
        {adminDims.map(dim => (
          <Col key={dim.id} xs={24} md={12} xl={8}>
            <Card
              size="small"
              title={dim.indicator_name}
              extra={(
                <Button type="link" size="small" onClick={() => setRuleModalOpen(true)} style={{ paddingInline: 0 }}>
                  规则
                </Button>
              )}
              style={{ height: '100%', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                  维度：{dim.dimension_name} · 权重 {(dim.indicator_weight * 100).toFixed(0)}%
                </Typography.Text>
                <InputNumber
                  value={scores[dim.id]}
                  onChange={value => updateScore(dim.id, value)}
                  disabled={seasonLocked}
                  style={{ width: '100%' }}
                  placeholder="输入分值"
                />
                <Typography.Text type="secondary">
                  100 分阈值 {dim.threshold_100 ?? '-'}，60 分阈值 {dim.threshold_60 ?? '-'}
                </Typography.Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        open={ruleModalOpen}
        onCancel={() => setRuleModalOpen(false)}
        footer={<Button type="primary" onClick={() => setRuleModalOpen(false)}>我知道了</Button>}
        width={760}
        title={`${jobRoleLabels[jobRole] || ''}岗位维度规则`}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="填写提示"
            description="先看当前岗位对应的维度，再按每个指标的阈值和口径录入原始值。无法判断时，优先按主职责和主要产出归类。"
          />

          <Card size="small" bordered={false} style={{ background: '#f8fafc' }}>
            <Space split={<Divider type="vertical" />} wrap>
              <Typography.Text>适用岗位：{jobRoleLabels[jobRole] || '-'}</Typography.Text>
              <Typography.Text>维度数：{dimensionGroups.length}</Typography.Text>
              <Typography.Text>录入项：{adminDims.length}</Typography.Text>
            </Space>
          </Card>

          {dimensionGroups.map(group => (
            <Card
              key={group.dimensionName}
              size="small"
              title={(
                <Space>
                  <span>{group.dimensionName}</span>
                  <Tag color="blue">维度权重 {(group.dimensionWeight * 100).toFixed(0)}%</Tag>
                </Space>
              )}
              style={{ borderRadius: 12 }}
            >
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={group.items}
                columns={[
                  {
                    title: '指标',
                    dataIndex: 'indicator_name',
                    width: 180,
                  },
                  {
                    title: '录入方式',
                    dataIndex: 'data_source',
                    width: 100,
                    render: (value: ScoringDimension['data_source']) => sourceLabels[value],
                  },
                  {
                    title: '权重',
                    dataIndex: 'indicator_weight',
                    width: 90,
                    render: (value: number) => `${(value * 100).toFixed(0)}%`,
                  },
                  {
                    title: '判断规则',
                    render: (_: unknown, record: ScoringDimension) => (
                      <span>
                        {record.score_type === 'deduction'
                          ? `按次数/单位扣分，每单位扣 ${record.deduction_per_unit ?? '-'}，上限 ${record.deduction_cap ?? '-'}`
                          : `原始值达到 ${record.threshold_100 ?? '-'} 记 100 分，达到 ${record.threshold_60 ?? '-'} 记 60 分`}
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
          ))}

          <Alert
            type="warning"
            showIcon
            message="特殊情况"
            description="兼岗按主职责判断；名称相近但产出不同的任务，按实际交付结果归入对应指标；若当前卡片只需要录分，优先填写“手动录入”来源的指标。"
          />
        </Space>
      </Modal>
    </div>
  )
}
