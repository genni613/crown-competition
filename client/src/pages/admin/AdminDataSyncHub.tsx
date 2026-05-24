import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Select, Tag, Typography, message } from 'antd'
import { ArrowRightOutlined, CloudSyncOutlined, DatabaseOutlined, TeamOutlined, ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import { getMembers, getSeasons } from '../../api/seasons'
import type { Season, SeasonMember } from '../../types/models'
import { formatDate } from '../../utils/datetime'
import { summarizeSeasonMembers } from './adminHubUtils'
import { syncAllRawData, type BatchSyncResult, type SingleSyncOutcome } from '../../api/feishu'

const statusColors: Record<Season['status'], string> = {
  draft: 'default',
  active: 'green',
  ended: 'red',
}

const statusLabels: Record<Season['status'], string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
}

const seasonTagStyle = {
  marginInlineEnd: 0,
  paddingInline: 10,
  height: 32,
  lineHeight: '30px',
  borderRadius: 8,
} as const

export default function AdminDataSyncHub() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchSyncResult | null>(null)

  async function handleBatchSync() {
    setBatchSyncing(true)
    setBatchResult(null)
    try {
      const res = await syncAllRawData()
      setBatchResult(res.data)
      const keys = ['workHours', 'stories', 'issues', 'projects'] as const
      const labels: Record<string, string> = { workHours: '工时', stories: '需求', issues: '缺陷', projects: '项目' }
      const failed = keys.filter(k => res.data[k].status === 'rejected')
      const succeeded = keys.filter(k => res.data[k].status === 'fulfilled')
      if (failed.length === 0) {
        const summary = succeeded.map(k => {
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

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!selectedSeasonId) {
      setMembers([])
      return
    }
    void loadMembers(selectedSeasonId)
  }, [selectedSeasonId])

  async function loadData() {
    try {
      const res = await getSeasons()
      setSeasons(res.data)
      const activeSeason = res.data.find(item => item.status === 'active')
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

  const selectedSeason = useMemo(
    () => seasons.find(item => item.id === selectedSeasonId),
    [seasons, selectedSeasonId],
  )

  const memberSummary = useMemo(
    () => summarizeSeasonMembers(members),
    [members],
  )

  const syncCards = [
    {
      key: 'feishu-sync',
      title: '进入同步执行页',
      description: '统一处理工时、需求、缺陷、项目、用户同步，以及指标分回写和评分重算。',
      details: [
        { label: '原始数据', value: '工时 / 需求 / 缺陷 / 项目 / 用户' },
        { label: '评分链路', value: '写入 indicator_scores 后重算' },
        { label: '推荐顺序', value: '原始数据 → 指标分同步 → 评分重算' },
      ],
      note: memberSummary.total > 0
        ? `当前赛季同步范围为 ${memberSummary.total} 名成员。`
        : '当前赛季还没有成员，同步前建议先确认成员范围。',
      icon: <CloudSyncOutlined />,
      iconClassName: 'admin-hub-action-icon-cool',
      buttonText: '进入同步页',
      onClick: () => selectedSeasonId && navigate(`/admin/feishu/${selectedSeasonId}`),
      showSetupButton: memberSummary.missingRoleCount > 0 || memberSummary.missingSubRoleCount > 0,
    },
    {
      key: 'sync-check',
      title: '执行前检查',
      description: '同步前先确认成员配置是否完整，避免出现岗位归属不清或研发子岗缺失的问题。',
      details: [
        { label: '未配置岗位', value: `${memberSummary.missingRoleCount} 人` },
        { label: '未配置研发子岗', value: `${memberSummary.missingSubRoleCount} 人` },
        { label: '研发分布', value: `${memberSummary.clientCount} / ${memberSummary.frontendCount} / ${memberSummary.backendCount}` },
      ],
      note: memberSummary.missingRoleCount > 0 || memberSummary.missingSubRoleCount > 0
        ? '建议先去成员管理补齐配置，再执行同步。'
        : '成员岗位信息已经齐全，可以直接开始同步。',
      icon: <TeamOutlined />,
      iconClassName: 'admin-hub-action-icon-neutral',
      onClick: undefined,
      buttonText: '',
      showSetupButton: true,
    },
  ]

  if (seasons.length === 0) {
    return (
      <div className="admin-hub-shell">
        <div className="admin-hub-empty">
          <div className="admin-hub-empty-icon admin-hub-action-icon-cool">
            <CloudSyncOutlined />
          </div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>数据同步</Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 20px', color: '#64748b' }}>
            先创建赛季，再进入飞书数据同步和评分重算链路。
          </Typography.Paragraph>
          <Button type="primary" onClick={() => navigate('/admin/seasons')}>
            去赛季管理
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-hub-shell">
      <section className="admin-hub-toolbar">
        <div className="admin-hub-toolbar-copy">
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            数据同步
          </Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 0', color: '#64748b' }}>
            先确认当前赛季的成员和岗位配置，再进入同步执行页跑完整条数据链路。
          </Typography.Paragraph>
        </div>

        <div className="admin-hub-toolbar-side">
          <div className="admin-hub-toolbar-controls">
            <Select
              size="middle"
              value={selectedSeasonId}
              onChange={setSelectedSeasonId}
              options={seasons.map(season => ({
                value: season.id,
                label: season.name,
              }))}
              style={{ width: 220 }}
            />
            <Button onClick={() => navigate('/admin/members')}>成员管理</Button>
            <Button onClick={() => navigate('/admin/seasons')}>赛季管理</Button>
          </div>
        </div>
      </section>

      {selectedSeason && (
        <div className="admin-hub-season-tags">
          <Tag color={statusColors[selectedSeason.status]} style={seasonTagStyle}>
            {statusLabels[selectedSeason.status]}
          </Tag>
          <Tag style={seasonTagStyle}>{selectedSeason.name}</Tag>
          <Tag style={seasonTagStyle}>
            {formatDate(selectedSeason.start_date)} ~ {formatDate(selectedSeason.end_date)}
          </Tag>
        </div>
      )}

      <section className="admin-hub-stat-grid">
        <Card className="admin-hub-stat-card" styles={{ body: { padding: 18 } }}>
          <div className="admin-hub-stat-label">同步范围</div>
          <div className="admin-hub-stat-value">{memberSummary.total}</div>
          <div className="admin-hub-stat-help">当前赛季成员数</div>
        </Card>
        <Card className="admin-hub-stat-card" styles={{ body: { padding: 18 } }}>
          <div className="admin-hub-stat-label">岗位分布</div>
          <div className="admin-hub-stat-value">{memberSummary.productCount} / {memberSummary.designCount} / {memberSummary.techCount}</div>
          <div className="admin-hub-stat-help">产品 / 设计 / 研发</div>
        </Card>
        <Card className="admin-hub-stat-card" styles={{ body: { padding: 18 } }}>
          <div className="admin-hub-stat-label">待补配置</div>
          <div className="admin-hub-stat-value">{memberSummary.missingRoleCount}</div>
          <div className="admin-hub-stat-help">
            {memberSummary.missingSubRoleCount > 0
              ? `另有 ${memberSummary.missingSubRoleCount} 名研发未设置子岗`
              : '未配置岗位成员'}
          </div>
        </Card>
        <Card className="admin-hub-stat-card" styles={{ body: { padding: 18 } }}>
          <div className="admin-hub-stat-label">同步模块</div>
          <div className="admin-hub-stat-value">6 类</div>
          <div className="admin-hub-stat-help">工时 / 需求 / 缺陷 / 项目 / 用户 / 评分</div>
        </Card>
      </section>

      <section className="admin-hub-action-grid">
        <Card className="admin-hub-action-card" styles={{ body: { padding: 22, height: '100%' } }}>
          <div className="admin-hub-action-body">
            <div className="admin-hub-action-head">
              <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                一键同步原始数据
              </Typography.Title>
              <span className="admin-hub-action-icon admin-hub-action-icon-cool">
                <ThunderboltOutlined />
              </span>
            </div>

            <Typography.Paragraph className="admin-hub-action-description">
              并行同步工时、需求、缺陷、项目 4 类原始数据，同步完成后显示各项新增和更新数量。
            </Typography.Paragraph>

            <div style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={batchSyncing ? <LoadingOutlined /> : <ThunderboltOutlined />}
                loading={batchSyncing}
                onClick={handleBatchSync}
                size="large"
                block
              >
                {batchSyncing ? '同步中...' : '一键同步 4 类数据'}
              </Button>
            </div>

            {batchResult && (
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: ok ? '#f6ffed' : '#fff2f0',
                        border: `1px solid ${ok ? '#b7eb8f' : '#ffccc7'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          {ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                          <strong style={{ fontSize: 13 }}>{label}</strong>
                        </div>
                        {ok ? (
                          <div style={{ fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                            <div>新增: <strong>{r!.inserted}</strong></div>
                            <div>更新: <strong>{r!.updated}</strong></div>
                            {r!.skipped > 0 && <div>跳过: {r!.skipped}</div>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#ff4d4f' }}>{outcome.error}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
        {syncCards.map(card => (
          <Card
            key={card.key}
            hoverable={Boolean(card.onClick)}
            className={card.onClick ? 'admin-hub-action-card' : 'admin-hub-side-card'}
            styles={{ body: { padding: 22, height: '100%' } }}
          >
            <div className="admin-hub-action-body">
              <div className="admin-hub-action-head">
                <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                  {card.title}
                </Typography.Title>
                <span className={`admin-hub-action-icon ${card.iconClassName}`}>
                  {card.icon}
                </span>
              </div>

              <Typography.Paragraph className="admin-hub-action-description">
                {card.description}
              </Typography.Paragraph>

              <div className="admin-hub-detail-list">
                {card.details.map(detail => (
                  <div key={detail.label} className="admin-hub-detail-row">
                    <span>{detail.label}</span>
                    <strong>{detail.value}</strong>
                  </div>
                ))}
              </div>

              <div className="admin-hub-action-footer">
                <Typography.Text className="admin-hub-action-note">{card.note}</Typography.Text>
                <div className="admin-hub-action-buttons">
                  {card.showSetupButton ? (
                    <Button onClick={() => navigate('/admin/members')}>先去补配置</Button>
                  ) : null}
                  {card.onClick ? (
                    <Button
                      type="primary"
                      icon={<ArrowRightOutlined />}
                      onClick={card.onClick}
                      disabled={!selectedSeasonId}
                    >
                      {card.buttonText}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        ))}

        <Card className="admin-hub-side-card" styles={{ body: { padding: 22 } }}>
          <div className="admin-hub-action-head">
            <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
              同步范围提示
            </Typography.Title>
            <span className="admin-hub-action-icon admin-hub-action-icon-neutral">
              <DatabaseOutlined />
            </span>
          </div>
          <div className="admin-hub-detail-list">
            <div className="admin-hub-detail-row">
              <span>成员来源</span>
              <strong>赛季成员表</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>时间范围</span>
              <strong>{selectedSeason ? `${formatDate(selectedSeason.start_date)} ~ ${formatDate(selectedSeason.end_date)}` : '-'}</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>评分写入</span>
              <strong>indicator_scores</strong>
            </div>
          </div>
          <Typography.Paragraph className="admin-hub-side-note">
            这里不是介绍页，而是同步执行前的检查位。确认成员范围、岗位配置和赛季时间都正确后，再进入同步页执行。
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  )
}
