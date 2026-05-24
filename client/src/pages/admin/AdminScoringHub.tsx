import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Progress, Select, Space, Tag, Typography, message } from 'antd'
import { BarChartOutlined, CalculatorOutlined, EditOutlined } from '@ant-design/icons'
import { getMembers, getSeasons } from '../../api/seasons'
import type { Season, SeasonMember } from '../../types/models'
import { summarizeSeasonMembers } from './adminHubUtils'

const statusColors: Record<Season['status'], string> = { draft: 'default', active: 'green', ended: 'red' }
const statusLabels: Record<Season['status'], string> = { draft: '草稿', active: '进行中', ended: '已结束' }

export default function AdminScoringHub() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()

  useEffect(() => { void loadData() }, [])

  useEffect(() => {
    if (!selectedSeasonId) { setMembers([]); return }
    void loadMembers(selectedSeasonId)
  }, [selectedSeasonId])

  async function loadData() {
    try {
      const res = await getSeasons()
      setSeasons(res.data)
      const activeSeason = res.data.find(s => s.status === 'active')
      setSelectedSeasonId(activeSeason?.id ?? res.data[0]?.id)
    } catch (e) {
      message.error('加载赛季失败')
      console.error(e)
    }
  }

  async function loadMembers(seasonId: number) {
    try {
      const res = await getMembers(seasonId)
      setMembers(res.data)
    } catch (e) {
      message.error('加载赛季成员失败')
      console.error(e)
    }
  }

  const selectedSeason = useMemo(() => seasons.find(s => s.id === selectedSeasonId), [seasons, selectedSeasonId])
  const summary = useMemo(() => summarizeSeasonMembers(members), [members])
  const roleCoverage = summary.total > 0 ? Math.round((summary.configuredRoleCount / summary.total) * 100) : 0
  const ready = summary.missingRoleCount === 0 && summary.missingSubRoleCount === 0

  if (seasons.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Typography.Text type="secondary">还没有赛季，</Typography.Text>
        <Button type="link" onClick={() => navigate('/admin/seasons')}>去创建赛季</Button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>评分管理</Typography.Title>
        <Select
          value={selectedSeasonId}
          onChange={setSelectedSeasonId}
          options={seasons.map(s => ({ value: s.id, label: s.name }))}
          style={{ width: 180 }}
        />
        {selectedSeason && <Tag color={statusColors[selectedSeason.status]}>{statusLabels[selectedSeason.status]}</Tag>}
        <Tag>{summary.total} 位成员</Tag>
        <Tag>{summary.productCount}/{summary.designCount}/{summary.techCount}</Tag>
      </div>

      {/* 准备度 */}
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={<span>配置不完整 — 未配置岗位 <strong>{summary.missingRoleCount}</strong> 人{summary.missingSubRoleCount > 0 ? `，未配置研发子岗 <strong>${summary.missingSubRoleCount}</strong> 人` : ''}</span>}
          action={<Button size="small" onClick={() => navigate('/admin/members')}>去补配置</Button>}
        />
      ) : (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Progress percent={roleCoverage} size="small" style={{ width: 120, margin: 0 }} strokeColor="#52c41a" />
          <Typography.Text type="secondary">{summary.configuredRoleCount}/{summary.total} 岗位已配置，可以开始录分</Typography.Text>
        </div>
      )}

      {/* 操作按钮 */}
      <Space wrap size={10}>
        <Button type="primary" onClick={() => selectedSeasonId && navigate(`/admin/scores/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
          <EditOutlined /> 岗位分录入
        </Button>
        <Button onClick={() => selectedSeasonId && navigate(`/admin/org-scores/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
          <CalculatorOutlined /> 组织分录入
        </Button>
        <Button onClick={() => navigate('/admin/members')}>成员管理</Button>
        <Button icon={<BarChartOutlined />} onClick={() => selectedSeasonId && navigate(`/admin/ranking-detail/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
          排名计算详情
        </Button>
      </Space>
    </div>
  )
}
