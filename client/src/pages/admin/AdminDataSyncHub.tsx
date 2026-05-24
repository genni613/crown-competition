import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Progress, Select, Space, Tag, Typography, message } from 'antd'
import { ArrowRightOutlined, CheckCircleOutlined, CloudSyncOutlined, CloseCircleOutlined, DatabaseOutlined, LoadingOutlined, SafetyCertificateOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons'
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

  const syncReady = memberSummary.missingRoleCount === 0 && memberSummary.missingSubRoleCount === 0
  const configCoverage = memberSummary.total > 0
    ? Math.round((memberSummary.configuredRoleCount / memberSummary.total) * 100)
    : 0

  const syncCards = [
    {
      key: 'feishu-sync',
      title: '进入同步执行页',
      summary: '需要完整执行飞书数据同步、指标回写和评分重算时，从这里进入专门执行页。',
      details: [
        { label: '覆盖链路', value: '原始数据 → 指标分 → 评分结果' },
        { label: '推荐人群', value: '管理员集中跑批' },
        { label: '当前范围', value: `${memberSummary.total} 名赛季成员` },
      ],
      note: syncReady
        ? '配置已经满足同步前提，可以直接进入执行页跑完整链路。'
        : '配置还不完整，直接同步容易出现岗位归类错误。',
      icon: <CloudSyncOutlined />,
      iconClassName: 'admin-hub-action-icon-cool',
      buttonText: '进入同步页',
      onClick: () => selectedSeasonId && navigate(`/admin/feishu/${selectedSeasonId}`),
      showSetupButton: memberSummary.missingRoleCount > 0 || memberSummary.missingSubRoleCount > 0,
    },
    {
      key: 'sync-check',
      title: '执行前检查',
      summary: '同步前先确认成员配置是否完整，避免跑完之后再返工处理错误归类。',
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
      <section className="admin-hub-hero admin-hub-hero-sync">
        <div className="admin-hub-hero-main">
          <div className="admin-hub-hero-kicker">Data Sync Console</div>
          <Typography.Title level={3} className="admin-hub-hero-title">
            数据同步工作台
          </Typography.Title>
          <Typography.Paragraph className="admin-hub-hero-description">
            管理员真正关心的是“这次能不能同步”“范围对不对”“跑完下一步去哪”。这里把赛季范围、配置风险和主要动作压缩成一个控制台。
          </Typography.Paragraph>
          <Space wrap size={10}>
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
        </div>
        <div className="admin-hub-hero-side">
          <div className="admin-hub-readiness-card">
            <div className="admin-hub-readiness-head">
              <span>同步准备度</span>
              <Tag color={syncReady ? 'green' : 'orange'}>
                {syncReady ? '可直接执行' : '需先补配置'}
              </Tag>
            </div>
            <div className="admin-hub-readiness-value">{configCoverage}%</div>
            <Progress percent={configCoverage} showInfo={false} strokeColor="#06b6d4" trailColor="#e2e8f0" />
            <div className="admin-hub-mini-list">
              <div className="admin-hub-mini-row">
                <span>当前赛季成员</span>
                <strong>{memberSummary.total} 人</strong>
              </div>
              <div className="admin-hub-mini-row">
                <span>岗位已配置</span>
                <strong>{memberSummary.configuredRoleCount} 人</strong>
              </div>
              <div className="admin-hub-mini-row">
                <span>待补配置</span>
                <strong>{memberSummary.missingRoleCount + memberSummary.missingSubRoleCount} 项</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          <div className="admin-hub-stat-label">配置覆盖率</div>
          <div className="admin-hub-stat-value">{configCoverage}%</div>
          <div className="admin-hub-stat-help">{memberSummary.configuredRoleCount} / {memberSummary.total} 成员已具备同步前提</div>
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

      {!syncReady && (
        <Alert
          showIcon
          type="warning"
          icon={<SafetyCertificateOutlined />}
          className="admin-hub-alert"
          message="当前赛季还不适合直接执行同步"
          description={`未配置岗位 ${memberSummary.missingRoleCount} 人，未配置研发子岗 ${memberSummary.missingSubRoleCount} 人。建议先补齐成员配置，再跑同步和评分链路，避免指标写入错误岗位。`}
        />
      )}

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
              并行同步工时、需求、缺陷、项目 4 类原始数据。这个入口适合管理员做“先探测一次原始数据是否正常”的快速动作。
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
                {card.summary}
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
              管理员建议顺序
            </Typography.Title>
            <span className="admin-hub-action-icon admin-hub-action-icon-neutral">
              <DatabaseOutlined />
            </span>
          </div>
          <div className="admin-hub-flow-list">
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">1</div>
              <div>
                <div className="admin-hub-flow-title">先检查成员配置</div>
                <div className="admin-hub-flow-copy">确认岗位和研发子岗完整，否则同步结果容易失真。</div>
              </div>
            </div>
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">2</div>
              <div>
                <div className="admin-hub-flow-title">先跑原始数据同步</div>
                <div className="admin-hub-flow-copy">用一键同步快速判断飞书侧数据是否正常落库。</div>
              </div>
            </div>
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">3</div>
              <div>
                <div className="admin-hub-flow-title">再进执行页跑完整链路</div>
                <div className="admin-hub-flow-copy">包括指标分回写、评分重算和后续复核。</div>
              </div>
            </div>
          </div>
          <Typography.Paragraph className="admin-hub-side-note">
            管理员需要的是“少判断、少返工”，所以把执行顺序直接做成工作流提示，而不是散在几张说明卡里。
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  )
}
