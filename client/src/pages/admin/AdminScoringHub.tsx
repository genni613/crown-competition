import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Progress, Select, Space, Tag, Typography, message } from 'antd'
import { ArrowRightOutlined, CalculatorOutlined, EditOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import { getMembers, getSeasons } from '../../api/seasons'
import type { Season, SeasonMember } from '../../types/models'
import { formatDate } from '../../utils/datetime'
import { summarizeSeasonMembers } from './adminHubUtils'

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

export default function AdminScoringHub() {
  const navigate = useNavigate()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [members, setMembers] = useState<SeasonMember[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>()

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

  const roleCoverage = memberSummary.total > 0
    ? Math.round((memberSummary.configuredRoleCount / memberSummary.total) * 100)
    : 0

  const scoringReadiness = memberSummary.missingRoleCount === 0 && memberSummary.missingSubRoleCount === 0

  const scoringActions = [
    {
      key: 'role-score',
      title: '岗位分录入',
      summary: '适合按岗位集中补录、统一复核，再配合规则弹窗快速判断口径。',
      owner: '按岗位批处理',
      timing: '先做',
      destination: '产品 / 设计 / 研发',
      buttonText: '进入岗位分',
      onClick: () => selectedSeasonId && navigate(`/admin/scores/${selectedSeasonId}`),
      icon: <EditOutlined />,
      iconClassName: 'admin-hub-action-icon-primary',
    },
    {
      key: 'org-score',
      title: '组织分录入',
      summary: '适合按成员逐个补录协作贡献、专项奖励和特殊扣减，不和岗位分混录。',
      owner: '按成员逐条处理',
      timing: '后做',
      destination: '全体赛季成员',
      buttonText: '进入组织分',
      onClick: () => selectedSeasonId && navigate(`/admin/org-scores/${selectedSeasonId}`),
      icon: <CalculatorOutlined />,
      iconClassName: 'admin-hub-action-icon-warm',
    },
  ]

  if (seasons.length === 0) {
    return (
      <div className="admin-hub-shell">
        <div className="admin-hub-empty">
          <div className="admin-hub-empty-icon admin-hub-action-icon-primary">
            <EditOutlined />
          </div>
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>评分管理</Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 20px', color: '#64748b' }}>
            还没有赛季，先创建赛季，再进入岗位分和组织分录入。
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
      <section className="admin-hub-hero admin-hub-hero-scoring">
        <div className="admin-hub-hero-main">
          <div className="admin-hub-hero-kicker">Scoring Console</div>
          <Typography.Title level={3} className="admin-hub-hero-title">
            评分管理工作台
          </Typography.Title>
          <Typography.Paragraph className="admin-hub-hero-description">
            面向管理员的评分入口应先判断赛季范围和配置完整度，再决定先做岗位分还是组织分。这里把当前赛季状态、风险和操作顺序放在同一屏。
          </Typography.Paragraph>
          <Space wrap size={10}>
            <Button type="primary" onClick={() => selectedSeasonId && navigate(`/admin/scores/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
              进入岗位分录入
            </Button>
            <Button onClick={() => selectedSeasonId && navigate(`/admin/org-scores/${selectedSeasonId}`)} disabled={!selectedSeasonId}>
              进入组织分录入
            </Button>
            <Button onClick={() => navigate('/admin/members')}>成员管理</Button>
          </Space>
        </div>
        <div className="admin-hub-hero-side">
          <div className="admin-hub-readiness-card">
            <div className="admin-hub-readiness-head">
              <span>评分准备度</span>
              <Tag color={scoringReadiness ? 'green' : 'orange'}>
                {scoringReadiness ? '可开始录分' : '需先补配置'}
              </Tag>
            </div>
            <div className="admin-hub-readiness-value">{roleCoverage}%</div>
            <Progress percent={roleCoverage} showInfo={false} strokeColor="#6366f1" trailColor="#e2e8f0" />
            <div className="admin-hub-mini-list">
              <div className="admin-hub-mini-row">
                <span>已配置岗位</span>
                <strong>{memberSummary.configuredRoleCount} / {memberSummary.total}</strong>
              </div>
              <div className="admin-hub-mini-row">
                <span>未配置岗位</span>
                <strong>{memberSummary.missingRoleCount} 人</strong>
              </div>
              <div className="admin-hub-mini-row">
                <span>未配置研发子岗</span>
                <strong>{memberSummary.missingSubRoleCount} 人</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="admin-hub-toolbar">
        <div className="admin-hub-toolbar-copy">
          <Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            评分管理
          </Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 0', color: '#64748b' }}>
            当前赛季的录分入口、成员范围和待补配置都集中在这里。
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
          <div className="admin-hub-stat-label">成员范围</div>
          <div className="admin-hub-stat-value">{memberSummary.total}</div>
          <div className="admin-hub-stat-help">当前赛季已加入成员</div>
        </Card>
        <Card className="admin-hub-stat-card" styles={{ body: { padding: 18 } }}>
          <div className="admin-hub-stat-label">岗位覆盖率</div>
          <div className="admin-hub-stat-value">{roleCoverage}%</div>
          <div className="admin-hub-stat-help">{memberSummary.configuredRoleCount} / {memberSummary.total} 已配置岗位</div>
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
      </section>

      {!scoringReadiness && (
        <Alert
          showIcon
          type="warning"
          icon={<SafetyCertificateOutlined />}
          className="admin-hub-alert"
          message="当前赛季还有基础配置未完成"
          description={`未配置岗位 ${memberSummary.missingRoleCount} 人，未配置研发子岗 ${memberSummary.missingSubRoleCount} 人。建议先去成员管理补齐，再开始岗位分录入，避免管理员反复回退修正。`}
        />
      )}

      <section className="admin-hub-action-grid">
        {scoringActions.map(action => (
          <Card
            key={action.key}
            hoverable
            className="admin-hub-action-card"
            styles={{ body: { padding: 22, height: '100%' } }}
          >
            <div className="admin-hub-action-body">
              <div className="admin-hub-action-head">
                <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                  {action.title}
                </Typography.Title>
                <span className={`admin-hub-action-icon ${action.iconClassName}`}>
                  {action.icon}
                </span>
              </div>

              <Typography.Paragraph className="admin-hub-action-description">
                {action.summary}
              </Typography.Paragraph>

              <div className="admin-hub-detail-list">
                <div className="admin-hub-detail-row">
                  <span>处理方式</span>
                  <strong>{action.owner}</strong>
                </div>
                <div className="admin-hub-detail-row">
                  <span>推荐顺序</span>
                  <strong>{action.timing}</strong>
                </div>
                <div className="admin-hub-detail-row">
                  <span>适用范围</span>
                  <strong>{action.destination}</strong>
                </div>
              </div>

              <div className="admin-hub-action-footer">
                <Typography.Text className="admin-hub-action-note">
                  {action.key === 'role-score'
                    ? (scoringReadiness ? '岗位配置齐全时，优先从这里开始，能更快完成本轮赛季评分。' : '岗位或子岗未补齐时，这里容易出现口径反复，建议先补配置。')
                    : '组织分更适合作为第二步补录动作，在岗位分稳定后再逐人核对。'}
                </Typography.Text>
                <div className="admin-hub-action-buttons">
                  {action.key === 'role-score' && !scoringReadiness ? (
                    <Button onClick={() => navigate('/admin/members')}>先去补配置</Button>
                  ) : null}
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={action.onClick}
                    disabled={!selectedSeasonId}
                  >
                    {action.buttonText}
                  </Button>
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
              <TeamOutlined />
            </span>
          </div>
          <div className="admin-hub-flow-list">
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">1</div>
              <div>
                <div className="admin-hub-flow-title">检查成员配置</div>
                <div className="admin-hub-flow-copy">先确认岗位与研发子岗完整，减少后续录分回退。</div>
              </div>
            </div>
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">2</div>
              <div>
                <div className="admin-hub-flow-title">集中处理岗位分</div>
                <div className="admin-hub-flow-copy">按岗位统一录入和复核，维度规则在录分页弹窗中直接查看。</div>
              </div>
            </div>
            <div className="admin-hub-flow-item">
              <div className="admin-hub-flow-index">3</div>
              <div>
                <div className="admin-hub-flow-title">逐人补录组织分</div>
                <div className="admin-hub-flow-copy">最后处理协作加减项，更符合管理员核对习惯。</div>
              </div>
            </div>
          </div>
          <Typography.Paragraph className="admin-hub-side-note">
            评分管理不应该要求管理员自己推导顺序，所以这里直接把推荐流程显式展示出来。
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  )
}
