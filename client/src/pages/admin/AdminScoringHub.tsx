import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Select, Tag, Typography, message } from 'antd'
import { ArrowRightOutlined, CalculatorOutlined, EditOutlined, TeamOutlined } from '@ant-design/icons'
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

  const scoringActions = [
    {
      key: 'role-score',
      title: '岗位分录入',
      description: '按岗位批量处理管理员录分项，适合统一补录、复核和重算前检查。',
      details: [
        { label: '处理对象', value: '产品 / 设计 / 研发' },
        { label: '推荐场景', value: '批量录入、统一修正、集中复核' },
        { label: '当前覆盖', value: `${memberSummary.configuredRoleCount} / ${memberSummary.total} 人已配置岗位` },
      ],
      note: memberSummary.missingRoleCount > 0
        ? `还有 ${memberSummary.missingRoleCount} 名成员未配置岗位，建议先补齐。`
        : '岗位配置已齐，可以直接进入岗位分录入。',
      icon: <EditOutlined />,
      iconClassName: 'admin-hub-action-icon-primary',
      buttonText: '进入岗位分',
      onClick: () => selectedSeasonId && navigate(`/admin/scores/${selectedSeasonId}`),
      showSetupButton: memberSummary.missingRoleCount > 0 || memberSummary.missingSubRoleCount > 0,
    },
    {
      key: 'org-score',
      title: '组织分录入',
      description: '按成员处理组织分加减项，适合补录协作、贡献和特殊事项。',
      details: [
        { label: '处理方式', value: '先选成员，再录入具体规则' },
        { label: '推荐场景', value: '逐人补录、核对额外加扣分' },
        { label: '成员范围', value: `${memberSummary.total} 名赛季成员` },
      ],
      note: '组织分入口更适合按成员逐个处理，不和岗位分混在一起。',
      icon: <CalculatorOutlined />,
      iconClassName: 'admin-hub-action-icon-warm',
      buttonText: '进入组织分',
      onClick: () => selectedSeasonId && navigate(`/admin/org-scores/${selectedSeasonId}`),
      showSetupButton: false,
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
          <div className="admin-hub-stat-label">岗位覆盖</div>
          <div className="admin-hub-stat-value">{memberSummary.configuredRoleCount} / {memberSummary.total}</div>
          <div className="admin-hub-stat-help">已配置岗位成员</div>
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
                {action.description}
              </Typography.Paragraph>

              <div className="admin-hub-detail-list">
                {action.details.map(detail => (
                  <div key={detail.label} className="admin-hub-detail-row">
                    <span>{detail.label}</span>
                    <strong>{detail.value}</strong>
                  </div>
                ))}
              </div>

              <div className="admin-hub-action-footer">
                <Typography.Text className="admin-hub-action-note">{action.note}</Typography.Text>
                <div className="admin-hub-action-buttons">
                  {action.showSetupButton ? (
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
              当前赛季检查
            </Typography.Title>
            <span className="admin-hub-action-icon admin-hub-action-icon-neutral">
              <TeamOutlined />
            </span>
          </div>
          <div className="admin-hub-detail-list">
            <div className="admin-hub-detail-row">
              <span>产品成员</span>
              <strong>{memberSummary.productCount} 人</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>设计成员</span>
              <strong>{memberSummary.designCount} 人</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>研发成员</span>
              <strong>{memberSummary.techCount} 人</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>未配置岗位</span>
              <strong>{memberSummary.missingRoleCount} 人</strong>
            </div>
            <div className="admin-hub-detail-row">
              <span>未配置研发子岗</span>
              <strong>{memberSummary.missingSubRoleCount} 人</strong>
            </div>
          </div>
          <Typography.Paragraph className="admin-hub-side-note">
            建议先保证成员岗位和研发子岗配置完整，再做岗位分录入；组织分可以按成员逐个补录。
          </Typography.Paragraph>
        </Card>
      </section>
    </div>
  )
}
