import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar, Button, Card, Col, Empty, InputNumber, Row, Select, Space, Tag, Typography, message } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { calculateSeason, getDimensions } from '../../api/scoring'
import { getMembers } from '../../api/seasons'
import { batchUpdateScores, getScores } from '../../api/scores'
import type { IndicatorScore, ScoringDimension, SeasonMember } from '../../types/models'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

export default function ScoreEntry() {
  const { seasonId } = useParams()
  const [jobRole, setJobRole] = useState<string>('product')
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [dimensions, setDimensions] = useState<ScoringDimension[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number>()
  const [scores, setScores] = useState<Record<number, number | null>>({})
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

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
    const [memRes, dimRes] = await Promise.all([
      getMembers(Number(seasonId)),
      getDimensions(jobRole),
    ])
    setMembers(memRes.data.filter((m: SeasonMember) => m.job_role === jobRole))
    setDimensions(dimRes.data)
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
    () => dimensions.filter(d => d.data_source === 'admin' && d.score_type === 'threshold'),
    [dimensions],
  )

  const selectedMember = useMemo(
    () => members.find(item => item.id === selectedMemberId),
    [members, selectedMemberId],
  )

  if (members.length === 0) {
    return (
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>岗位分录入</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 16px' }}>
          当前岗位下还没有赛季成员。
        </Typography.Paragraph>
        <Space style={{ marginBottom: 16 }}>
          <Select value={jobRole} onChange={setJobRole} options={jobRoleOptions} style={{ width: 120 }} />
        </Space>
        <Empty description="暂无可录分成员" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>岗位分录入</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            先选岗位和成员，再按指标逐项录入，和组织分录入保持同一套操作方式。
          </Typography.Paragraph>
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
          <Button onClick={saveCurrentMember} loading={saving}>保存当前成员</Button>
          <Button type="primary" onClick={recalculate} loading={recalculating}>重新计算</Button>
        </Space>
      </div>

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
            <Card size="small" title={dim.indicator_name} style={{ height: '100%' }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                  维度：{dim.dimension_name} · 权重 {(dim.indicator_weight * 100).toFixed(0)}%
                </Typography.Text>
                <InputNumber
                  value={scores[dim.id]}
                  onChange={value => updateScore(dim.id, value)}
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
    </div>
  )
}
