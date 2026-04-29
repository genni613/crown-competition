import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Table, InputNumber, Button, message, Typography, Space, Select } from 'antd'
import { getMembers } from '../../api/seasons'
import { getDimensions } from '../../api/scoring'
import { batchUpdateScores, getScores } from '../../api/scores'
import { calculateSeason } from '../../api/scoring'
import type { SeasonMember, ScoringDimension } from '../../types/models'

const jobRoleOptions = [
  { label: '产品', value: 'product' },
  { label: '设计', value: 'design' },
  { label: '研发', value: 'tech' },
]

export default function ScoreEntry() {
  const { seasonId } = useParams()
  const navigate = useNavigate()
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [dimensions, setDimensions] = useState<ScoringDimension[]>([])
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [jobRole, setJobRole] = useState<string>('product')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [seasonId, jobRole])

  async function loadData() {
    if (!seasonId) return
    const [memRes, dimRes] = await Promise.all([
      getMembers(Number(seasonId)),
      getDimensions(jobRole),
    ])
    const filteredMembers = memRes.data.filter((m: SeasonMember) => m.job_role === jobRole)
    setMembers(filteredMembers)
    setDimensions(dimRes.data)

    // Load existing scores
    const scoreMap: Record<string, Record<number, number>> = {}
    for (const m of filteredMembers) {
      try {
        const sRes = await getScores(Number(seasonId), m.id)
        scoreMap[m.id] = {}
        for (const s of sRes.data) {
          scoreMap[m.id][s.dimension_id] = s.raw_value
        }
      } catch { scoreMap[m.id] = {} }
    }
    setScores(scoreMap)
  }

  function updateScore(memberId: number, dimId: number, value: number | null) {
    setScores(prev => ({
      ...prev,
      [memberId]: { ...prev[memberId], [dimId]: value },
    }))
  }

  async function saveAll() {
    if (!seasonId) return
    setLoading(true)
    try {
      for (const m of members) {
        const memberScores = scores[m.id]
        if (!memberScores) continue
        const updates = Object.entries(memberScores)
          .filter(([, v]) => v != null)
          .map(([dimId, raw_value]) => ({ dimension_id: Number(dimId), raw_value }))
        if (updates.length > 0) {
          await batchUpdateScores(Number(seasonId), m.id, updates)
        }
      }
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  async function recalculate() {
    if (!seasonId) return
    try {
      await calculateSeason(Number(seasonId))
      message.success('重新计算完成')
      loadData()
    } catch {
      message.error('计算失败')
    }
  }

  const adminDims = dimensions.filter(d => d.data_source === 'admin' && d.score_type === 'threshold')

  const columns = [
    { title: '成员', dataIndex: 'user_name', fixed: 'left' as const, width: 100 },
    ...adminDims.map(d => ({
      title: `${d.indicator_name}`,
      dataIndex: `dim_${d.id}`,
      width: 120,
      render: (_: any, record: SeasonMember) => (
        <InputNumber
          size="small"
          value={scores[record.id]?.[d.id]}
          onChange={(v) => updateScore(record.id, d.id, v)}
          style={{ width: '100%' }}
        />
      ),
    })),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>分数录入</Typography.Title>
        <Space>
          <Select value={jobRole} onChange={setJobRole} options={jobRoleOptions} style={{ width: 100 }} />
          <Button onClick={saveAll} loading={loading}>保存</Button>
          <Button type="primary" onClick={recalculate}>重新计算</Button>
        </Space>
      </div>
      <Table dataSource={members} columns={columns} rowKey="id" size="small" scroll={{ x: 'max-content' }} pagination={false} />
    </div>
  )
}
