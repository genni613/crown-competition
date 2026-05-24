import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Progress, Select, Space, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getMembers, getSeasons } from '../../api/seasons'
import type { Season, SeasonMember } from '../../types/models'
import { summarizeSeasonMembers } from './adminHubUtils'
import { syncAllRawData, type BatchSyncResult, type SingleSyncOutcome } from '../../api/feishu'

const statusColors: Record<Season['status'], string> = { draft: 'default', active: 'green', ended: 'red' }
const statusLabels: Record<Season['status'], string> = { draft: '草稿', active: '进行中', ended: '已结束' }

export default function AdminDataSyncHub() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchSyncResult | null>(null)

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

  async function handleBatchSync() {
    setBatchSyncing(true)
    setBatchResult(null)
    try {
      const res = await syncAllRawData()
      setBatchResult(res.data)
      const keys = ['workHours', 'stories', 'issues', 'projects'] as const
      const labels: Record<string, string> = { workHours: '工时', stories: '需求', issues: '缺陷', projects: '项目' }
      const failed = keys.filter(k => res.data[k].status === 'rejected')
      if (failed.length === 0) {
        const summary = keys.map(k => {
          const r = (res.data[k] as { status: 'fulfilled'; result: { inserted: number; updated: number } }).result
          return `${labels[k]} +${r.inserted}/~${r.updated}`
        }).join('，')
        message.success(`全部同步完成：${summary}`)
      } else {
        message.warning(`${failed.length} 项同步失败：${failed.map(k => labels[k]).join('、')}`)
      }
    } catch (e) {
      message.error('一键同步请求失败')
      console.error(e)
    } finally {
      setBatchSyncing(false)
    }
  }

  const summary = useMemo(() => summarizeSeasonMembers(members), [members])
  const ready = summary.missingRoleCount === 0 && summary.missingSubRoleCount === 0
  const configCoverage = summary.total > 0 ? Math.round((summary.configuredRoleCount / summary.total) * 100) : 0

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
        <Typography.Title level={4} style={{ margin: 0 }}>数据同步</Typography.Title>
        <Select
          value={selectedSeasonId}
          onChange={setSelectedSeasonId}
          options={seasons.map(s => ({ value: s.id, label: s.name }))}
          style={{ width: 180 }}
        />
        {(() => {
          const s = seasons.find(x => x.id === selectedSeasonId)
          return s ? <Tag color={statusColors[s.status]}>{statusLabels[s.status]}</Tag> : null
        })()}
        <Tag>{summary.total} 位成员</Tag>
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
          <Progress percent={configCoverage} size="small" style={{ width: 120, margin: 0 }} strokeColor="#52c41a" />
          <Typography.Text type="secondary">{summary.configuredRoleCount}/{summary.total} 岗位已配置，可以开始同步</Typography.Text>
        </div>
      )}

      {/* 操作按钮 */}
      <Space wrap size={10} style={{ marginBottom: batchResult ? 16 : 0 }}>
        <Button
          type="primary"
          icon={batchSyncing ? <LoadingOutlined /> : <ThunderboltOutlined />}
          loading={batchSyncing}
          onClick={handleBatchSync}
        >
          {batchSyncing ? '同步中...' : '一键同步 4 类数据'}
        </Button>
        <Button onClick={() => selectedSeasonId && navigate(`/admin/feishu/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
          进入同步执行页
        </Button>
        <Button onClick={() => navigate('/admin/members')}>成员管理</Button>
      </Space>

      {/* 同步结果 */}
      {batchResult && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 600 }}>
          {([
            { key: 'workHours' as const, label: '工时' },
            { key: 'stories' as const, label: '需求' },
            { key: 'issues' as const, label: '缺陷' },
            { key: 'projects' as const, label: '项目' },
          ]).map(({ key, label }) => {
            const outcome: SingleSyncOutcome = batchResult[key]
            const ok = outcome.status === 'fulfilled'
            const r = ok ? outcome.result : null
            return (
              <div key={key} style={{
                padding: '8px 10px', borderRadius: 8,
                background: ok ? '#f6ffed' : '#fff2f0',
                border: `1px solid ${ok ? '#b7eb8f' : '#ffccc7'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                  <strong style={{ fontSize: 13 }}>{label}</strong>
                </div>
                {ok ? (
                  <div style={{ fontSize: 12, color: '#595959' }}>
                    +{r!.inserted} / ~{r!.updated}{r!.skipped > 0 ? ` / 跳${r!.skipped}` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#ff4d4f' }}>{outcome.error}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
